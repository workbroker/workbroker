"""Página XP Inc. -> xp.json (uma vez por dia, ou no push com FORCAR)
- Cotações e dividendos (Yahoo Finance): XP (Nasdaq), XPBR31 (BDR), concorrentes e Ibovespa.
- Balanço anual (SEC, XBRL do 20-F): lucro, patrimônio, receita e ações (XP, Nubank, Inter).
- Concorrentes listados na B3 (BTG, Itaú, Bradesco): indicadores já calculados no radar.json.
- Releases de resultado e documentos recentes (SEC EDGAR, 6-K) -> calendário e lista de documentos.
- Manchetes (Google Notícias RSS), só título, fonte, data e link.
"""
import json, os, re, sys, time, html, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta, date

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "xp.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
# a SEC exige nome e e-mail de contato no User-Agent (endereço genérico do GitHub, não pessoal)
SEC_UA = {"User-Agent": "WorkBroker workbroker@users.noreply.github.com", "Accept": "application/json,text/html,*/*", "Accept-Encoding": "identity"}
HOJE = datetime.now(timezone(timedelta(hours=-3)))

# ticker Yahoo -> (rótulo, nome, bolsa, ticker SEC)
PAPEIS = {
    "XP": ("XP", "XP Inc.", "Nasdaq", "XP"),
    "XPBR31.SA": ("XPBR31", "XP Inc. (BDR)", "B3", None),
    "BPAC11.SA": ("BPAC11", "BTG Pactual", "B3", None),
    "ITUB4.SA": ("ITUB4", "Itaú Unibanco", "B3", None),
    "BBDC4.SA": ("BBDC4", "Bradesco", "B3", None),
    "NU": ("NU", "Nubank", "NYSE", "NU"),
    "INTR": ("INTR", "Inter&Co", "Nasdaq", "INTR"),
    "^BVSP": ("IBOV", "Ibovespa", "B3", None),
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, timeout=60, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers or UA), timeout=timeout).read()


def yahoo(sym):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=2y&interval=1d&events=div"))
    r = j["chart"]["result"][0]; m = r["meta"]
    off = m.get("gmtoffset", 0)
    pts = [(datetime.fromtimestamp(t + off, timezone.utc).date().isoformat(), c)
           for t, c in zip(r.get("timestamp") or [], r["indicators"]["quote"][0].get("close") or []) if c]
    preco = m.get("regularMarketPrice") or pts[-1][1]
    dia = datetime.fromtimestamp((m.get("regularMarketTime") or 0) + off, timezone.utc).date().isoformat()
    ant = [c for d, c in pts if d < dia]
    um_ano = (date.fromisoformat(dia) - timedelta(days=365)).isoformat()
    base12 = next((c for d, c in pts if d >= um_ano), None)
    ini_ano = [c for d, c in pts if d < f"{dia[:4]}-01-01"]
    divs = sum(v.get("amount", 0) for v in (r.get("events", {}).get("dividends") or {}).values() if v.get("date", 0) >= time.time() - 365 * 86400)
    v = lambda a: round((preco / a - 1) * 100, 2) if a else None
    ult12 = [(d, c) for d, c in pts if d >= um_ano]
    semanal = ult12[::5] + ([ult12[-1]] if ult12 and ult12[-1] != ult12[::5][-1] else [])
    return {"preco": round(preco, 2), "moeda": m.get("currency"), "var": v(ant[-1] if ant else None), "ano": v(ini_ano[-1] if ini_ano else None),
            "a12": v(base12), "max52": round(max(c for _, c in ult12), 2) if ult12 else None, "min52": round(min(c for _, c in ult12), 2) if ult12 else None,
            "dy": round(divs / preco * 100, 2) if divs and preco else 0, "t": m.get("regularMarketTime"),
            "serie": [(d, round(c, 4)) for d, c in semanal]}


# ---------------- SEC ----------------
def sec_json(url):
    time.sleep(0.15)
    return json.loads(get(url, 60, SEC_UA))


def cik_de(tickers):
    m = {}
    for x in sec_json("https://www.sec.gov/files/company_tickers.json").values():
        if x["ticker"] in tickers:
            m[x["ticker"]] = str(x["cik_str"]).zfill(10)
    return m


def anual(facts, nomes, debug, rot):
    """Série anual (20-F, FY) do primeiro conceito encontrado -> {ano: (valor, moeda)}."""
    for ns in ("ifrs-full", "us-gaap"):
        for n in nomes:
            f = facts.get("facts", {}).get(ns, {}).get(n)
            if not f:
                continue
            for un, vals in f.get("units", {}).items():
                out = {}
                for x in vals:
                    if x.get("form", "").startswith("20-F") and x.get("fp") == "FY" and x.get("end"):
                        ini = x.get("start")
                        if ini and (date.fromisoformat(x["end"]) - date.fromisoformat(ini)).days < 300:
                            continue
                        out[x["end"][:4]] = (x["val"], un)
                if out:
                    debug[rot] = f"{ns}:{n} {un}"
                    return out
    return {}


