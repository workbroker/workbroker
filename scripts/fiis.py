"""Indicadores de todos os FIIs listados -> fiis.json (duas vezes por dia)
- CVM (dados abertos, informe mensal): nome, segmento, gestão, administrador,
  valor patrimonial por cota (hoje e 12 meses antes), patrimônio e cotistas.
- Fundos.NET (B3): fatos relevantes, comunicados, assembleias e o último relatório gerencial (150 dias).
- Yahoo Finance (gráfico semanal de 2 anos): cotação atual, no início do ano e 12 meses antes,
  volume médio e rendimentos pagos (por mês da data-com).
Os sinais (pontos críticos e bons) são calculados no site, a partir destes dados.
Roda no GitHub Actions; o arquivo vai para o ramo "dados" (sem histórico)."""
import csv, io, json, os, sys, time, zipfile, http.cookiejar, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "fiis.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
BRT = timezone(timedelta(hours=-3))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get(url, timeout=60):
    return opener.open(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def num(x):
    try:
        v = float(str(x).strip().replace(",", "."))
        return v if v == v else None
    except Exception:
        return None


# ---------- CVM ----------
def ler_zip(url):
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=180)))
    return {nm: list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";")) for nm in z.namelist()}


def col(row, nome, *partes):
    if nome in row:
        return row[nome]
    for k in row:
        if all(p.lower() in k.lower() for p in partes):
            return row[k]
    return None


def versao_final(linhas):
    """Fica com a última versão de cada (fundo, data de referência)."""
    m = {}
    for l in linhas:
        k = (l.get("CNPJ_Fundo_Classe") or l.get("CNPJ_Fundo"), l.get("Data_Referencia"))
        if not k[0] or not k[1]:
            continue
        v = num(l.get("Versao")) or 0
        if k not in m or v >= (num(m[k].get("Versao")) or 0):
            m[k] = l
    return m


def dados_cvm(debug):
    ano = datetime.now(BRT).year
    geral, comp = [], []
    for a in (ano - 1, ano):
        try:
            for nm, linhas in ler_zip(f"https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{a}.zip").items():
                if "geral" in nm: geral += linhas
                elif "complemento" in nm: comp += linhas
        except Exception as e:
            log("cvm mensal", a, e)
    debug["n_geral"], debug["n_comp"] = len(geral), len(comp)
    G, C = versao_final(geral), versao_final(comp)
    cad = {}   # cnpj -> linha mais recente do "geral"
    for (cn, d), l in G.items():
        if cn not in cad or d > cad[cn].get("Data_Referencia", ""):
            cad[cn] = l
    hist = {}  # cnpj -> {AAAA-MM: (vp, pl, cotistas)}
    for (cn, d), l in C.items():
        vp = num(col(l, "Valor_Patrimonial_Cotas", "Patrimonial", "Cota"))
        pl = num(col(l, "Patrimonio_Liquido", "Patrimonio_Liquido"))
        ct = num(col(l, "Total_Numero_Cotistas", "Total", "Cotistas"))
        if vp:
            hist.setdefault(cn, {})[d[:7]] = (vp, pl, ct)
    fundos = {}
    for cn, l in cad.items():
        isin = (l.get("Codigo_ISIN") or "").strip().upper()
        if len(isin) < 7 or not isin.startswith("BR") or (l.get("Mercado_Negociacao_Bolsa") or "").strip().upper() != "S":
            continue
        t = isin[2:6] + "11"
        h = hist.get(cn, {})
        if not h:
            continue
        meses = sorted(h)
        ult = meses[-1]
        a12 = (datetime.strptime(ult + "-01", "%Y-%m-%d") - timedelta(days=360)).strftime("%Y-%m")
        m12 = next((m for m in meses if m >= a12), None)
        reg = {
            "nome": (l.get("Nome_Fundo_Classe") or l.get("Nome_Fundo") or "").strip(), "cnpj": "".join(ch for ch in cn if ch.isdigit()),
            "seg": (l.get("Segmento_Atuacao") or "").strip(), "mandato": (l.get("Mandato") or "").strip(),
            "gestao": (l.get("Tipo_Gestao") or "").strip(), "adm": (l.get("Nome_Administrador") or "").strip(),
            "vp": h[ult][0], "vp_ref": ult, "pl": h[ult][1], "cot": h[ult][2],
            "vp12": h[m12][0] if m12 and m12 != ult else None, "vp12_ref": m12 if m12 != ult else None,
        }
        if t not in fundos or reg["vp_ref"] > fundos[t]["vp_ref"]:
            fundos[t] = reg
    return fundos


