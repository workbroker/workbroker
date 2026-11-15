"""Radar de ações -> radar.json
- Ações do Ibovespa (carteira do dia da B3, com o peso de cada uma; se a B3 falhar, lista fixa).
- Cotações e dividendos: Yahoo Finance (a cada rodada do Actions, ~1 h; ações da B3 com atraso).
- Indicadores (uma vez por dia): P/L, P/VP, ROE e valor de mercado calculados com os balanços da CVM
  (último ITR e DFP: lucro dos últimos 12 meses dos controladores, patrimônio dos controladores e
  quantidade de ações); DY = dividendos e JCP pagos em 12 meses / preço.
- Calendário de resultados: datas de entrega do ITR/DFP na CVM (divulgados) e previsão dos próximos
  pela data do mesmo trimestre no ano anterior.
"""
import base64, csv, io, json, os, re, sys, time, zipfile, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta, date

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "radar.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
BRT = timezone(timedelta(hours=-3))
HOJE = datetime.now(BRT)
CVM = "https://dados.cvm.gov.br/dados/CIA_ABERTA/"

# carteira do Ibovespa de reserva (caso a B3 não responda); pesos ficam vazios
IBOV_RESERVA = """ALOS3 ABEV3 ASAI3 AURE3 AZZA3 B3SA3 BBSE3 BBDC3 BBDC4 BRAP4 BBAS3 BRKM5 BRAV3 BPAC11 CXSE3 CMIG4 COGN3 CPLE6
CSAN3 CPFE3 CMIN3 CURY3 CVCB3 CYRE3 DIRR3 ELET3 ELET6 EMBR3 ENGI11 ENEV3 EGIE3 EQTL3 FLRY3 GGBR4 GOAU4 NTCO3 HAPV3 HYPE3
IGTI11 IRBR3 ISAE4 ITSA4 ITUB4 KLBN11 RENT3 LREN3 MGLU3 POMO4 MBRF3 BEEF3 MOTV3 MRVE3 MULT3 PCAR3 PETR3 PETR4 RECV3 PRIO3
PSSA3 RADL3 RAIZ4 RDOR3 RAIL3 SBSP3 SANB11 STBP3 SMTO3 CSNA3 SLCE3 SUZB3 TAEE11 VIVT3 TIMS3 TOTS3 UGPA3 USIM5 VALE3 VAMO3
VBBR3 VIVA3 WEGE3 YDUQ3""".split()


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, timeout=60, headers=None):
    h = dict(UA); h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout).read()


def num(x):
    try:
        v = float(str(x).strip().replace(",", "."))
        return v if v == v else None
    except Exception:
        return None


def so_dig(s):
    return re.sub(r"\D", "", s or "")


# ---------------- Ibovespa (B3) ----------------
def carteira_ibov():
    q = base64.b64encode(json.dumps({"language": "pt-br", "pageNumber": 1, "pageSize": 150, "index": "IBOV", "segment": "1"}).encode()).decode()
    j = json.loads(get("https://sistemaswebb3-listados.b3.com.br/indexProxy/indexCall/GetPortfolioDay/" + q))
    out = [{"tk": r["cod"].strip(), "nome": (r.get("asset") or "").strip().title(), "tipo": (r.get("type") or "").split()[0] if r.get("type") else "",
            "peso": num(r.get("part"))} for r in j.get("results", []) if r.get("cod")]
    if len(out) < 50:
        raise ValueError(f"carteira curta: {len(out)}")
    return out


