"""Dados de ações, ETFs e FIIs -> rv.json
- Cotações e indicadores: Yahoo Finance (preço, variação, P/L, P/VP, dividend yield 12m, máxima 52 semanas,
  consenso de analistas, preço-alvo médio, setor).
- FIIs: dados abertos da CVM (segmento, mandato, tipo de gestão, administrador, valor patrimonial por cota, vacância).
Roda no GitHub Actions; o arquivo vai para o ramo "dados" (sem histórico)."""
import csv, io, json, os, sys, time, zipfile, http.cookiejar, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "rv.json")
CACHE = os.path.join(DATA_DIR, "rv_cache.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}

ACOES = """ABEV3 ALOS3 ALPA4 ARZZ3 ASAI3 AURE3 AZUL4 AZZA3 B3SA3 BBAS3 BBDC3 BBDC4 BBSE3 BEEF3 BPAC11 BPAN4 BRAP4 BRAV3
BRFS3 BRKM5 CAML3 CASH3 CBAV3 CEAB3 CMIG3 CMIG4 CMIN3 COGN3 CPFE3 CPLE3 CPLE6 CSAN3 CSMG3 CSNA3 CURY3 CVCB3 CXSE3
CYRE3 DIRR3 DXCO3 ECOR3 EGIE3 ELET3 ELET6 EMBR3 ENEV3 ENGI11 EQTL3 EVEN3 EZTC3 FESA4 FLRY3 GGBR4 GGPS3 GMAT3 GOAU4
GRND3 HAPV3 HYPE3 IGTI11 INTB3 IRBR3 ISAE4 ITSA4 ITUB3 ITUB4 JBSS3 JHSF3 KEPL3 KLBN11 LEVE3 LJQQ3 LOGG3 LREN3 LWSA3
MDIA3 MGLU3 MILS3 MOVI3 MRFG3 MRVE3 MULT3 MYPK3 NEOE3 ODPV3 ORVR3 PCAR3 PETR3 PETR4 PETZ3 PGMN3 PLPL3 PNVL3 POMO4
POSI3 PRIO3 PSSA3 RADL3 RAIL3 RAIZ4 RANI3 RAPT4 RDOR3 RECV3 RENT3 ROMI3 SANB11 SAPR11 SAPR4 SBFG3 SBSP3 SIMH3 SLCE3
SMFT3 SMTO3 SOMA3 STBP3 SUZB3 TAEE11 TASA4 TEND3 TGMA3 TIMS3 TOTS3 TRIS3 TTEN3 TUPY3 UGPA3 UNIP6 USIM5 VALE3 VAMO3
VBBR3 VIVA3 VIVT3 VULC3 WEGE3 WIZC3 YDUQ3""".split()
ETFS = "BOVA11 BOVV11 BOVX11 SMAL11 IVVB11 SPXI11 NASD11 GOLD11 HASH11 DIVO11 XINA11 ECOO11 FIND11 PIBB11 B5P211 IMAB11 IRFM11 FIXA11 LFTS11 LFTB11 DIVD11 BRAX11".split()


def log(*a):
    print(*a, file=sys.stderr)


# ---------- Yahoo ----------
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get(url, timeout=40):
    return opener.open(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def crumb():
    try:
        get("https://fc.yahoo.com")
    except Exception:
        pass  # só para receber o cookie
    return get("https://query1.finance.yahoo.com/v1/test/getcrumb").decode().strip()


def cotacoes(simbolos, cr):
    out = {}
    for i in range(0, len(simbolos), 50):
        lote = simbolos[i:i + 50]
        url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + urllib.parse.quote(",".join(s + ".SA" for s in lote)) + "&crumb=" + urllib.parse.quote(cr)
        try:
            for q in json.loads(get(url))["quoteResponse"]["result"]:
                t = q["symbol"].replace(".SA", "")
                dy = q.get("trailingAnnualDividendYield")
                out[t] = {
                    "n": q.get("longName") or q.get("shortName") or t,
                    "p": q.get("regularMarketPrice"),
                    "v": q.get("regularMarketChangePercent"),
                    "pl": q.get("trailingPE"),
                    "pvp": q.get("priceToBook"),
                    "dy": dy * 100 if isinstance(dy, (int, float)) else None,
                    "max52": q.get("fiftyTwoWeekHigh"),
                    "min52": q.get("fiftyTwoWeekLow") or None,
                    "rat": q.get("averageAnalystRating"),
                    "mc": q.get("marketCap"),
                }
        except Exception as e:
            log("cotacoes", lote[0], e)
        time.sleep(0.4)
    return out


def fundamentos(t, cr):
    url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{t}.SA?modules=assetProfile,financialData&crumb={urllib.parse.quote(cr)}"
    r = json.loads(get(url))["quoteSummary"]["result"][0]
    ap, fd = r.get("assetProfile", {}) or {}, r.get("financialData", {}) or {}
    raw = lambda x: x.get("raw") if isinstance(x, dict) else x
    return {"setor": ap.get("sector"), "ind": ap.get("industry"), "rec": fd.get("recommendationKey"),
            "alvo": raw(fd.get("targetMeanPrice")), "nAn": raw(fd.get("numberOfAnalystOpinions")), "em": datetime.now(timezone.utc).date().isoformat()}


# ---------- CVM (FIIs) ----------
def ler_zip(url):
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=120)))
    return {nm: list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";")) for nm in z.namelist()}


def num(x):
    try:
        return float(str(x).replace(",", "."))
    except Exception:
        return None


def ultimo_por_cnpj(linhas):
    m = {}
    for l in linhas:
        c = l.get("CNPJ_Fundo_Classe")
        if c and (c not in m or l.get("Data_Referencia", "") > m[c].get("Data_Referencia", "")):
            m[c] = l
    return m


