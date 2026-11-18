"""Mercado agora: índices, juros dos EUA, moedas, índice do medo e commodities (Yahoo Finance),
mais as bolsas das maiores economias. Roda a cada rodada do Actions (~15 min) e grava mercado.json."""
import json, os, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "mercado.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"}


def log(*a):
    print("[mercado]", *a, file=sys.stderr, flush=True)


def get(url, timeout=30, headers=None):
    h = dict(UA); h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout).read()


# símbolo do Yahoo -> nome exibido (o painel e a descrição ficam no site)
BLOCOS = {
    "eua": ["^GSPC", "^IXIC", "^DJI", "^RUT"],
    "juros": ["2YY=F", "^TNX", "^TYX"],
    "moedas": ["BRL=X", "EURBRL=X", "DX-Y.NYB", "EURUSD=X", "BTC-USD"],
    "medo": ["^VIX"],
    "commodities": ["BZ=F", "CL=F", "GC=F", "SI=F", "HG=F", "ZS=F", "ZC=F", "KC=F"],
    "brasil": ["^BVSP", "SMAL11.SA", "EWZ"],
    "mundo": ["^GSPC", "^IXIC", "^DJI", "000001.SS", "000300.SS", "^HSI", "^GDAXI", "^N225", "^NSEI", "^BSESN",
              "^FTSE", "^FCHI", "FTSEMIB.MI", "^GSPTSE", "^BVSP", "^IBEX", "^KS11", "^AXJO", "^MXX", "^STOXX50E"],
}


def cotar(sym):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=5d&interval=1d"))
    r = j["chart"]["result"][0]
    m = r["meta"]
    preco = m.get("regularMarketPrice")
    t = m.get("regularMarketTime")
    off = m.get("gmtoffset") or 0
    dia = lambda x: datetime.fromtimestamp(x + off, timezone.utc).date()
    ts = r.get("timestamp") or []
    cl = (r.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    ant = [c for x, c in zip(ts, cl) if c and t and dia(x) < dia(t)]
    prev = ant[-1] if ant else m.get("chartPreviousClose")
    per = (m.get("currentTradingPeriod") or {}).get("regular") or {}
    agora = time.time()
    aberto = bool(per.get("start") and per.get("start") <= agora <= per.get("end", 0) and t and agora - t < 3600)
    return {"p": preco, "ant": prev, "var": round((preco / prev - 1) * 100, 2) if preco and prev else None,
            "dif": round(preco - prev, 4) if preco and prev else None, "t": t, "aberto": aberto, "moeda": m.get("currency")}


def medo_cnn(debug):
    """CNN Fear & Greed (0 = medo extremo, 100 = ganância extrema)."""
    try:
        j = json.loads(get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                           headers={"Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"}))
        f = j["fear_and_greed"]
        return {"score": round(f["score"]), "rating": f.get("rating"), "ant": round(f["previous_close"]) if f.get("previous_close") is not None else None,
                "semana": round(f["previous_1_week"]) if f.get("previous_1_week") is not None else None,
                "mes": round(f["previous_1_month"]) if f.get("previous_1_month") is not None else None, "t": f.get("timestamp")}
    except Exception as e:
        debug["cnn"] = repr(e)[:160]
        return None


LETRA = "FGHJKMNQUVXZ"  # meses dos vencimentos de futuros na B3 (F = janeiro)


def di_futuro(debug):
    """Juros futuros (DI1) em 3 prazos: janeiro de daqui a 2, 5 e 9 anos. Cotação da B3 (taxa % a.a.)."""
    ano = datetime.now(timezone(timedelta(hours=-3))).year
    out = []
    for prazo, n in (("curto", 2), ("medio", 5), ("longo", 9)):
        cod = f"DI1F{str(ano + n)[2:]}"
        try:
            j = json.loads(get(f"https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/{cod}", 30))
            tr = (j.get("Trad") or [{}])[0]
            q = tr.get("scty", {}).get("SctyQtn", {})
            taxa, flu = q.get("curPrc"), q.get("prcFlcn")
            # a B3 não traz o ajuste anterior; prcFlcn é a variação % da taxa contra ele
            ant = taxa / (1 + flu / 100) if taxa and flu is not None else None
            out.append({"prazo": prazo, "cod": cod, "venc": f"{ano + n}-01-02", "taxa": taxa, "ant": round(ant, 3) if ant else None,
                        "bps": round((taxa - ant) * 100, 1) if taxa and ant else None,
                        "min": q.get("minPric"), "max": q.get("maxPric"), "contratos": tr.get("ttlQty"),
                        "quando": (j.get("Msg") or {}).get("dtTm")})
        except Exception as e:
            debug[f"di_{cod}"] = repr(e)[:120]
    return out


def main():
    debug = {}
    simbolos = sorted({s for l in BLOCOS.values() for s in l})
    Q = {}
    def seguro(s):
        try:
            return s, cotar(s), None
        except Exception as e:
            return s, None, repr(e)[:100]
    with ThreadPoolExecutor(8) as ex:
        for s, q, erro in ex.map(seguro, simbolos):
            if q:
                Q[s] = q
            else:
                debug[s] = erro
    log("cotações:", len(Q), "de", len(simbolos), "falhas:", debug)
    if len(Q) < 15:
        log("Poucas cotações; mantendo o arquivo anterior."); return
    # IFIX em pontos (B3) e juros do Brasil vêm dos outros arquivos do próprio site
    extra = {}
    try:
        rd = json.load(open(os.path.join(DATA_DIR, "radar.json"), encoding="utf-8"))
        if rd.get("ifix"):
            extra["ifix"] = rd["ifix"]
    except Exception as e:
        debug["radar"] = repr(e)[:100]
    try:
        mc = json.load(open(os.path.join(DATA_DIR, "macro.json"), encoding="utf-8"))
        extra["macro"] = {i["id"]: i.get("valor") for i in mc.get("itens", []) if i.get("id") in ("selic", "cdi", "ipca_12m")}
    except Exception as e:
        debug["macro"] = repr(e)[:100]
    cnn = medo_cnn(debug)
    di = di_futuro(debug)
    log("DI futuro:", di)
    log("CNN Fear & Greed:", cnn)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "q": Q, "cnn": cnn, "di": di, **extra, "debug": debug},
                  fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