# ---------- Yahoo ----------
def grafico(simbolo):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{simbolo}?range=2y&interval=1wk&events=div"
    for tentativa in range(3):
        try:
            r = json.loads(get(url, timeout=30))["chart"]["result"][0]
            return r
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 + tentativa * 3)
        except Exception:
            time.sleep(2 + tentativa * 3)
    return None


def mercado(t):
    r = grafico(t + ".SA")
    if not r:
        return None
    meta = r.get("meta", {})
    ts = r.get("timestamp") or []
    q = (r.get("indicators", {}).get("quote") or [{}])[0]
    fech, vol = q.get("close") or [], q.get("volume") or []
    pts = [(datetime.fromtimestamp(a, BRT), c, v or 0) for a, c, v in zip(ts, fech, vol) if c]
    preco = meta.get("regularMarketPrice") or (pts[-1][1] if pts else None)
    if not preco or not pts:
        return None
    hoje = datetime.now(BRT)
    ini_ano = datetime(hoje.year, 1, 1, tzinfo=BRT)
    antes = lambda lim: next((c for d, c, _ in reversed(pts) if d < lim), None)
    rec = [c * v / 5 for d, c, v in pts[-9:-1] if v]  # média diária aproximada das últimas 8 semanas
    divs = {}
    for ev in (r.get("events", {}).get("dividends") or {}).values():
        d = datetime.fromtimestamp(ev["date"], BRT).strftime("%Y-%m")
        divs[d] = round(divs.get(d, 0) + float(ev["amount"]), 4)
    ult_neg = pts[-1][0]
    return {
        "p": round(preco, 2), "p_ano": antes(ini_ano), "p12": antes(hoje - timedelta(days=365)),
        "vol": round(sum(rec) / len(rec)) if rec else None,
        "r": sorted(divs.items(), reverse=True)[:14],
        "neg": ult_neg.strftime("%Y-%m-%d"),
    }


# ---------- Fundos.NET (B3): fatos relevantes, comunicados, assembleias, relatório gerencial ----------
FNET = "https://fnet.bmfbovespa.com.br/fnet/publico/"
FNET_H = dict(UA, **{"X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01",
                     "Referer": FNET + "abrirGerenciadorDocumentosCVM"})
FNET_ERROS = []
FNET_AMOSTRA = []


def documentos(cnpj):
    hoje = datetime.now(BRT)
    q = {"d": 1, "s": 0, "l": 60, "o[0][dataEntrega]": "desc", "cnpjFundo": cnpj, "idCategoriaDocumento": 0,
         "idTipoDocumento": 0, "idEspecieDocumento": 0, "tipoFundo": 1,
         "dataInicial": (hoje - timedelta(days=150)).strftime("%d/%m/%Y"), "dataFinal": hoje.strftime("%d/%m/%Y")}
    url = FNET + "pesquisarGerenciadorDocumentosDados?" + urllib.parse.urlencode(q)
    for tentativa in range(3):
        try:
            dados = json.loads(opener.open(urllib.request.Request(url, headers=FNET_H), timeout=30).read()).get("data") or []
            break
        except Exception as e:
            if tentativa == 2:
                if len(FNET_ERROS) < 5: FNET_ERROS.append(f"{cnpj}: {e}")
                return None
            time.sleep(2 + tentativa * 3)
    out, gerencial = [], None
    if dados and len(FNET_AMOSTRA) < 3:
        FNET_AMOSTRA.append({k: v for k, v in dados[0].items() if k in ("categoriaDocumento", "tipoDocumento", "especieDocumento", "dataEntrega", "dataReferencia", "informacoesAdicionais", "id", "descricaoFundo")})
    for d in dados:
        cat = (d.get("categoriaDocumento") or "").strip()
        tipo = (d.get("tipoDocumento") or "").strip()
        esp = (d.get("especieDocumento") or "").strip()
        if not d.get("id") or "Informe" in cat or "Demonstra" in cat or "Listagem" in cat:
            continue
        if "Estruturado" in cat:
            continue  # avisos de rendimento do mês: o valor já aparece nos rendimentos
        ent = (d.get("dataEntrega") or "").strip()  # dd/mm/aaaa hh:mm
        try:
            data = datetime.strptime(ent[:10], "%d/%m/%Y").strftime("%Y-%m-%d")
        except Exception:
            continue
        inf = " ".join((d.get("informacoesAdicionais") or "").split())
        if inf.endswith(";") and len(inf) < 30:
            inf = ""  # é só o nome de pregão
        reg = [data, cat, tipo, esp, inf[:180], d["id"]]
        if "Relat" in cat or "Gerencial" in tipo:
            if "Gerencial" in tipo or "Gerencial" in cat:
                if gerencial is None:
                    gerencial = reg
            continue
        out.append(reg)
    out = out[:12]
    if gerencial:
        out.append(gerencial)
    return out