# ---------------- Cotações (Yahoo) ----------------
def yahoo(tk):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(tk)}.SA?range=1y&interval=1d&events=div", 40))
    r = j["chart"]["result"][0]
    m, ts = r["meta"], r.get("timestamp") or []
    cl = r["indicators"]["quote"][0].get("close") or []
    pts = [(t, c) for t, c in zip(ts, cl) if c]
    if not pts:
        return None
    off = m.get("gmtoffset", -10800)
    dia = lambda t: datetime.fromtimestamp(t + off, timezone.utc).date()
    preco = m.get("regularMarketPrice") or pts[-1][1]
    t_mkt = m.get("regularMarketTime") or pts[-1][0]
    # fechamento anterior: último pregão antes do dia da cotação
    ant = [c for t, c in pts if dia(t) < dia(t_mkt)]
    prev = ant[-1] if ant else None
    hoje = dia(t_mkt)
    def ate(d):  # último fechamento antes da data d
        a = [c for t, c in pts if dia(t) < d]
        return a[-1] if a else None
    ini_mes, ini_ano = ate(hoje.replace(day=1)), ate(hoje.replace(month=1, day=1))
    divs = sum(v.get("amount", 0) for v in (r.get("events", {}).get("dividends") or {}).values()
               if v.get("date", 0) >= time.time() - 365 * 86400)
    v = lambda a: round((preco / a - 1) * 100, 2) if a else None
    return {"preco": round(preco, 2), "var": v(prev), "mes": v(ini_mes), "ano": v(ini_ano), "a12": v(pts[0][1]),
            "max52": round(max(c for _, c in pts), 2), "min52": round(min(c for _, c in pts), 2),
            "dy": round(divs / preco * 100, 2) if preco and divs else 0, "div12": round(divs, 4),
            "vol": m.get("regularMarketVolume"), "t": int(t_mkt)}


# ---------------- CVM ----------------
def ler_zip(url, filtro):
    z = zipfile.ZipFile(io.BytesIO(get(url, 300)))
    return {nm: list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";"))
            for nm in z.namelist() if filtro(nm)}


def tickers_cvm():
    """ticker -> CNPJ (FCA, valores mobiliários) e CNPJ -> setor (cadastro)."""
    tk = {}
    for a in (HOJE.year, HOJE.year - 1):
        try:
            Z = ler_zip(CVM + f"DOC/FCA/DADOS/fca_cia_aberta_{a}.zip", lambda nm: "valor_mobiliario" in nm)
            for linhas in Z.values():
                for r in linhas:
                    c = (r.get("Codigo_Negociacao") or "").strip().upper()
                    if c and c not in tk:
                        tk[c] = so_dig(r.get("CNPJ_Companhia"))
            if tk:
                break
        except Exception as e:
            log("FCA", a, e)
    setor = {}
    try:
        for r in csv.DictReader(io.TextIOWrapper(io.BytesIO(get(CVM + "CAD/DADOS/cad_cia_aberta.csv")), encoding="latin-1"), delimiter=";"):
            if r.get("SIT") == "ATIVO":
                setor[so_dig(r["CNPJ_CIA"])] = r.get("SETOR_ATIV")
    except Exception as e:
        log("cadastro", e)
    return tk, setor


def contas(linhas, cnpjs):
    """{(cnpj, dt_refer, ordem, dt_ini): {cod: (desc, valor)}} só das empresas pedidas, versão mais recente."""
    V, versao = {}, {}
    for r in linhas:
        cn = so_dig(r.get("CNPJ_CIA"))
        if cn not in cnpjs:
            continue
        k = (cn, r.get("DT_REFER"))
        ver = int(r.get("VERSAO") or 0)
        if ver < versao.get(k, 0):
            continue
        if ver > versao.get(k, 0):
            versao[k] = ver
            for kk in [x for x in V if x[:2] == k]:
                del V[kk]
        v = num(r.get("VL_CONTA"))
        if v is None:
            continue
        esc = 1000 if (r.get("ESCALA_MOEDA") or "").upper() == "MIL" else 1
        V.setdefault((cn, r.get("DT_REFER"), r.get("ORDEM_EXERC"), r.get("DT_INI_EXERC") or ""), {})[r["CD_CONTA"]] = (r.get("DS_CONTA") or "", v * esc)
    return V


def lucro_contr(C):
    """Lucro do período atribuído aos controladores (ou o lucro consolidado)."""
    if not C:
        return None
    a = [(cod, v) for cod, (d, v) in C.items() if cod.startswith("3.") and re.search(r"atribu[ií]d[oa].*controlador", d, re.I)]
    if a:
        return sorted(a, key=lambda x: len(x[0]))[0][1]
    b = [(cod, v) for cod, (d, v) in C.items() if cod.count(".") == 1 and cod.startswith("3.") and re.search(r"lucro.*per[ií]odo|resultado l[ií]quido", d, re.I)]
    return sorted(b, key=lambda x: x[0])[-1][1] if b else None


