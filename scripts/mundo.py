"""Radar de ETFs (B3) e Radar internacional (ETFs e ações dos EUA/ADRs).
Cotações do Yahoo (gráfico diário de 1 ano) e, para as ações, P/L, DY, valor de mercado e data de resultado
(quote com cookie + crumb). Grava radar_mundo.json. O catálogo (com a explicação de uma linha) fica aqui."""
import json, os, sys, time, urllib.request, urllib.parse, http.cookiejar
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "radar_mundo.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"}


def log(*a):
    print("[mundo]", *a, file=sys.stderr, flush=True)


# ---------------- Catálogo: ticker, categoria, explicação curta ----------------
B3_ETF = [
    # Ações Brasil
    ("BOVA11", "Ações Brasil", "Ibovespa: as principais ações da B3 (o mais negociado)"),
    ("BOVV11", "Ações Brasil", "Ibovespa, versão do Itaú"),
    ("BOVX11", "Ações Brasil", "Ibovespa com taxa de administração baixa"),
    ("BOVB11", "Ações Brasil", "Ibovespa, versão do Bradesco"),
    ("XBOV11", "Ações Brasil", "Ibovespa, versão da Caixa"),
    ("BRAX11", "Ações Brasil", "IBrX-100: as 100 ações mais negociadas"),
    ("PIBB11", "Ações Brasil", "IBrX-50: as 50 ações mais negociadas"),
    ("SMAL11", "Ações Brasil", "Small caps: empresas menores da bolsa"),
    ("SMAC11", "Ações Brasil", "Small caps, versão do Itaú"),
    ("DIVO11", "Ações Brasil", "Ações que pagam bons dividendos (índice IDIV)"),
    ("BBSD11", "Ações Brasil", "Ações boas pagadoras de dividendos (Banco do Brasil)"),
    ("FIND11", "Ações Brasil", "Setor financeiro: bancos, seguradoras e bolsa"),
    ("MATB11", "Ações Brasil", "Materiais básicos: mineração, siderurgia e papel"),
    ("ISUS11", "Ações Brasil", "Empresas com boas práticas de sustentabilidade (ISE)"),
    ("ECOO11", "Ações Brasil", "Empresas que emitem menos carbono (ICO2)"),
    ("GOVE11", "Ações Brasil", "Empresas com governança corporativa diferenciada"),
    ("UTIP11", "Ações Brasil", "Utilidade pública: energia elétrica e saneamento"),
    # Imobiliário
    ("XFIX11", "Imobiliário", "IFIX: carteira dos principais fundos imobiliários"),
    # Renda fixa
    ("LFTS11", "Renda fixa", "Tesouro Selic: acompanha a taxa Selic"),
    ("IMAB11", "Renda fixa", "Tesouro IPCA+ de todos os prazos (IMA-B)"),
    ("B5P211", "Renda fixa", "Tesouro IPCA+ com vencimento até 5 anos (IMA-B 5)"),
    ("B5MB11", "Renda fixa", "Tesouro IPCA+ até 5 anos, versão do Itaú"),
    ("IMBB11", "Renda fixa", "Tesouro IPCA+ de todos os prazos, versão do Itaú"),
    ("IB5M11", "Renda fixa", "Tesouro IPCA+ com vencimento acima de 5 anos (IMA-B 5+)"),
    ("NTNS11", "Renda fixa", "Tesouro IPCA+ (NTN-B) de prazo curto"),
    ("IRFM11", "Renda fixa", "Tesouro Prefixado de vários prazos (IRF-M)"),
    ("FIXA11", "Renda fixa", "Juro prefixado de cerca de 3 anos (DI futuro)"),
    ("5PRE11", "Renda fixa", "Tesouro Prefixado de cerca de 5 anos"),
    # Exterior em reais
    ("IVVB11", "Exterior", "S&P 500 (500 maiores dos EUA) em reais, com o dólar"),
    ("SPXI11", "Exterior", "S&P 500 em reais, versão do Itaú"),
    ("NASD11", "Exterior", "Nasdaq-100: gigantes de tecnologia dos EUA, em reais"),
    ("TECK11", "Exterior", "Empresas de tecnologia dos EUA, em reais"),
    ("ACWI11", "Exterior", "Ações do mundo todo (MSCI ACWI), em reais"),
    ("WRLD11", "Exterior", "Ações de países desenvolvidos, em reais"),
    ("EURP11", "Exterior", "Ações da Europa, em reais"),
    ("XINA11", "Exterior", "Ações da China, em reais"),
    ("ASIA11", "Exterior", "Ações da Ásia, em reais"),
    ("GOLD11", "Ouro", "Ouro, em reais"),
    # Cripto
    ("HASH11", "Cripto", "Cesta das maiores criptomoedas (Nasdaq Crypto Index)"),
    ("QBTC11", "Cripto", "Bitcoin"),
    ("BITH11", "Cripto", "Bitcoin, versão da Hashdex"),
    ("ETHE11", "Cripto", "Ethereum"),
    ("QETH11", "Cripto", "Ethereum, versão da QR"),
    ("SOLH11", "Cripto", "Solana"),
    ("XRPH11", "Cripto", "XRP (Ripple)"),
    ("DEFI11", "Cripto", "Criptomoedas de finanças descentralizadas (DeFi)"),
    ("WEB311", "Cripto", "Criptomoedas ligadas à Web 3"),
]