def dados_fii():
    ano = datetime.now().year
    geral, comp, imoveis = [], [], []
    for a in (ano - 1, ano):
        try:
            arqs = ler_zip(f"https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{a}.zip")
            for nm, linhas in arqs.items():
                if "geral" in nm: geral += linhas
                if "complemento" in nm: comp += linhas
        except Exception as e:
            log("cvm mensal", a, e)
        try:
            arqs = ler_zip(f"https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_{a}.zip")
            for nm, linhas in arqs.items():
                if nm.endswith(f"imovel_{a}.csv"): imoveis += linhas
        except Exception as e:
            log("cvm trimestral", a, e)
    g, c = ultimo_por_cnpj(geral), ultimo_por_cnpj(comp)
    # vacância ponderada pela receita de cada imóvel, no trimestre mais recente de cada fundo
    vac = {}
    ult = {}
    for l in imoveis:
        cn = l.get("CNPJ_Fundo_Classe")
        if cn and l.get("Data_Referencia", "") >= ult.get(cn, ""):
            ult[cn] = l.get("Data_Referencia", "")
    acc = {}
    for l in imoveis:
        cn = l.get("CNPJ_Fundo_Classe")
        if not cn or l.get("Data_Referencia") != ult.get(cn):
            continue
        v = num(l.get("Percentual_Vacancia"))
        w = num(l.get("Percentual_Receitas_FII")) or num(l.get("Percentual_Imovel_Total_Investido")) or 0
        if v is None:
            continue
        acc.setdefault(cn, []).append((v, w))
    for cn, lst in acc.items():
        fator = 100 if max(v for v, _ in lst) <= 1 else 1
        tw = sum(w for _, w in lst)
        vac[cn] = (sum(v * w for v, w in lst) / tw if tw else sum(v for v, _ in lst) / len(lst)) * fator
    col = lambda row, *chaves: next((row[k] for k in row if all(ch.lower() in k.lower() for ch in chaves)), None)
    fiis = {}
    for cn, l in g.items():
        isin = (l.get("Codigo_ISIN") or "").strip()
        if len(isin) < 7 or not isin.startswith("BR") or (l.get("Mercado_Negociacao_Bolsa") or "").upper() != "S":
            continue
        t = isin[2:6] + "11"
        cc = c.get(cn, {})
        fiis[t] = {
            "nome": l.get("Nome_Fundo_Classe"), "seg": l.get("Segmento_Atuacao"), "mandato": l.get("Mandato"),
            "gestao": l.get("Tipo_Gestao"), "adm": l.get("Nome_Administrador"),
            "vpc": num(col(cc, "Patrimonial", "Cota")), "dyMes": num(col(cc, "Dividend_Yield")),
            "vac": round(vac[cn], 2) if cn in vac else None, "ref": l.get("Data_Referencia"),
        }
    return fiis


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    ant = {"ativos": {}, "fiis": {}, "fund": {}, "cvm_em": ""}
    for arq in (SAIDA, CACHE):
        try:
            with open(arq, encoding="utf-8") as f:
                ant.update(json.load(f))
        except Exception:
            pass
    hoje = datetime.now(timezone.utc).date().isoformat()

    fiis = ant.get("fiis", {})
    if ant.get("cvm_em") != hoje or not fiis:
        try:
            novos = dados_fii()
            if novos:
                fiis, ant["cvm_em"] = novos, hoje
                log("FIIs CVM:", len(fiis))
        except Exception as e:
            log("cvm", e)

    try:
        cr = crumb()
    except Exception as e:
        log("crumb", e); cr = ""
    universo = sorted(set(ACOES + ETFS + list(fiis.keys())))
    cot = cotacoes(universo, cr) if cr else {}
    log("cotações:", len(cot))

    fund = ant.get("fund", {})
    limite = (datetime.now(timezone.utc) - timedelta(days=3)).date().isoformat()
    pendentes = sorted([t for t in ACOES if t in cot and fund.get(t, {}).get("em", "") < limite], key=lambda t: fund.get(t, {}).get("em", ""))
    for t in pendentes[:60]:
        try:
            fund[t] = fundamentos(t, cr)
        except Exception as e:
            log("fund", t, e)
        time.sleep(0.5)

    ativos = ant.get("ativos", {})
    for t, q in cot.items():
        if q.get("p") is None:
            continue
        tipo = "fii" if t in fiis else "etf" if t in ETFS else "acao"
        a = {"t": tipo, **q}
        if not a.get("dy"):
            a.pop("dy", None)
        if tipo == "acao" and t in fund:
            a.update({k: v for k, v in fund[t].items() if k != "em"})
        if tipo == "fii":
            fi = fiis[t]
            a.update({k: fi[k] for k in ("seg", "mandato", "gestao", "adm", "vac", "vpc", "dyMes")})
            if fi.get("vpc") and q.get("p"):
                a["pvp"] = q["p"] / fi["vpc"]
                # dividend yield estimado pelo último rendimento informado à CVM, se o Yahoo não trouxer
                if not a.get("dy") and fi.get("dyMes"):
                    a["dy"] = fi["dyMes"] * fi["vpc"] * 12 / q["p"] * 100
                    a["dyEst"] = True
            a["n"] = fi.get("nome") or a["n"]
        ativos[t] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in a.items() if v is not None}
    if not ativos:
        log("Sem dados; mantendo o arquivo anterior."); return
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ativos": ativos}, f, ensure_ascii=False, separators=(",", ":"))
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump({"cvm_em": ant.get("cvm_em", ""), "fiis": fiis, "fund": fund}, f, ensure_ascii=False, separators=(",", ":"))
    log("ativos:", len(ativos))


if __name__ == "__main__":
    main()