def pl_contr(C):
    """Patrimônio líquido dos controladores."""
    if not C:
        return None
    raiz = [(cod, v) for cod, (d, v) in C.items() if cod.count(".") == 1 and cod.startswith("2.") and re.search(r"patrim[oô]nio l[ií]quido", d, re.I)]
    if not raiz:
        return None
    cod, pl = raiz[0]
    nc = [v for c, (d, v) in C.items() if c.startswith(cod + ".") and c.count(".") == 2 and re.search(r"n[aã]o controlador", d, re.I)]
    return pl - (nc[0] if nc else 0)


def fundamentos(cnpjs, debug):
    """Por CNPJ: lucro 12m, PL dos controladores, ações (ON/PN, sem tesouraria), receita 12m e datas de entrega."""
    out = {c: {} for c in cnpjs}
    itr = {}
    for a in (HOJE.year, HOJE.year - 1):
        try:
            itr[a] = ler_zip(CVM + f"DOC/ITR/DADOS/itr_cia_aberta_{a}.zip",
                             lambda nm: re.search(r"(DRE_con|DRE_ind|BPP_con|BPP_ind|composicao_capital|itr_cia_aberta_\d{4}\.csv)", nm))
        except Exception as e:
            log("ITR", a, e)
    dfp = {}
    for a in (HOJE.year - 1, HOJE.year - 2):
        try:
            dfp[a] = ler_zip(CVM + f"DOC/DFP/DADOS/dfp_cia_aberta_{a}.zip", lambda nm: re.search(r"(DRE_con|DRE_ind|dfp_cia_aberta_\d{4}\.csv)", nm))
        except Exception as e:
            log("DFP", a, e)
    debug["itr_anos"], debug["dfp_anos"] = list(itr), list(dfp)

    def tabela(Z, tipo):
        for pref in ("_con_", "_ind_"):
            for nm, l in Z.items():
                if tipo in nm and pref in nm:
                    yield pref, l

    # datas de entrega (primeira versão) por empresa e data de referência
    entregas = {}
    for fonte, Z in [("itr", z) for z in itr.values()] + [("dfp", z) for z in dfp.values()]:
        for nm, l in Z.items():
            if re.search(r"(itr|dfp)_cia_aberta_\d{4}\.csv$", nm):
                for r in l:
                    cn = so_dig(r.get("CNPJ_CIA"))
                    if cn in cnpjs:
                        k = (cn, r.get("DT_REFER"))
                        d = (r.get("DT_RECEB") or "")[:10]
                        if d and (k not in entregas or d < entregas[k][0]):
                            entregas[k] = (d, fonte)
    for (cn, ref), (d, fonte) in entregas.items():
        out[cn].setdefault("entregas", {})[ref] = d

    # último ITR: DRE acumulado do ano (atual e ano anterior), BPP, composição do capital
    for a in sorted(itr, reverse=True):
        Z = itr[a]
        dre = {}
        for pref, l in tabela(Z, "DRE"):
            for k, C in contas(l, cnpjs).items():
                dre.setdefault((k[0], pref), {})[k[1:]] = C
        bpp = {}
        for pref, l in tabela(Z, "BPP"):
            for k, C in contas(l, cnpjs).items():
                if k[2] == "ÚLTIMO":
                    bpp.setdefault((k[0], pref), {})[k[1]] = C
        cap = {}
        for nm, l in Z.items():
            if "composicao_capital" in nm:
                for r in l:
                    cn = so_dig(r.get("CNPJ_CIA"))
                    if cn in cnpjs and (cn not in cap or r.get("DT_REFER", "") >= cap[cn].get("DT_REFER", "")):
                        cap[cn] = r
        for cn in cnpjs:
            f = out[cn]
            if "ref" in f:
                continue
            D = dre.get((cn, "_con_")) or dre.get((cn, "_ind_"))
            B = bpp.get((cn, "_con_")) or bpp.get((cn, "_ind_"))
            if not D or not B:
                continue
            ref = max(k[0] for k in D)
            ytd = [C for (dr, ordem, ini), C in D.items() if dr == ref and ordem == "ÚLTIMO" and ini.endswith("-01-01")]
            ytd_a = [C for (dr, ordem, ini), C in D.items() if dr == ref and ordem == "PENÚLTIMO" and ini.endswith("-01-01")]
            f["ref"] = ref
            f["lucro_ytd"] = lucro_contr(ytd[0]) if ytd else None
            f["lucro_ytd_ant"] = lucro_contr(ytd_a[0]) if ytd_a else None
            f["pl"] = pl_contr(B.get(max(B)))
            c = cap.get(cn)
            if c:
                g = lambda k: num(c.get(k)) or 0
                f["on"] = max(g("QT_ACAO_ORDIN_CAP_INTEGR") - g("QT_ACAO_ORDIN_TESOURO"), 0)
                f["pn"] = max(g("QT_ACAO_PREF_CAP_INTEGR") - g("QT_ACAO_PREF_TESOURO"), 0)
    # lucro anual (DFP) para fechar os 12 meses
    for a in sorted(dfp, reverse=True):
        anual = {}
        for pref, l in tabela(dfp[a], "DRE"):
            for k, C in contas(l, cnpjs).items():
                if k[2] == "ÚLTIMO" and (k[0], pref) not in anual:
                    anual[(k[0], pref)] = (k[1], C)
        for cn in cnpjs:
            f = out[cn]
            if "lucro_ano" in f:
                continue
            x = anual.get((cn, "_con_")) or anual.get((cn, "_ind_"))
            if x:
                f["ano_ref"], f["lucro_ano"] = x[0], lucro_contr(x[1])
    for cn, f in out.items():
        la, ly, lya = f.get("lucro_ano"), f.get("lucro_ytd"), f.get("lucro_ytd_ant")
        if la is not None and f.get("ref") and f.get("ano_ref") and f["ref"] > f["ano_ref"] and ly is not None and lya is not None:
            f["lucro12"] = la + ly - lya
        elif la is not None:
            f["lucro12"] = la
    return out


