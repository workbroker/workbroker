// Leitura de planilhas (.xlsx / .csv) e criação de .zip direto no navegador, sem bibliotecas externas.

const ArquivosLite = (() => {
  // ---------- ZIP: leitura ----------
  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function lerZip(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer), dv = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const td = new TextDecoder(), out = {};
    for (let k = 0; k < n; k++) {
      const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const nome = td.decode(u8.subarray(p + 46, p + 46 + nl));
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
      const ini = off + 30 + lnl + lel, dados = u8.subarray(ini, ini + tam);
      out[nome] = { metodo, dados };
      p += 46 + nl + el + cl;
    }
    out.ler = async nome => { const e = out[nome]; if (!e) return null; const b = e.metodo === 8 ? await inflar(e.dados) : e.dados; return td.decode(b); };
    return out;
  }

  // Extrai os arquivos de um .zip grande sem carregar tudo na memória (lê só o índice e fatia o arquivo).
  async function extrairZip(file) {
    const tamTotal = file.size, cauda = Math.min(tamTotal, 66000);
    const fim = new DataView(await file.slice(tamTotal - cauda).arrayBuffer());
    let eocd = -1;
    for (let i = cauda - 22; i >= 0; i--) if (fim.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error(`${file.name}: .zip inválido`);
    const n = fim.getUint16(eocd + 10, true), tamCd = fim.getUint32(eocd + 12, true), offCd = fim.getUint32(eocd + 16, true);
    const cd = new DataView(await file.slice(offCd, offCd + tamCd).arrayBuffer()), td = new TextDecoder(), out = [];
    let p = 0;
    for (let k = 0; k < n; k++) {
      const flags = cd.getUint16(p + 8, true), metodo = cd.getUint16(p + 10, true), tam = cd.getUint32(p + 20, true);
      const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
      const nb = new Uint8Array(cd.buffer, p + 46, nl);
      const nome = (flags & 0x800) ? td.decode(nb) : new TextDecoder('ibm866').decode(nb);
      p += 46 + nl + el + cl;
      if (nome.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(nome)) continue;
      out.push({ nome: nome.split('/').pop(), metodo, off, tam });
    }
    for (const e of out) {
      const lh = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
      const ini = e.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), bruto = file.slice(ini, ini + e.tam);
      e.blob = e.metodo === 8 ? await new Response(bruto.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
        : e.metodo === 0 ? bruto : null;
    }
    return out.filter(e => e.blob).map(e => ({ nome: e.nome, blob: e.blob }));
  }

  // ---------- XLSX ----------
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  async function lerXlsx(arrayBuffer) {
    const z = await lerZip(arrayBuffer), dp = new DOMParser();
    const ss = await z.ler('xl/sharedStrings.xml');
    const strings = ss ? [...dp.parseFromString(ss, 'application/xml').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    // primeira planilha do arquivo
    let alvo = 'xl/worksheets/sheet1.xml';
    try {
      const wb = dp.parseFromString(await z.ler('xl/workbook.xml'), 'application/xml');
      const rid = wb.getElementsByTagName('sheet')[0]?.getAttribute('r:id');
      const rels = dp.parseFromString(await z.ler('xl/_rels/workbook.xml.rels'), 'application/xml');
      const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
      if (rel) alvo = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
    } catch {}
    const xml = await z.ler(alvo) || await z.ler(Object.keys(z).find(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)));
    if (!xml) throw new Error('Não encontrei a planilha dentro do arquivo');
    const doc = dp.parseFromString(xml, 'application/xml'), linhas = [];
    for (const row of doc.getElementsByTagName('row')) {
      const l = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let val = v;
        if (t === 's') val = strings[+v] ?? '';
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        l[colIdx(c.getAttribute('r') || 'A1')] = String(val).trim();
      }
      linhas.push(Array.from(l, x => x ?? ''));
    }
    return linhas;
  }
  function lerCsv(texto) {
    const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).map(l => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      out.push(cur.trim()); return out;
    });
  }
  async function lerPlanilha(file) {
    const buf = await file.arrayBuffer();
    if (/\.xlsx$/i.test(file.name) || new Uint8Array(buf.slice(0, 2))[0] === 0x50) return lerXlsx(buf);
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    return lerCsv(txt);
  }

  // ---------- ZIP: escrita (sem compressão) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // Monta o .zip aos poucos: cada arquivo vira um Blob assim que é adicionado (não acumula tudo na memória).
  function novoZip() {
    const te = new TextEncoder(), partes = [], central = []; let off = 0, qtd = 0;
    const agora = new Date(), dt = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate(), hr = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    return {
      add(nomeTxt, dadosIn) {
        const nome = te.encode(nomeTxt), dados = typeof dadosIn === 'string' ? te.encode(dadosIn) : dadosIn, crc = crc32(dados);
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
        lh.setUint16(10, hr, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true);
        lh.setUint16(26, nome.length, true); lh.setUint16(28, 0, true);
        partes.push(new Blob([lh.buffer, nome, dados]));
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
        ch.setUint16(12, hr, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true);
        ch.setUint16(28, nome.length, true); ch.setUint32(42, off, true);
        central.push(new Uint8Array(ch.buffer), nome);
        off += 30 + nome.length + dados.length; qtd++;
      },
      blob() {
        const tamCentral = central.reduce((s, x) => s + x.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, qtd, true); end.setUint16(10, qtd, true);
        end.setUint32(12, tamCentral, true); end.setUint32(16, off, true);
        return new Blob([...partes, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
      }
    };
  }
  function criarZip(arquivos) { const z = novoZip(); arquivos.forEach(a => z.add(a.nome, a.dados)); return z.blob(); }

  // ---------- E-mail .eml (abre no Outlook como mensagem nova, pronta para enviar) ----------
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  const b64txt = t => b64(new TextEncoder().encode(t));
  const quebrar = s => s.replace(/.{1,76}/g, '$&\r\n');
  const cab = t => /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${b64txt(t)}?=`;
  function criarEml({ para, assunto, texto, html, anexo }) { // anexo: { nome, dados: Uint8Array, tipo }
    const B1 = 'rw_mix_' + Math.random().toString(36).slice(2), B2 = 'rw_alt_' + Math.random().toString(36).slice(2), L = '\r\n';
    let m = `To: ${para}${L}Subject: ${cab(assunto)}${L}X-Unsent: 1${L}MIME-Version: 1.0${L}Content-Type: multipart/mixed; boundary="${B1}"${L}${L}`;
    m += `--${B1}${L}Content-Type: multipart/alternative; boundary="${B2}"${L}${L}`;
    m += `--${B2}${L}Content-Type: text/plain; charset=UTF-8${L}Content-Transfer-Encoding: base64${L}${L}${quebrar(b64txt(texto))}`;
    m += `--${B2}${L}Content-Type: text/html; charset=UTF-8${L}Content-Transfer-Encoding: base64${L}${L}${quebrar(b64txt(html))}`;
    m += `--${B2}--${L}`;
    if (anexo) m += `--${B1}${L}Content-Type: ${anexo.tipo || 'application/pdf'}; name="${anexo.nome}"${L}Content-Disposition: attachment; filename="${anexo.nome}"${L}Content-Transfer-Encoding: base64${L}${L}${quebrar(b64(anexo.dados))}`;
    m += `--${B1}--${L}`;
    return m;
  }

  return { lerPlanilha, extrairZip, novoZip, criarZip, criarEml };
})();