US_ETF = [
    ("SPY", "Ações EUA", "S&P 500: as 500 maiores dos EUA (o ETF mais negociado do mundo)"),
    ("VOO", "Ações EUA", "S&P 500 com taxa baixíssima (Vanguard)"),
    ("IVV", "Ações EUA", "S&P 500, versão da iShares"),
    ("QQQ", "Ações EUA", "Nasdaq-100: as gigantes de tecnologia"),
    ("VTI", "Ações EUA", "Todo o mercado de ações americano"),
    ("DIA", "Ações EUA", "Dow Jones: 30 empresas gigantes e tradicionais"),
    ("IWM", "Ações EUA", "Russell 2000: empresas menores dos EUA"),
    ("RSP", "Ações EUA", "S&P 500 com o mesmo peso para cada empresa"),
    ("SCHD", "Dividendos", "Empresas americanas boas pagadoras de dividendos"),
    ("VIG", "Dividendos", "Empresas que aumentam os dividendos todo ano"),
    ("VYM", "Dividendos", "Ações americanas de dividendo alto"),
    ("XLK", "Setores", "Tecnologia (Apple, Microsoft, Nvidia...)"),
    ("XLF", "Setores", "Setor financeiro: bancos e seguradoras"),
    ("XLE", "Setores", "Energia: petróleo e gás"),
    ("XLV", "Setores", "Saúde: farmacêuticas e planos de saúde"),
    ("XLY", "Setores", "Consumo não essencial (Amazon, Tesla...)"),
    ("XLP", "Setores", "Consumo básico: alimentos, bebidas e higiene"),
    ("XLI", "Setores", "Indústria: aviação, máquinas e transporte"),
    ("XLU", "Setores", "Utilidade pública: energia elétrica e água"),
    ("XLB", "Setores", "Materiais: química, mineração e embalagens"),
    ("XLRE", "Setores", "Imobiliário (REITs do S&P 500)"),
    ("XLC", "Setores", "Comunicação (Google, Meta, Netflix...)"),
    ("SMH", "Temáticos", "Semicondutores: fabricantes de chips"),
    ("SOXX", "Temáticos", "Semicondutores, versão da iShares"),
    ("IGV", "Temáticos", "Empresas de software"),
    ("ARKK", "Temáticos", "Inovação disruptiva, gestão ativa de Cathie Wood"),
    ("BOTZ", "Temáticos", "Robótica e inteligência artificial"),
    ("CIBR", "Temáticos", "Cibersegurança"),
    ("ICLN", "Temáticos", "Energia limpa (solar, eólica...)"),
    ("XBI", "Temáticos", "Biotecnologia"),
    ("URA", "Temáticos", "Urânio e energia nuclear"),
    ("ITA", "Temáticos", "Aeroespacial e defesa"),
    ("ACWI", "Mundo", "Ações do mundo todo"),
    ("VXUS", "Mundo", "Ações do mundo todo, menos os EUA"),
    ("VEA", "Mundo", "Países desenvolvidos fora os EUA"),
    ("EFA", "Mundo", "Europa, Japão e Austrália (desenvolvidos ex-EUA)"),
    ("VWO", "Mundo", "Países emergentes (Vanguard)"),
    ("EEM", "Mundo", "Países emergentes (iShares)"),
    ("VGK", "Países", "Europa"),
    ("EWJ", "Países", "Japão"),
    ("FXI", "Países", "China: 50 maiores empresas"),
    ("MCHI", "Países", "China: mercado amplo"),
    ("KWEB", "Países", "Internet chinesa (Alibaba, Tencent...)"),
    ("INDA", "Países", "Índia"),
    ("EWZ", "Países", "Brasil (ações brasileiras negociadas em Nova York)"),
    ("EWW", "Países", "México"),
    ("ARGT", "Países", "Argentina"),
    ("EWG", "Países", "Alemanha"),
    ("EWU", "Países", "Reino Unido"),
    ("EWY", "Países", "Coreia do Sul"),
    ("EWT", "Países", "Taiwan"),
    ("SGOV", "Renda fixa", "Títulos do Tesouro americano de até 3 meses (caixa em dólar)"),
    ("BIL", "Renda fixa", "Títulos do Tesouro americano de 1 a 3 meses"),
    ("SHY", "Renda fixa", "Tesouro americano de 1 a 3 anos"),
    ("IEF", "Renda fixa", "Tesouro americano de 7 a 10 anos"),
    ("TLT", "Renda fixa", "Tesouro americano de mais de 20 anos (oscila muito com os juros)"),
    ("TIP", "Renda fixa", "Tesouro americano atrelado à inflação"),
    ("AGG", "Renda fixa", "Renda fixa americana ampla (governo e empresas)"),
    ("BND", "Renda fixa", "Renda fixa americana ampla (Vanguard)"),
    ("LQD", "Renda fixa", "Títulos de empresas com grau de investimento"),
    ("HYG", "Renda fixa", "High yield: títulos de empresas de maior risco"),
    ("EMB", "Renda fixa", "Títulos de governos de países emergentes, em dólar"),
    ("GLD", "Commodities", "Ouro"),
    ("IAU", "Commodities", "Ouro com taxa menor"),
    ("SLV", "Commodities", "Prata"),
    ("USO", "Commodities", "Petróleo (via contratos futuros)"),
    ("UNG", "Commodities", "Gás natural (via contratos futuros)"),
    ("DBC", "Commodities", "Cesta de commodities"),
    ("GDX", "Commodities", "Mineradoras de ouro"),
    ("COPX", "Commodities", "Mineradoras de cobre"),
    ("VNQ", "Imobiliário", "REITs: fundos imobiliários americanos"),
    ("IBIT", "Cripto", "Bitcoin (BlackRock), o maior ETF de bitcoin"),
    ("FBTC", "Cripto", "Bitcoin (Fidelity)"),
    ("ETHA", "Cripto", "Ethereum (BlackRock)"),
    ("TQQQ", "Alavancados", "3 vezes o movimento diário do Nasdaq-100 (alto risco)"),
    ("SQQQ", "Alavancados", "Ganha 3 vezes quando o Nasdaq-100 cai (alto risco)"),
]

