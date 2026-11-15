"""Dados de crédito de emissores -> credito.json (uma vez por dia)
- Banco Central (IF.data, trimestral): bancos e financeiras que emitem CDB, LCA, LCI e LC.
  Ativo, carteira de crédito, captações, patrimônio líquido e lucro da instituição;
  Índice de Basileia e de imobilização do conglomerado prudencial; situação (ex.: liquidação).
- CVM (dados abertos): companhias abertas (debêntures, notas comerciais), números do último
  balanço anual (DFP), fatos relevantes e comunicados (IPE) e os relatórios das agências de
  rating que as próprias empresas publicam na CVM, com a nota lida do documento quando possível.
Roda no GitHub Actions; o arquivo vai para o ramo "dados" (sem histórico)."""
import csv, io, json, os, re, sys, time, zipfile, urllib.request, urllib.parse, http.cookiejar, unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "credito.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
BRT = timezone(timedelta(hours=-3))
HOJE = datetime.now(BRT)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, timeout=120, data=None, headers=None, opener=None):
    h = dict(UA); h.update(headers or {})
    o = opener or urllib.request.build_opener()
    return o.open(urllib.request.Request(url, data=data, headers=h), timeout=timeout).read()


def num(x):
    try:
        v = float(str(x).strip().replace(",", "."))
        return v if v == v else None
    except Exception:
        return None


def so_dig(s):
    return re.sub(r"\D", "", s or "")


# ---------------- Banco Central: IF.data ----------------
IFD = "https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/"
CONTAS = {"140220": "ativo", "141873": "carteira", "140239": "captacoes", "140246": "pl", "141870": "lucro", "79664": "basileia", "79662": "imobilizacao"}
TCB = {"B1": "Banco comercial / múltiplo", "B2": "Banco múltiplo / de investimento", "B4": "Banco de desenvolvimento", "N2": "Financeira / crédito"}


def ifd_valores(am, tipo):
    u = IFD + (f"IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)?@AnoMes={am}"
               f"&@TipoInstituicao={tipo}&@Relatorio=%271%27&$format=json&$select=CodInst,Conta,Saldo")
    out = {}
    for x in json.loads(get(u, 180))["value"]:
        k = CONTAS.get(str(x.get("Conta")))
        if k and x.get("Saldo") is not None:
            out.setdefault(x["CodInst"], {})[k] = x["Saldo"]
    return out


def trimestres():
    a, m = HOJE.year, HOJE.month
    m -= (m - 1) % 3 + 1  # último fim de trimestre já encerrado
    while True:
        if m <= 0:
            a, m = a - 1, m + 12
        yield a * 100 + m
        m -= 3


def bancos(debug):
    am = None
    for cand in list(zip(range(6), trimestres())):
        c = cand[1]
        try:
            v = ifd_valores(c, 3)
            if len(v) > 300:
                am, V3 = c, v
                break
            log("IF.data sem dados em", c, len(v))
        except Exception as e:
            log("IF.data", c, e)
    if not am:
        return [], None
    V1 = ifd_valores(am, 1)
    try:
        A3, A1 = ifd_valores(am - 100, 3), ifd_valores(am - 100, 1)
    except Exception as e:
        log("IF.data ano anterior", e); A3, A1 = {}, {}
    cad = json.loads(get(IFD + f"IfDataCadastro(AnoMes=@AnoMes)?@AnoMes={am}&$format=json", 180))["value"]
    nomes = {c["CodInst"]: c.get("NomeInstituicao") for c in cad}
    debug["ifdata"] = {"am": am, "n3": len(V3), "n1": len(V1), "situacoes": sorted({c.get("Situacao") or "" for c in cad})}
    out = []
    for c in cad:
        if c.get("Td") != "I" or c.get("Tcb") not in TCB:
            continue
        cod = c["CodInst"]
        prud = c.get("CodConglomeradoPrudencial") or cod
        ind = dict(V3.get(cod, {})); ant = dict(A3.get(cod, {}))
        for k in ("basileia", "imobilizacao"):
            if V1.get(prud, {}).get(k) is not None: ind[k] = V1[prud][k]
            if A1.get(prud, {}).get(k) is not None: ant[k] = A1[prud][k]
        if c.get("Situacao") == "A" and not ind:
            continue  # ativa mas sem dados no trimestre (sem captação relevante)
        e = {"id": "b" + cod, "t": "b", "n": c.get("NomeInstituicao"), "c": cod,
             "s": c.get("SegmentoTb") or TCB[c["Tcb"]], "sr": c.get("Sr"), "sit": c.get("Situacao"),
             "uf": c.get("Uf"), "ind": {k: round(v, 4) for k, v in ind.items()}, "ant": {k: round(v, 4) for k, v in ant.items()}}
        cf = c.get("CodConglomeradoFinanceiro")
        if cf and nomes.get(cf) and nomes[cf] != e["n"]:
            e["grupo"] = nomes[cf]
        if prud != cod and nomes.get(prud):
            e["prud"] = nomes[prud]
        out.append(e)
    return out, am


