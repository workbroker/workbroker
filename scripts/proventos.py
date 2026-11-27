"""Radar de proventos: dividendos, JCP e rendimentos já aprovados das ações do Ibovespa e das mais negociadas
fora dele, com valor por ação, data com e data de pagamento. Fonte: B3 (dados da empresa listada, cashDividends).
Roda a cada ~2 h (ou no push com FORCAR) e grava proventos.json."""
import base64, csv, io, json, os, re, sys, time, unicodedata, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta, date

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "proventos.json")
BRT = timezone(timedelta(hours=-3))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"}
INTERVALO_H = 2
EXTRAS = 70  # ações fora do Ibovespa, as mais negociadas


def log(*a):
    print("[proventos]", *a, file=sys.stderr, flush=True)


def get(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def b64(d):
    return base64.b64encode(json.dumps(d).encode()).decode()


def data_iso(s):
    """'21/11/2026' -> '2026-11-21'; datas vazias ou 31/12/9999 viram None."""
    s = (s or "").strip()[:10]
    if len(s) != 10 or s[2] != "/" or s.endswith("9999"):
        return None
    return f"{s[6:10]}-{s[3:5]}-{s[0:2]}"


def num(s):
    try:
        return float(str(s).replace(".", "").replace(",", ".")) if s not in (None, "") else None
    except ValueError:
        return None


TIPO = {"DIVIDENDO": "Dividendo", "JRS CAP PROPRIO": "JCP", "JUROS SOBRE CAPITAL PRÓPRIO": "JCP", "RENDIMENTO": "Rendimento",
        "RESTITUIÇÃO DE CAPITAL": "Restituição de capital", "RESTITUICAO DE CAPITAL": "Restituição de capital"}
CLASSE = {"OR": "3", "PR": "4", "PA": "5", "PB": "6", "PC": "7", "PD": "8"}


def ticker_do_isin(isin, codigo, conhecidos):
    """BRITUBACNPR1 -> ITUB4 (classe pelos caracteres 9-10); units (CDAM etc.) -> 11."""
    isin = (isin or "").upper()
    if len(isin) != 12:
        return None
    cls = CLASSE.get(isin[9:11])
    cand = f"{codigo}{cls}" if cls else f"{codigo}11"
    if cand in conhecidos:
        return cand
    return cand if cls else (f"{codigo}11" if f"{codigo}11" in conhecidos else None)


def proventos_emissor(codigo, conhecidos):
    j = json.loads(get("https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/"
                       + b64({"issuingCompany": codigo, "language": "pt-br"})))
    reg = j[0] if isinstance(j, list) and j else (j or {})
    out = []
    for c in reg.get("cashDividends") or []:
        tk = ticker_do_isin(c.get("isinCode") or c.get("assetIssued"), codigo, conhecidos)
        if not tk:
            continue
        rot = (c.get("label") or "").strip().upper()
        out.append({"tk": tk, "tipo": TIPO.get(rot, rot.title() or "Provento"), "valor": num(c.get("rate")),
                    "aprov": data_iso(c.get("approvedOn")), "com": data_iso(c.get("lastDatePrior")),
                    "pag": data_iso(c.get("paymentDate")), "ref": (c.get("relatedTo") or "").strip(),
                    "obs": (c.get("remarks") or "").strip()[:160]})
    return out


# ---------------- Avisos aos acionistas na CVM (anúncios que a B3 ainda não lista) ----------------
CVM = "https://dados.cvm.gov.br/dados/CIA_ABERTA/"
RX_ASSUNTO = re.compile(r"juros sobre (o )?capital|\bjcp\b|dividend|provento|remunera..o aos acionistas|distribui..o de (lucros|resultados)", re.I)
MESES = {m: i + 1 for i, m in enumerate(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"])}
DT = r"(\d{2}/\d{2}/\d{4})"


def sem_acento(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()


def normalizar(txt):
    """Texto do PDF sem acentos, espaços simples e datas por extenso convertidas ('21 de dezembro de 2026' -> 21/12/2026)."""
    t = re.sub(r"\s+", " ", sem_acento(txt))
    t = re.sub(r"(\d{1,2})o? de (" + "|".join(MESES) + r") de (\d{4})",
               lambda m: f"{int(m.group(1)):02d}/{MESES[m.group(2).lower()]:02d}/{m.group(3)}", t, flags=re.I)
    return re.sub(r"(\d{1,2})/(\d{1,2})/(\d{4})", lambda m: f"{int(m.group(1)):02d}/{int(m.group(2)):02d}/{m.group(3)}", t)


def ler_aviso(txt):
    """Valor por ação (bruto), data com e data de pagamento do aviso. Devolve dict ou None."""
    t = normalizar(txt)
    tipo = "JCP" if re.search(r"juros sobre (o )?capital|\bJCP\b", t, re.I) else "Dividendo" if re.search(r"dividendo", t, re.I) else None
    valores = {}
    for m in re.finditer(r"R\$ ?(\d{1,3}(?:\.\d{3})*,\d{2,12})((?:(?!R\$).){0,240}?)por (?:cada )?(?:acao|acoes|unit|units|certificado)( (?:ordinaria|preferencial|unit))?", t, re.I):
        ctx = t[max(0, m.start() - 60): m.end() + 40].lower()
        if "liquid" in ctx and "brut" not in m.group(2).lower():
            continue  # valor líquido de IR
        if re.search(r"milh|bilh|mil\b", m.group(2), re.I):
            continue  # total distribuído, não por ação
        v = num(m.group(1))
        if not v or v > 100:
            continue  # valor total da distribuição, não por ação
        cls = (m.group(3) or "").strip().lower()
        k = "ON" if cls.startswith("ordin") else "PN" if cls.startswith("pref") else "UNIT" if cls == "unit" else "*"
        if re.search(r"\bunits?\b", m.group(0)[-12:], re.I):
            k = "UNIT"
        valores.setdefault(k, v)
    if not valores or not tipo:
        return None
    com = re.search(r"(?:posicao acionaria|base acionaria|data[- ]com|detentores? de acoes|acionistas inscritos|titulares de acoes)[^.]{0,120}?" + DT, t, re.I)
    ex = re.search(r"ex[- ](?:direito|juros|jcp|dividendos?|proventos?)[^.]{0,80}?" + DT, t, re.I)
    pag = re.search(r"(?:pagamento|pagos|creditados|serao pagos|sera pago|sera efetuado|sera realizado)[^.]{0,140}?" + DT, t, re.I)
    iso = lambda m: data_iso(m.group(1)) if m else None
    c = iso(com)
    if not c and ex:  # data com = dia útil anterior à data ex (aproximação: dia anterior, pulando fim de semana)
        d = date.fromisoformat(iso(ex)) - timedelta(days=1)
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        c = d.isoformat()
    return {"tipo": tipo, "valores": valores, "com": c, "pag": iso(pag)}


def baixar_pdf(link):
    m = re.search(r"numProtocolo=(\d+)", link or "")
    if not m:
        return None
    pag = f"https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega={m.group(1)}"
    corpo = json.dumps({"codigoInstituicao": "1", "numeroProtocolo": m.group(1), "token": "", "versaoCaptcha": ""}).encode()
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        "https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx/ExibirPDF", data=corpo,
        headers={**UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", "Referer": pag}), timeout=90).read())
    d = r.get("d") or ""
    if not d or d.startswith(":ERRO:"):
        return None
    b = base64.b64decode(d.split(",")[-1])
    return b if b[:4] == b"%PDF" else None


def avisos_cvm(tk2cn, conhecidos, cache, debug, hoje):
    """Documentos dos últimos 45 dias sobre JCP/dividendos das empresas acompanhadas, lidos do PDF."""
    cn2tk = {}
    for tk, cn in tk2cn.items():
        if tk in conhecidos:
            cn2tk.setdefault(cn, []).append(tk)
    lim = (hoje - timedelta(days=45)).isoformat()
    linhas = []
    for a in sorted({hoje.year, (hoje - timedelta(days=45)).year}):
        try:
            z = zipfile.ZipFile(io.BytesIO(get(CVM + f"DOC/IPE/DADOS/ipe_cia_aberta_{a}.zip", 300)))
            for nm in z.namelist():
                linhas += list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";"))
        except Exception as e:
            debug[f"ipe_{a}"] = repr(e)[:100]
    docs = {}
    for r in linhas:
        cn = re.sub(r"\D", "", r.get("CNPJ_Companhia") or "")
        if cn not in cn2tk or (r.get("Data_Entrega") or "") < lim:
            continue
        txt = f"{r.get('Assunto') or ''} {r.get('Tipo') or ''} {r.get('Especie') or ''}"
        if r.get("Categoria") not in ("Aviso aos Acionistas", "Comunicado ao Mercado", "Fato Relevante") or not RX_ASSUNTO.search(sem_acento(txt)):
            continue
        p = r.get("Protocolo_Entrega")
        if p not in docs or (num(r.get("Versao")) or 0) >= (num(docs[p].get("Versao")) or 0):
            docs[p] = r
    debug["avisos_encontrados"] = len(docs)
    debug["ipe_ultima_data"] = max((r.get("Data_Entrega") or "") for r in linhas) if linhas else None
    debug["ipe_bancos"] = [(r.get("Data_Entrega"), r.get("Categoria"), (r.get("Assunto") or "")[:60]) for r in linhas
                           if re.sub(r"\D", "", r.get("CNPJ_Companhia") or "") in ("60746948000112", "60872504000123") and (r.get("Data_Entrega") or "") >= lim][:12]
    from pypdf import PdfReader
    novos, lidos = 0, {}
    for p, r in sorted(docs.items(), key=lambda kv: kv[1].get("Data_Entrega") or "", reverse=True):
        if p in cache and cache[p].get("v") == 2:
            lidos[p] = cache[p]; continue
        if novos >= 60:
            continue  # o resto fica para a próxima rodada
        novos += 1
        item = {"v": 2, "d": r.get("Data_Entrega"), "cn": re.sub(r"\D", "", r.get("CNPJ_Companhia") or ""), "a": (r.get("Assunto") or "")[:160], "l": r.get("Link_Download")}
        try:
            b = baixar_pdf(r.get("Link_Download"))
            if b:
                rd = PdfReader(io.BytesIO(b))
                txt = " ".join((pg.extract_text() or "") for pg in rd.pages[:5])
                item["x"] = ler_aviso(txt)
                if not item["x"]:
                    item["amostra"] = normalizar(txt)[:500]
        except Exception as e:
            item["erro"] = repr(e)[:80]
        lidos[p] = item
    debug["avisos_lidos_agora"] = novos
    out = []
    for p, it in lidos.items():
        x = it.get("x")
        if not x:
            continue
        tks = cn2tk.get(it["cn"], [])
        for tk in tks:
            cls = {"3": "ON", "4": "PN", "5": "PN", "6": "PN", "11": "UNIT"}.get(tk[4:], "*")
            v = x["valores"].get(cls) or x["valores"].get("*") or (len(x["valores"]) == 1 and next(iter(x["valores"].values()))) or None
            if not v:
                continue
            out.append({"tk": tk, "tipo": x["tipo"], "valor": v, "aprov": it["d"], "com": x["com"], "pag": x["pag"],
                        "ref": "", "fonte": "aviso", "doc": it["l"]})
    return out, lidos


def main():
    forcar = os.environ.get("FORCAR") == "1"
    ant = None
    try:
        ant = json.load(open(SAIDA, encoding="utf-8"))
        idade = (datetime.now(timezone.utc) - datetime.fromisoformat(ant["atualizado"])).total_seconds() / 3600
        if idade < INTERVALO_H and not forcar:
            log(f"atualizado há {idade:.1f} h; pulando"); return
    except Exception:
        pass
    rd = json.load(open(os.path.join(DATA_DIR, "radar.json"), encoding="utf-8"))
    acoes = rd.get("acoes") or []
    outras = sorted(rd.get("outras") or [], key=lambda a: -(a.get("vol") or 0))[:EXTRAS]
    info = {a["tk"]: a for a in acoes + outras}
    ibov = {a["tk"] for a in acoes}
    conhecidos = set(info)
    emissores = sorted({tk[:4] for tk in conhecidos})
    debug = {}
    hoje = datetime.now(BRT).date()
    lim_aprov = (hoje - timedelta(days=120)).isoformat()
    lim_pag = (hoje - timedelta(days=10)).isoformat()

    def seguro(cod):
        for tent in range(3):
            try:
                return cod, proventos_emissor(cod, conhecidos), None
            except Exception as e:
                erro = repr(e)[:100]
                time.sleep(2 + tent * 3)
        return cod, None, erro

    todos, falhas = [], 0
    with ThreadPoolExecutor(4) as ex:
        for cod, L, erro in ex.map(seguro, emissores):
            if L is None:
                falhas += 1; debug[cod] = erro; continue
            for p in L:
                # só o que interessa agora: aprovado nos últimos 120 dias ou ainda a pagar / pago há pouco
                if (p["aprov"] and p["aprov"] >= lim_aprov) or (p["pag"] and p["pag"] >= lim_pag) or (not p["pag"] and p["com"] and p["com"] >= lim_aprov):
                    a = info.get(p["tk"], {})
                    p["nome"] = a.get("nome")
                    p["preco"] = a.get("preco")
                    p["ibov"] = p["tk"] in ibov
                    if p["valor"] and a.get("preco"):
                        p["yield"] = round(p["valor"] / a["preco"] * 100, 2)
                    todos.append(p)
    log("emissores:", len(emissores), "falhas:", falhas, "proventos:", len(todos), list(debug.items())[:5])
    # anúncios recentes pelos avisos da CVM (a B3 só lista depois da data ex)
    cache = (ant or {}).get("avisos") or {}
    try:
        tk2cn = json.load(open(os.path.join(DATA_DIR, "radar_base.json"), encoding="utf-8"))["fund"]["tk2cn"]
        av, avisos = avisos_cvm(tk2cn, conhecidos, cache, debug, hoje)
    except Exception as e:
        av, avisos = [], cache
        debug["avisos"] = repr(e)[:160]
    b3 = {(p["tk"], p["tipo"], p["com"]) for p in todos}
    b3v = {(p["tk"], round(p["valor"] or 0, 4)) for p in todos}
    for p in av:
        if (p["tk"], p["tipo"], p["com"]) in b3 or (p["tk"], round(p["valor"], 4)) in b3v:
            continue  # a B3 já tem
        a = info.get(p["tk"], {})
        p.update({"nome": a.get("nome"), "preco": a.get("preco"), "ibov": p["tk"] in ibov})
        if a.get("preco"):
            p["yield"] = round(p["valor"] / a["preco"] * 100, 2)
        todos.append(p)
    log("avisos da CVM:", len(av), {k: v for k, v in debug.items() if k.startswith("avis") or k.startswith("ipe")})
    if falhas > len(emissores) * 0.5:
        log("Falhas demais; mantendo o arquivo anterior."); return
    # remove repetidos (a B3 às vezes lista o mesmo provento duas vezes)
    vistos, unicos = set(), []
    for p in todos:
        k = (p["tk"], p["tipo"], round(p["valor"] or 0, 6), p["com"])
        if k not in vistos:
            vistos.add(k); unicos.append(p)
    unicos.sort(key=lambda p: (p["aprov"] or "", p["tk"]), reverse=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "hoje": hoje.isoformat(),
                   "emissores": len(emissores), "p": unicos, "avisos": avisos, "debug": debug}, fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