STOCKS = [
    ("AAPL", "Tecnologia", "iPhone, Mac e serviços"),
    ("MSFT", "Tecnologia", "Windows, Office e a nuvem Azure"),
    ("NVDA", "Tecnologia", "Chips para inteligência artificial e games"),
    ("AVGO", "Tecnologia", "Chips e software de infraestrutura"),
    ("ORCL", "Tecnologia", "Banco de dados e nuvem"),
    ("AMD", "Tecnologia", "Processadores e chips de IA"),
    ("CRM", "Tecnologia", "Software de vendas (CRM) na nuvem"),
    ("ADBE", "Tecnologia", "Photoshop, PDF e softwares criativos"),
    ("CSCO", "Tecnologia", "Equipamentos de rede e internet"),
    ("INTC", "Tecnologia", "Processadores"),
    ("IBM", "Tecnologia", "Software, nuvem e consultoria"),
    ("QCOM", "Tecnologia", "Chips para celulares"),
    ("PLTR", "Tecnologia", "Software de análise de dados e IA"),
    ("TSM", "Tecnologia", "TSMC: maior fabricante de chips do mundo (Taiwan)"),
    ("ASML", "Tecnologia", "Máquinas que fabricam chips (Holanda)"),
    ("SAP", "Tecnologia", "Software de gestão para empresas (Alemanha)"),
    ("SHOP", "Tecnologia", "Plataforma para lojas online (Canadá)"),
    ("GOOGL", "Comunicação", "Google, YouTube e nuvem"),
    ("META", "Comunicação", "Facebook, Instagram e WhatsApp"),
    ("NFLX", "Comunicação", "Streaming de filmes e séries"),
    ("DIS", "Comunicação", "Disney: parques, filmes e streaming"),
    ("SPOT", "Comunicação", "Streaming de música (Suécia)"),
    ("AMZN", "Consumo", "Comércio eletrônico e a nuvem AWS"),
    ("TSLA", "Consumo", "Carros elétricos e baterias"),
    ("WMT", "Consumo", "Walmart: maior varejista do mundo"),
    ("COST", "Consumo", "Costco: atacado com clube de assinatura"),
    ("HD", "Consumo", "Home Depot: material de construção"),
    ("MCD", "Consumo", "McDonald's: fast-food"),
    ("NKE", "Consumo", "Nike: artigos esportivos"),
    ("SBUX", "Consumo", "Starbucks: cafeterias"),
    ("KO", "Consumo", "Coca-Cola: bebidas"),
    ("PEP", "Consumo", "PepsiCo: bebidas e salgadinhos"),
    ("PG", "Consumo", "Procter & Gamble: higiene e limpeza"),
    ("BABA", "Consumo", "Alibaba: comércio eletrônico (China)"),
    ("PDD", "Consumo", "Dona da Temu e da Pinduoduo (China)"),
    ("MELI", "Consumo", "Mercado Livre: e-commerce e Mercado Pago (América Latina)"),
    ("TM", "Consumo", "Toyota: montadora (Japão)"),
    ("SONY", "Consumo", "Sony: games, música e eletrônicos (Japão)"),
    ("UBER", "Consumo", "Transporte e entregas por aplicativo"),
    ("ABNB", "Consumo", "Airbnb: hospedagem por aplicativo"),
    ("JPM", "Financeiro", "JPMorgan: maior banco dos EUA"),
    ("BAC", "Financeiro", "Bank of America: banco"),
    ("GS", "Financeiro", "Goldman Sachs: banco de investimento"),
    ("MS", "Financeiro", "Morgan Stanley: banco de investimento e gestão de fortunas"),
    ("V", "Financeiro", "Visa: rede de pagamentos com cartão"),
    ("MA", "Financeiro", "Mastercard: rede de pagamentos com cartão"),
    ("BRK-B", "Financeiro", "Berkshire Hathaway: a holding de Warren Buffett"),
    ("COIN", "Financeiro", "Coinbase: corretora de criptomoedas"),
    ("MSTR", "Financeiro", "Strategy: empresa que acumula bitcoin"),
    ("NU", "Financeiro", "Nubank: banco digital (Brasil)"),
    ("LLY", "Saúde", "Eli Lilly: remédios para obesidade e diabetes"),
    ("UNH", "Saúde", "UnitedHealth: planos de saúde"),
    ("JNJ", "Saúde", "Johnson & Johnson: remédios e equipamentos médicos"),
    ("ABBV", "Saúde", "AbbVie: farmacêutica"),
    ("MRK", "Saúde", "Merck: farmacêutica"),
    ("PFE", "Saúde", "Pfizer: farmacêutica"),
    ("NVO", "Saúde", "Novo Nordisk: dona do Ozempic (Dinamarca)"),
    ("AZN", "Saúde", "AstraZeneca: farmacêutica (Reino Unido)"),
    ("XOM", "Energia e indústria", "ExxonMobil: petróleo e gás"),
    ("CVX", "Energia e indústria", "Chevron: petróleo e gás"),
    ("SHEL", "Energia e indústria", "Shell: petróleo e gás (Reino Unido)"),
    ("BA", "Energia e indústria", "Boeing: aviões"),
    ("GE", "Energia e indústria", "GE Aerospace: motores de avião"),
    ("CAT", "Energia e indústria", "Caterpillar: máquinas pesadas"),
]