# ---------------- CVM ----------------
CVM = "https://dados.cvm.gov.br/dados/CIA_ABERTA/"


def ler_csv(b):
    return list(csv.DictReader(io.TextIOWrapper(io.BytesIO(b), encoding="latin-1"), delimiter=";"))


def ler_zip(url, filtro=None):
    z = zipfile.ZipFile(io.BytesIO(get(url, 300)))
    return {nm: list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";"))
            for nm in z.namelist() if not filtro or filtro(nm)}


def cadastro_cvm():
    out = {}
    for r in ler_csv(get(CVM + "CAD/DADOS/cad_cia_aberta.csv")):
        if r.get("SIT") != "ATIVO":
            continue
        cn = so_dig(r["CNPJ_CIA"])
        out[cn] = {"id": "e" + cn, "t": "e", "n": r.get("DENOM_SOCIAL"), "a": r.get("DENOM_COMERC") if r.get("DENOM_COMERC") != r.get("DENOM_SOCIAL") else None,
                   "c": cn, "s": r.get("SETOR_ATIV"), "cat": (r.get("CATEG_REG") or "").replace("Categoria ", ""),
                   "sitE": r.get("SIT_EMISSOR"), "uf": r.get("UF")}
    return out


CATS_DOC = {"Fato Relevante": "Fato relevante", "Comunicado ao Mercado": "Comunicado",
            "Aviso aos Debenturistas": "Aviso aos debenturistas",
            "Informações de Companhias em Recuperação Judicial ou Extrajudicial": "Recuperação judicial"}


def ipe(debug):
    linhas = []
    for a in (HOJE.year - 1, HOJE.year):
        try:
            for nm, l in ler_zip(CVM + f"DOC/IPE/DADOS/ipe_cia_aberta_{a}.zip").items():
                linhas += l
        except Exception as e:
            log("IPE", a, e)
    debug["ipe_linhas"] = len(linhas)
    lim_doc, lim_rat = (HOJE - timedelta(days=365)).strftime("%Y-%m-%d"), (HOJE - timedelta(days=550)).strftime("%Y-%m-%d")
    docs, rats, vistos = {}, {}, {}
    for r in linhas:  # última versão de cada protocolo
        p = r.get("Protocolo_Entrega")
        if p and (p not in vistos or (num(r.get("Versao")) or 0) >= (num(vistos[p].get("Versao")) or 0)):
            vistos[p] = r
    for r in vistos.values():
        cn, dt = so_dig(r.get("CNPJ_Companhia")), r.get("Data_Entrega") or ""
        assunto = re.sub(r"\s+", " ", (r.get("Assunto") or "").replace("&amp", "&")).strip()
        item = {"d": dt, "a": assunto[:160], "l": r.get("Link_Download")}
        if (r.get("Tipo") or "").startswith("Relatório de Agência de Rating"):
            if dt >= lim_rat:
                rats.setdefault(cn, []).append(item)
        elif r.get("Categoria") in CATS_DOC and dt >= lim_doc:
            item["k"] = CATS_DOC[r["Categoria"]]
            docs.setdefault(cn, []).append(item)
    for d in (docs, rats):
        for cn in d:
            d[cn].sort(key=lambda x: x["d"], reverse=True)
    return {cn: v[:6] for cn, v in docs.items()}, {cn: v[:4] for cn, v in rats.items()}