def texto_documento(id_doc):
    """Baixa o documento do Fundos.NET e devolve o começo do texto (para resumir fatos relevantes e comunicados)."""
    import base64, html as htmlmod, re
    try:
        bruto = opener.open(urllib.request.Request(FNET + f"downloadDocumento?id={id_doc}", headers=dict(UA, Referer=FNET + "abrirGerenciadorDocumentosCVM")), timeout=40).read()
    except Exception as e:
        return None, f"download: {e}"
    dados = bruto.strip().strip(b'"')
    if not dados.startswith(b"%PDF") and not dados[:200].lstrip().startswith(b"<"):
        try:
            dec = base64.b64decode(dados, validate=False)
            if dec[:4] == b"%PDF" or dec[:200].lstrip().startswith(b"<"):
                dados = dec
        except Exception:
            pass
    txt = ""
    if dados.startswith(b"%PDF"):
        try:
            from pypdf import PdfReader
            r = PdfReader(io.BytesIO(dados))
            txt = " ".join((pg.extract_text() or "") for pg in r.pages[:2])
        except Exception as e:
            return None, f"pdf: {e}"
    else:
        try:
            h = dados.decode("utf-8")
        except UnicodeDecodeError:
            h = dados.decode("latin-1")
        h = re.sub(r"(?is)<(script|style).*?</\1>", " ", h)
        txt = htmlmod.unescape(re.sub(r"<[^>]+>", " ", h))
    txt = " ".join(txt.split())
    return txt, None


def resumir(txt):
    import re
    if not txt:
        return ""
    m = re.search(r"(?i)(fato relevante|comunicado ao mercado|aviso aos cotistas)\s*[:\-–]?\s*", txt)
    corpo = txt[m.end():] if m and m.start() < 1500 else txt
    # pula o cabeçalho típico ("A XXX, administradora do ..., vem comunicar aos cotistas e ao mercado que ...")
    m2 = re.search(r"(?i)\b(vem|vêm|informa|comunica|esclarece)\b", corpo[:900])
    if m2:
        m3 = re.search(r"(?i)\bque\b|o seguinte\s*:|:", corpo[m2.end():m2.end() + 350])
        if m3:
            corpo = corpo[m2.end() + m3.end():]
    corpo = re.sub(r"\s*[A-ZÀ-Ú][\wÀ-ú]+(?: [\wÀ-ú]+){0,3}, \d{1,2}º? de [a-zç]+ de \d{4}.*$", "", corpo)
    corpo = corpo.strip(" :;,.-–")
    if len(corpo) > 330:
        corte = corpo[:330]
        ponto = corte.rfind(". ")
        corpo = corte[:ponto + 1] if ponto > 120 else corte.rsplit(" ", 1)[0] + "…"
    return corpo[:1].upper() + corpo[1:] if corpo else ""