# ---------------- Yahoo ----------------
_OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
_OP.addheaders = list(UA.items())


def get(url, timeout=30):
    return _OP.open(url, timeout=timeout).read()


def grafico(sym):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=1y&interval=1d"))
    r = j["chart"]["result"][0]
    m = r["meta"]
    off = m.get("gmtoffset") or 0
    ts = r.get("timestamp") or []
    cl = (r.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    pts = [(datetime.fromtimestamp(t + off, timezone.utc).date(), c) for t, c in zip(ts, cl) if c]
    if not pts:
        raise ValueError("sem pontos")
    preco = m.get("regularMarketPrice") or pts[-1][1]
    t = m.get("regularMarketTime") or ts[-1]
    hoje = datetime.fromtimestamp(t + off, timezone.utc).date()
    antes = [c for d, c in pts if d < hoje]
    ano = [c for d, c in pts if d.year < hoje.year]
    mes = [c for d, c in pts if d <= hoje - timedelta(days=30)]
    pc = lambda base: round((preco / base - 1) * 100, 2) if base else None
    per = (m.get("currentTradingPeriod") or {}).get("regular") or {}
    agora = time.time()
    return {"p": round(preco, 4), "var": pc(antes[-1] if antes else m.get("chartPreviousClose")),
            "mes": pc(mes[-1] if mes else None), "ano": pc(ano[-1] if ano else None),
            "a12": pc(pts[0][1]) if (hoje - pts[0][0]).days > 300 else None,
            "min12": round(min(c for _, c in pts), 4), "max12": round(max(c for _, c in pts), 4),
            "t": t, "aberto": bool(per.get("start") and per["start"] <= agora <= per.get("end", 0) and agora - t < 3600),
            "moeda": m.get("currency"), "nome": m.get("longName") or m.get("shortName"),
            "vol": round(sum(v or 0 for v in ((r.get("indicators", {}).get("quote") or [{}])[0].get("volume") or [])[-20:]) / 20)}


def fundamentos(simbolos, debug):
    """P/L, DY, valor de mercado e próxima data de resultado das ações (quote v7 com crumb)."""
    out = {}
    try:
        try:
            get("https://fc.yahoo.com/")
        except Exception:
            pass  # responde 404, mas grava o cookie
        crumb = get("https://query2.finance.yahoo.com/v1/test/getcrumb").decode().strip()
        for i in range(0, len(simbolos), 40):
            lote = ",".join(simbolos[i:i + 40])
            j = json.loads(get(f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={urllib.parse.quote(lote)}&crumb={urllib.parse.quote(crumb)}"))
            for q in j.get("quoteResponse", {}).get("result", []):
                ets = q.get("earningsTimestampStart") or q.get("earningsTimestamp")
                dy = q.get("trailingAnnualDividendYield")
                out[q["symbol"]] = {
                    "pl": round(q["trailingPE"], 1) if q.get("trailingPE") else None,
                    "pvp": round(q["priceToBook"], 2) if q.get("priceToBook") else None,
                    "dy": round(dy * 100, 2) if dy else None,
                    "mcap": q.get("marketCap"),
                    "res": datetime.fromtimestamp(ets, timezone.utc).date().isoformat() if ets else None,
                    "nome": q.get("longName") or q.get("shortName"),
                }
    except Exception as e:
        debug["quote"] = repr(e)[:160]
    return out


def main():
    debug = {}
    cat = {}
    for lista, itens in (("b3etf", B3_ETF), ("etf", US_ETF), ("acoes", STOCKS)):
        for tk, c, d in itens:
            sym = tk + ".SA" if lista == "b3etf" else tk
            cat[(lista, tk)] = (sym, c, d)

    def seguro(chave):
        sym = cat[chave][0]
        try:
            return chave, grafico(sym), None
        except Exception as e:
            return chave, None, repr(e)[:90]

    Q = {}
    with ThreadPoolExecutor(8) as ex:
        for chave, q, erro in ex.map(seguro, list(cat)):
            if q:
                Q[chave] = q
            else:
                debug[f"{chave[0]}:{chave[1]}"] = erro
    log("cotações:", len(Q), "de", len(cat))
    if len(Q) < 60:
        log("Poucas cotações; mantendo o arquivo anterior.", debug); return
    F = fundamentos([t for t, _, _ in STOCKS], debug)
    log("fundamentos:", len(F), {k: v for k, v in debug.items() if k == "quote"})
    saida = {"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "debug": debug}
    for lista, itens in (("b3etf", B3_ETF), ("etf", US_ETF), ("acoes", STOCKS)):
        L = []
        for tk, c, d in itens:
            q = Q.get((lista, tk))
            if not q:
                continue
            item = {"tk": tk, "cat": c, "desc": d, **q}
            if lista == "acoes":
                f = F.get(tk, {})
                item.update({k: v for k, v in f.items() if v is not None})
            L.append(item)
        saida[lista] = L
    sem = [k for k in debug if k.startswith("b3etf:")]
    log("ETFs da B3 sem cotação (ficam de fora):", sem)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