def dfp(debug):
    for ano in (HOJE.year - 1, HOJE.year - 2):
        try:
            Z = ler_zip(CVM + f"DOC/DFP/DADOS/dfp_cia_aberta_{ano}.zip",
                        lambda nm: any(t in nm for t in ("BPA_con", "BPP_con", "DRE_con", "DFC_MI_con", "BPA_ind", "BPP_ind", "DRE_ind", "DFC_MI_ind")))
            break
        except Exception as e:
            log("DFP", ano, e); Z = None
    if not Z:
        return {}, None
    debug["dfp_ano"] = ano
    # conta -> valor por empresa, exercício (ÚLTIMO/PENÚLTIMO), consolidado preferido
    V = {}  # (cnpj, tipo con/ind, ordem) -> {cod: (desc, valor)}
    for nm, linhas in Z.items():
        tp = "con" if "_con_" in nm else "ind"
        for r in linhas:
            if r.get("ORDEM_EXERC") not in ("ÚLTIMO", "PENÚLTIMO"):
                continue
            esc = 1000 if (r.get("ESCALA_MOEDA") or "").upper() == "MIL" else 1
            v = num(r.get("VL_CONTA"))
            if v is None:
                continue
            k = (so_dig(r["CNPJ_CIA"]), tp, r["ORDEM_EXERC"])
            V.setdefault(k, {})[r["CD_CONTA"]] = (r.get("DS_CONTA") or "", v * esc)
    out = {}
    cnpjs = {k[0] for k in V}
    for cn in cnpjs:
        res = {}
        for ordem, nome in (("ÚLTIMO", "ind"), ("PENÚLTIMO", "ant")):
            C = V.get((cn, "con", ordem)) or V.get((cn, "ind", ordem))
            if not C:
                continue
            g = lambda cod: C.get(cod, ("", None))[1]
            ebit_desc = C.get("3.05", ("",))[0].lower()
            if "antes do resultado financeiro" not in ebit_desc:
                continue  # plano de contas de instituição financeira/seguradora: indicadores não se aplicam
            divida = sum(v for cod, (d, v) in C.items() if (cod.startswith("2.01.04") or cod.startswith("2.02.01")) and cod.count(".") == 2)
            caixa = (g("1.01.01") or 0) + (g("1.01.02") or 0)
            da = sum(abs(v) for cod, (d, v) in C.items() if cod.startswith("6.01.01.") and re.search(r"deprecia|amortiza|exaust", d, re.I))
            ebit = g("3.05")
            x = {"receita": g("3.01"), "ebit": ebit, "lucro": g("3.11") if g("3.11") is not None else g("3.09"),
                 "pl": g("2.03"), "ativo": g("1"), "divida": divida, "caixa": caixa,
                 "ac": g("1.01"), "pc": g("2.01")}
            if ebit is not None and da:
                x["ebitda"] = ebit + da
            res[nome] = {k: round(v) for k, v in x.items() if v is not None}
        if res.get("ind"):
            out[cn] = res
    return out, ano


# ---------------- Relatórios de rating (PDF no RAD/CVM) ----------------
NOTA = [
    ("Fitch", re.compile(r"\b((?:AAA|AA|A|BBB|BB|B|CCC|CC|C|RD|D)[+-]?)\s?\((?:exp\))?\(?bra\)", re.I)),
    ("S&P", re.compile(r"\bbr((?:AAA|AA|A|BBB|BB|B|CCC|CC|C|D)[+-]?)(?![A-Za-z])")),
    ("Moody's", re.compile(r"\b((?:AAA|AA|A|BBB|BB|B|CCC|CC|C|D)[+-]?)\.br\b", re.I)),
]
AGENCIAS = [("Fitch", r"fitch"), ("S&P", r"s\s?&\s?p|standard\s*&?\s*poor"), ("Moody's", r"moody"),
            ("Austin", r"austin"), ("Liberum", r"liberum"), ("LF Rating", r"lf rating"), ("SR Rating", r"sr rating")]
PERSP = re.compile(r"(?:perspectiva|outlook)\s*(?:de\s*rating\s*)?(?:é\s*|:)?\s*(est[áa]vel|positiva|negativa|em desenvolvimento|stable|positive|negative|developing)", re.I)
PT = {"stable": "estável", "positive": "positiva", "negative": "negativa", "developing": "em desenvolvimento", "estavel": "estável"}

_baixar = None


def baixar_pdf(link):
    """Tenta obter o PDF do documento; devolve bytes ou None. Definido pela sonda (ver _metodo_pdf)."""
    return _baixar(link) if _baixar else None


def _metodo_get(link):
    b = get(link, 90)
    return b if b[:4] == b"%PDF" else None