def main():
    hoje = datetime.now(BRT)
    if os.path.exists(SAIDA) and not os.environ.get("FORCAR"):
        try:
            ant = json.load(open(SAIDA, encoding="utf-8"))
            ger = datetime.fromisoformat(ant.get("gerado"))
            if hoje - ger < timedelta(hours=11) and len(ant.get("f", {})) > 50:
                log("fiis.json gerado há menos de 11 h; nada a fazer")
                return
        except Exception:
            pass
    debug = {}
    fundos = dados_cvm(debug)
    log("FIIs na CVM:", len(fundos))
    try:
        get("https://fc.yahoo.com")
    except Exception:
        pass
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = dict(zip(fundos, ex.map(mercado, list(fundos))))
    # documentos do Fundos.NET (só dos FIIs com cotação, para não consultar fundos parados)
    ativos = [t for t in fundos if res.get(t)]
    try:
        get(FNET + "abrirGerenciadorDocumentosCVM")
    except Exception as e:
        FNET_ERROS.append(f"sessão: {e}")
    with ThreadPoolExecutor(max_workers=4) as ex:
        docs = dict(zip(ativos, ex.map(lambda t: documentos(fundos[t]["cnpj"]), ativos)))
    # resumo do texto dos fatos relevantes e comunicados recentes (até 220 documentos)
    lim = (hoje - timedelta(days=45)).strftime("%Y-%m-%d")
    alvos = [reg for v in docs.values() if v for reg in v if reg[0] >= lim and ("Fato" in reg[1] or "Comunicado" in reg[1]) and not reg[4]][:220]
    amostras, falhas = [], []
    BRUTOS = []
    def resumo_de(reg):
        txt, erro = texto_documento(reg[5])
        if erro:
            if len(falhas) < 5: falhas.append(erro)
            return
        BRUTOS.append({"id": reg[5], "cat": reg[1], "txt": txt[:3500]})
        r = resumir(txt)
        if r:
            reg[4] = r
            if len(amostras) < 4: amostras.append({"id": reg[5], "inicio": txt[:400], "resumo": r})
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(resumo_de, alvos))
    if os.environ.get("FORCAR"):
        with open(os.path.join(DATA_DIR, "docs_debug.json"), "w", encoding="utf-8") as fp:
            json.dump(BRUTOS, fp, ensure_ascii=False)
    debug["resumos"] = {"alvos": len(alvos), "ok": sum(1 for r in alvos if r[4]), "falhas": falhas, "amostras": amostras}
    debug["docs_ok"] = sum(1 for v in docs.values() if v is not None)
    debug["docs_n"] = sum(len(v) for v in docs.values() if v)
    debug["docs_erros"] = FNET_ERROS
    saida = {}
    for t, f in fundos.items():
        if docs.get(t):
            f["docs"] = docs[t]
        m = res.get(t)
        if not m:
            continue
        if m["neg"] < (hoje - timedelta(days=45)).strftime("%Y-%m-%d"):
            continue  # sem negociação recente
        f.update(m)
        saida[t] = {k: v for k, v in f.items() if v not in (None, "")}
    debug["com_preco"] = len(saida)
    ifix = None
    for s in ("IFIX.SA", "^IFIX", "XFIX11.SA"):
        r = grafico(s)
        try:
            ts, fech = r["timestamp"], r["indicators"]["quote"][0]["close"]
            pts = [(datetime.fromtimestamp(a, BRT), c) for a, c in zip(ts, fech) if c]
            atual = r["meta"].get("regularMarketPrice") or pts[-1][1]
            antes = lambda lim: next((c for d, c in reversed(pts) if d < lim), None)
            p12, pano = antes(hoje - timedelta(days=365)), antes(datetime(hoje.year, 1, 1, tzinfo=BRT))
            if not p12 or not pano:
                continue
            ifix = {"fonte": s, "r12": round(atual / p12 - 1, 4), "ano": round(atual / pano - 1, 4)}
            break
        except Exception:
            continue
    log("FIIs com cotação:", len(saida), "IFIX:", ifix)
    if len(saida) < 50:
        log("poucos FIIs; mantendo o arquivo anterior")
        return
    with open(SAIDA, "w", encoding="utf-8") as fp:
        json.dump({"gerado": hoje.isoformat(timespec="seconds"), "ifix": ifix, "f": saida, "_debug": debug}, fp, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