def acoes_em_circulacao(facts):
    f = facts.get("facts", {}).get("dei", {}).get("EntityCommonStockSharesOutstanding", {})
    vals = [x for u in f.get("units", {}).values() for x in u]
    if not vals:
        return None
    fim = max(x["end"] for x in vals)
    vistos, tot = set(), 0
    for x in vals:  # uma linha por classe de ação na mesma data (classes A e B)
        if x["end"] == fim and (x.get("accn"), x["val"]) not in vistos:
            vistos.add((x.get("accn"), x["val"])); tot += x["val"]
    return {"qt": tot, "data": fim}


def fundamentos_sec(cik, debug, rot):
    f = sec_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")
    lucro = anual(f, ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss", "NetIncomeLoss"], debug, rot + ":lucro")
    pl = anual(f, ["EquityAttributableToOwnersOfParent", "Equity", "StockholdersEquity"], debug, rot + ":pl")
    rec = anual(f, ["Revenue", "RevenueFromContractsWithCustomers", "Revenues", "InterestAndFeeIncome"], debug, rot + ":receita")
    anos = sorted(set(lucro) | set(pl) | set(rec))[-4:]
    return {"anos": [{"ano": a, "lucro": lucro.get(a, (None,))[0], "pl": pl.get(a, (None,))[0], "receita": rec.get(a, (None,))[0],
                      "moeda": (lucro.get(a) or pl.get(a) or rec.get(a) or (None, None))[1]} for a in anos],
            "acoes": acoes_em_circulacao(f)}


TRI = re.compile(r"\b(first|second|third|fourth|1st|2nd|3rd|4th|[1-4]Q)\s*(?:quarter)?\s*(?:of\s*)?(?:fiscal\s*)?(?:year\s*)?'?(20\d\d|\d\d)\b", re.I)
NUM_TRI = {"first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4}


def documentos_sec(cik, debug):
    """6-K dos últimos ~2 anos: título do anexo principal; os releases de resultado viram o calendário."""
    sub = sec_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
    r = sub["filings"]["recent"]
    lim = (HOJE - timedelta(days=760)).date().isoformat()
    docs, res = [], []
    for form, dt, acc, prim, desc in zip(r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"], r["primaryDocDescription"]):
        if dt < lim or form not in ("6-K", "20-F", "F-3", "SC 13G", "SC 13G/A"):
            continue
        base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/"
        item = {"d": dt, "f": form, "l": base + prim, "t": desc or form}
        if form == "6-K":
            try:
                idx = sec_json(base + "index.json")
                nomes = [x["name"] for x in idx.get("directory", {}).get("item", [])]
                ex = next((n for n in nomes if re.search(r"ex[-_]?99", n, re.I) and n.lower().endswith((".htm", ".html"))), None)
                alvo = ex or prim
                time.sleep(0.15)
                txt = get(base + alvo, 60, SEC_UA)[:60000].decode("utf-8", "ignore")
                txt = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", txt))).strip()
                titulo = re.sub(r"^(Exhibit|EX-?)\s*99\.?\d*\s*", "", txt, flags=re.I)[:220]
                item["l"] = base + alvo
                item["t"] = titulo
                m = re.search(r"(reports?|announces?|presents?)[^.]{0,80}(results|earnings)", txt[:1500], re.I) and TRI.search(txt[:1500])
                mm = re.search(r"6k[-_]?([1-4])q(\d\d)", prim, re.I)  # ex.: dp229049_6k-1q25.htm
                if mm and not m:
                    q, a = int(mm.group(1)), 2000 + int(mm.group(2))
                    res.append({"d": dt, "tri": f"{q}T{str(a)[2:]}", "l": item["l"]}); item["res"] = f"{q}T{str(a)[2:]}"
                if m:
                    q = m.group(1).lower(); q = NUM_TRI.get(q, int(q[0]) if q[0].isdigit() else None)
                    a = m.group(2); a = int(a) if len(a) == 4 else 2000 + int(a)
                    if q:
                        res.append({"d": dt, "tri": f"{q}T{str(a)[2:]}", "l": item["l"]})
                        item["res"] = f"{q}T{str(a)[2:]}"
            except Exception as e:
                debug.setdefault("sec_erros", []).append(f"{acc}: {repr(e)[:80]}")
        docs.append(item)
        if len(docs) >= 40:
            break
    # um registro por trimestre (o primeiro release)
    vistos, cal = set(), []
    for x in sorted(res, key=lambda x: x["d"]):
        if x["tri"] not in vistos:
            vistos.add(x["tri"]); cal.append(x)
    return docs[:25], cal


def proximo(cal):
    """Próximo resultado: mesmo trimestre do ano anterior + 364 dias (mantém o dia da semana)."""
    if not cal:
        return None
    u = cal[-1]; q, a = int(u["tri"][0]), int(u["tri"][2:])
    q, a = (1, a + 1) if q == 4 else (q + 1, a)
    base = next((x for x in cal if x["tri"] == f"{q}T{a - 1:02d}"), None)
    if not base:
        return {"tri": f"{q}T{a:02d}", "d": None}
    d = date.fromisoformat(base["d"]) + timedelta(days=364)
    return {"tri": f"{q}T{a:02d}", "d": d.isoformat(), "est": 1}


def noticias():
    q = urllib.parse.quote('"XP Inc" OR XPBR31')
    x = get(f"https://news.google.com/rss/search?q={q}&hl=pt-BR&gl=BR&ceid=BR:pt-419")
    out = []
    for it in ET.fromstring(x).iter("item"):
        t = it.findtext("title") or ""; fonte = it.findtext("source") or ""
        t = re.sub(r"\s+-\s+" + re.escape(fonte) + r"$", "", t) if fonte else t
        try:
            d = datetime.strptime(it.findtext("pubDate"), "%a, %d %b %Y %H:%M:%S %Z").date().isoformat()
        except Exception:
            d = None
        out.append({"t": t[:200], "f": fonte, "d": d, "l": it.findtext("link")})
    # só o que fala da XP Inc. (o portal de análises da XP aparece com relatórios sobre outras empresas)
    out = [n for n in out if re.search(r"\bXP\b|XPBR31|XP Inc", n["t"]) and not re.search(r"\|\s*Resultados|Resultados do \dT\d\d de", n["t"])]
    out.sort(key=lambda x: x["d"] or "", reverse=True)
    return out[:12]


def main():
    debug = {}
    try:
        with open(SAIDA, encoding="utf-8") as f:
            ant = json.load(f)
        idade = (datetime.now(timezone.utc) - datetime.fromisoformat(ant["atualizado"])).total_seconds() / 3600
        if idade < 20 and not os.environ.get("FORCAR"):
            log(f"xp.json tem {idade:.1f} h; nada a fazer."); return
    except Exception:
        ant = {}
    Q = {}
    for sym, (rot, nome, bolsa, _) in PAPEIS.items():
        try:
            Q[rot] = {"nome": nome, "bolsa": bolsa, **yahoo(sym)}
        except Exception as e:
            log("yahoo", sym, e)
    try:
        j = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?range=5d&interval=1d"))
        usd = j["chart"]["result"][0]["meta"]["regularMarketPrice"]
    except Exception as e:
        log("usd", e); usd = ant.get("usd")
    # concorrentes da B3: indicadores do radar
    try:
        with open(os.path.join(DATA_DIR, "radar.json"), encoding="utf-8") as f:
            rj = json.load(f)
        R = {a["tk"]: a for a in rj.get("acoes", []) + rj.get("outras", [])}
    except Exception as e:
        log("radar", e); R = {}
    for rot in ("BPAC11", "ITUB4", "BBDC4"):
        if rot in Q and rot in R:
            for k in ("pl", "pvp", "roe", "mcap"):
                if R[rot].get(k) is not None:
                    Q[rot][k] = R[rot][k]
    # SEC: XP, Nubank, Inter
    sec, docs, cal = {}, [], []
    try:
        ciks = {"XP": "0001787425", "NU": "0001691493", "INTR": "0001864163"}  # CIK na SEC
        debug["ciks"] = ciks
        for tk, cik in ciks.items():
            try:
                sec[tk] = fundamentos_sec(cik, debug, tk)
            except Exception as e:
                debug[f"sec_{tk}"] = repr(e)[:120]
        if "XP" in ciks:
            docs, cal = documentos_sec(ciks["XP"], debug)
    except Exception as e:
        debug["sec"] = repr(e)[:160]
    for tk, s in sec.items():  # valor de mercado e múltiplos com o último 20-F
        q = Q.get(tk)
        if not q or not s.get("acoes") or not s.get("anos"):
            continue
        u = s["anos"][-1]
        mcap_usd = s["acoes"]["qt"] * q["preco"]
        mcap_moeda = mcap_usd * (usd if u["moeda"] == "BRL" else 1)
        q["mcap"] = round(mcap_usd * usd) if usd else None
        if u.get("lucro"):
            q["pl"] = round(mcap_moeda / u["lucro"], 1)
        if u.get("pl") and u["pl"] > 0:
            q["pvp"] = round(mcap_moeda / u["pl"], 2)
            if u.get("lucro") is not None:
                q["roe"] = round(u["lucro"] / u["pl"] * 100, 1)
        q["ref_balanco"] = u["ano"]
    try:
        news = noticias()
    except Exception as e:
        log("noticias", e); news = ant.get("noticias", [])
    log("cotações:", list(Q), "sec:", {k: len(v.get("anos", [])) for k, v in sec.items()}, "docs:", len(docs), "resultados:", [x["tri"] for x in cal], "notícias:", len(news))
    log("debug:", json.dumps(debug, ensure_ascii=False)[:1500])
    if "XP" not in Q:
        log("Sem cotação da XP; mantendo o arquivo anterior."); return
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "usd": usd, "cot": Q, "sec": sec,
                   "docs": docs, "resultados": cal, "proximo": proximo(cal), "noticias": news, "debug": debug},
                  f, ensure_ascii=False, separators=(",", ":"))
    log("xp.json:", os.path.getsize(SAIDA) // 1024, "KB")


if __name__ == "__main__":
    main()