def calendario(entregas):
    """Último resultado divulgado e previsão do próximo (mesma data de referência do ano anterior + 1 ano)."""
    if not entregas:
        return {}
    refs = sorted(entregas)
    ult = refs[-1]
    out = {"ult": {"ref": ult, "d": entregas[ult]}}
    # próximo trimestre depois do último divulgado
    y, m = int(ult[:4]), int(ult[5:7])
    m += 3
    if m > 12:
        y, m = y + 1, m - 12
    prox_ref = date(y, m, 30 if m in (6, 9) else 31).isoformat()
    base = f"{y - 1}{prox_ref[4:]}"
    if base in entregas:
        try:
            d = date.fromisoformat(entregas[base]).replace(year=int(entregas[base][:4]) + 1)
            out["prox"] = {"ref": prox_ref, "d": d.isoformat(), "est": 1}
        except ValueError:
            pass
    return out


def main():
    debug = {}
    try:
        with open(SAIDA, encoding="utf-8") as f:
            ant = json.load(f)
    except Exception:
        ant = {}
    t0 = time.time()
    try:
        cart = carteira_ibov(); debug["carteira"] = "B3"
    except Exception as e:
        log("B3", e)
        cart = ant.get("carteira") or [{"tk": t, "nome": "", "tipo": "", "peso": None} for t in IBOV_RESERVA]
        debug["carteira"] = "anterior" if ant.get("carteira") else "reserva"
    log("carteira:", len(cart), debug["carteira"])

    # fundamentos: uma vez por dia (ou quando forçado)
    fund = ant.get("fund") or {}
    idade = 99
    try:
        idade = (datetime.now(timezone.utc) - datetime.fromisoformat(ant["fund_at"])).total_seconds() / 3600
    except Exception:
        pass
    if idade > 20 or os.environ.get("FORCAR") or not fund:
        try:
            tk2cn, setor = tickers_cvm()
            debug["tickers_cvm"] = len(tk2cn)
            cnpjs = {tk2cn[c["tk"]] for c in cart if c["tk"] in tk2cn}
            F = fundamentos(cnpjs, debug)
            # todas as classes negociadas de cada empresa (para o valor de mercado)
            classes = {}
            for t, cn in tk2cn.items():
                if cn in cnpjs and re.fullmatch(r"[A-Z]{4}(3|4|5|6)", t):
                    classes.setdefault(cn, []).append(t)
            fund = {"tk2cn": {c["tk"]: tk2cn.get(c["tk"]) for c in cart}, "setor": {cn: setor.get(cn) for cn in cnpjs},
                    "f": {cn: {k: v for k, v in f.items() if k != "entregas"} for cn, f in F.items()},
                    "cal": {cn: calendario(f.get("entregas", {})) for cn, f in F.items()},
                    "classes": classes}
            fund_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        except Exception as e:
            log("fundamentos", e)
            fund_at = ant.get("fund_at")
    else:
        fund_at = ant.get("fund_at")
    log("fundamentos ok", f"{time.time() - t0:.0f}s")

    # cotações: ações do Ibovespa + outras classes das mesmas empresas (valor de mercado) + índice
    alvo = {c["tk"] for c in cart}
    for lst in (fund.get("classes") or {}).values():
        alvo.update(lst)
    Q = {}
    def busca(t):
        try:
            Q[t] = yahoo(t)
        except Exception as e:
            Q[t] = None
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(busca, sorted(alvo)))
    ok = sum(1 for v in Q.values() if v)
    log("cotações:", ok, "de", len(Q), f"{time.time() - t0:.0f}s")
    if ok < 30:
        log("Poucas cotações; mantendo o arquivo anterior."); return
    ibov = None
    try:
        j = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=5d&interval=1d"))
        m = j["chart"]["result"][0]["meta"]
        ibov = {"pts": m.get("regularMarketPrice"), "ant": m.get("chartPreviousClose") if m.get("range") == "1d" else None}
        cl = [c for c in j["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c]
        if len(cl) >= 2:
            ibov["ant"] = cl[-2]
        ibov["var"] = round((ibov["pts"] / ibov["ant"] - 1) * 100, 2) if ibov.get("ant") else None
        ibov["t"] = m.get("regularMarketTime")
    except Exception as e:
        log("ibov", e)

    acoes = []
    tk2cn, FF, CAL, CLS, SET = fund.get("tk2cn", {}), fund.get("f", {}), fund.get("cal", {}), fund.get("classes", {}), fund.get("setor", {})
    for c in cart:
        q = Q.get(c["tk"])
        if not q:
            continue
        a = {"tk": c["tk"], "nome": c["nome"], "peso": c["peso"], **q}
        cn = tk2cn.get(c["tk"])
        f = FF.get(cn) or {}
        if cn:
            a["setor"] = SET.get(cn)
            if CAL.get(cn): a["res"] = CAL[cn]
            # valor de mercado: preço de cada classe × ações em circulação da classe
            p_on = next((Q[t]["preco"] for t in CLS.get(cn, []) if t[4] == "3" and Q.get(t)), None)
            p_pn = next((Q[t]["preco"] for t in sorted(CLS.get(cn, [])) if t[4] in "456" and Q.get(t)), None)
            on, pn = f.get("on") or 0, f.get("pn") or 0
            if on or pn:
                p_on = p_on or p_pn or q["preco"]; p_pn = p_pn or p_on
                mcap = on * p_on + pn * p_pn
                while mcap and mcap < 3e8:  # quantidade informada em milhares
                    mcap *= 1000
                a["mcap"] = round(mcap)
                if f.get("lucro12") and mcap:
                    a["pl"] = round(mcap / f["lucro12"], 1)
                if f.get("pl") and f["pl"] > 0 and mcap:
                    a["pvp"] = round(mcap / f["pl"], 2)
                if f.get("lucro12") is not None and f.get("pl") and f["pl"] > 0:
                    a["roe"] = round(f["lucro12"] / f["pl"] * 100, 1)
        acoes.append(a)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ibov": ibov, "acoes": acoes,
                   "carteira": cart, "fund_at": fund_at, "fund": fund, "debug": debug}, fh, ensure_ascii=False, separators=(",", ":"))
    log("radar.json:", len(acoes), "ações", os.path.getsize(SAIDA) // 1024, "KB", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