def _metodo_post(link):
    cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    h = get(link, 90, opener=op).decode("utf-8", "ignore")
    vs = re.search(r'id="__VIEWSTATE" value="([^"]*)"', h); vg = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]*)"', h)
    if not vs:
        return None
    d = urllib.parse.urlencode({"__VIEWSTATE": vs.group(1), "__VIEWSTATEGENERATOR": vg.group(1) if vg else ""}).encode()
    b = get(link, 90, data=d, headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": link}, opener=op)
    return b if b[:4] == b"%PDF" else None


def ler_rating(item):
    try:
        b = baixar_pdf(item["l"])
        if not b:
            return item
        from pypdf import PdfReader
        rd = PdfReader(io.BytesIO(b))
        txt = " ".join((p.extract_text() or "") for p in rd.pages[:6])
        txt = re.sub(r"\s+", " ", txt)
        ag = next((n for n, rx in AGENCIAS if re.search(rx, item["a"], re.I)), None) or \
             next((n for n, rx in AGENCIAS if re.search(rx, txt[:3000], re.I)), None)
        notas = {}
        for nome, rx in NOTA:
            for m in rx.finditer(txt):
                k = m.group(1).upper(); k = {"FITCH": None}.get(k, k)
                if k:
                    notas[(nome, k)] = notas.get((nome, k), 0) + 1
        if notas:
            ordem = sorted(notas.items(), key=lambda kv: -kv[1])
            if ag in ("Fitch", "S&P", "Moody's"):
                ordem = [o for o in ordem if o[0][0] == ag] or ordem
            (agn, nota), _ = ordem[0]
            item["r"] = {"fitch": f"{nota}(bra)", "s&p": f"br{nota}", "moody's": f"{nota}.br"}[agn.lower()]
            ag = ag or agn
        p = PERSP.search(txt)
        if p:
            item["p"] = PT.get(unicodedata.normalize("NFKD", p.group(1).lower()).encode("ascii", "ignore").decode(), p.group(1).lower())
        if ag:
            item["ag"] = ag
    except Exception as e:
        item["erro"] = repr(e)[:80]
    return item


def main():
    debug = {}
    try:
        with open(SAIDA, encoding="utf-8") as f:
            ant = json.load(f)
        idade = (datetime.now(timezone.utc) - datetime.fromisoformat(ant["atualizado"])).total_seconds() / 3600
        if idade < 20 and not os.environ.get("FORCAR"):
            log(f"credito.json tem {idade:.1f} h; nada a fazer.")
            return
    except Exception:
        ant = None
    t0 = time.time()
    B, am = [], None
    try:
        B, am = bancos(debug)
    except Exception as e:
        log("bancos", e)
    log("bancos:", len(B), am, f"{time.time() - t0:.0f}s")
    E = {}
    try:
        E = cadastro_cvm()
    except Exception as e:
        log("cadastro CVM", e)
    D, R = {}, {}
    try:
        D, R = ipe(debug)
    except Exception as e:
        log("IPE", e)
    F, ano = {}, None
    try:
        F, ano = dfp(debug)
    except Exception as e:
        log("DFP", e)
    log("cvm:", len(E), "docs", len(D), "ratings", len(R), "dfp", len(F), ano, f"{time.time() - t0:.0f}s")

    # método de download do PDF: testa no primeiro relatório
    global _baixar
    amostra = next((v[0]["l"] for v in R.values() if v), None)
    for nome, fn in (("get", _metodo_get), ("post", _metodo_post)):
        try:
            if amostra and fn(amostra):
                _baixar = fn; debug["pdf"] = nome; break
        except Exception as e:
            log("pdf", nome, e)
    log("download de PDF:", debug.get("pdf"))
    if _baixar:
        itens = [it for v in R.values() for it in v[:2]]
        with ThreadPoolExecutor(6) as ex:
            list(ex.map(ler_rating, itens))
        debug["ratings_lidos"] = sum(1 for it in itens if it.get("r"))
        log("ratings lidos:", debug["ratings_lidos"], "de", len(itens), f"{time.time() - t0:.0f}s")
    for v in R.values():  # agência pelo assunto, quando não leu o PDF
        for it in v:
            it.setdefault("ag", next((n for n, rx in AGENCIAS if re.search(rx, it["a"], re.I)), None))
            if not it["ag"]: it.pop("ag")

    # junta: bancos (IF.data) + companhias abertas (CVM); banco com registro na CVM recebe docs e ratings
    por8 = {}
    for cn, e in E.items():
        por8.setdefault(cn[:8], []).append(cn)
    usados = set()
    for b in B:
        for cn in por8.get(b["c"], []):
            usados.add(cn)
            if R.get(cn): b["rt"] = R[cn]
            if D.get(cn): b["dc"] = D[cn]
            b["cvm"] = cn
    emis = B[:]
    for cn, e in E.items():
        if cn in usados:
            continue
        if F.get(cn): e["fin"] = F[cn]
        if R.get(cn): e["rt"] = R[cn]
        if D.get(cn): e["dc"] = D[cn]
        emis.append({k: v for k, v in e.items() if v not in (None, "")})
    if len(emis) < 200:
        log("Poucos emissores; mantendo o arquivo anterior.")
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ref_bcb": am, "ref_dfp": ano,
                   "debug": debug, "emissores": emis}, f, ensure_ascii=False, separators=(",", ":"))
    log("credito.json:", len(emis), "emissores", os.path.getsize(SAIDA) // 1024, "KB", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
