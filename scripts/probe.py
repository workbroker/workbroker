import urllib.request, json, http.cookiejar, io, zipfile, csv
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"}
def get(u, h=UA):
    return op.open(urllib.request.Request(u,headers=h),timeout=40).read()
try: get("https://fc.yahoo.com")
except Exception as e: print("fc", str(e)[:80])
try:
    crumb=get("https://query1.finance.yahoo.com/v1/test/getcrumb").decode(); print("CRUMB", crumb[:20])
except Exception as e: crumb=""; print("CRUMB ERR", e)
try:
    j=json.loads(get(f"https://query1.finance.yahoo.com/v7/finance/quote?symbols=PETR4.SA,MXRF11.SA,ITUB4.SA&crumb={crumb}"))
    for q in j["quoteResponse"]["result"]:
        print("Q", {k:q.get(k) for k in ["symbol","longName","regularMarketPrice","trailingPE","priceToBook","dividendYield","trailingAnnualDividendYield","fiftyTwoWeekLow","fiftyTwoWeekHigh","averageAnalystRating","quoteType"]})
except Exception as e: print("Q ERR", str(e)[:150])
try:
    j=json.loads(get(f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/PETR4.SA?modules=assetProfile,financialData,summaryDetail,defaultKeyStatistics&crumb={crumb}"))
    r=j["quoteSummary"]["result"][0]
    print("QS", r["assetProfile"].get("sector"), r["assetProfile"].get("industry"), r["financialData"].get("recommendationKey"), r["financialData"].get("targetMeanPrice"), r["financialData"].get("numberOfAnalystOpinions"), r["summaryDetail"].get("dividendYield"))
except Exception as e: print("QS ERR", str(e)[:150])
try:
    j=json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/MXRF11.SA?range=1y&interval=1mo&events=div"))
    ev=j["chart"]["result"][0].get("events",{}).get("dividends",{}); print("DIV MXRF11", len(ev), sum(v["amount"] for v in ev.values()))
except Exception as e: print("DIV ERR", e)
for u in ["https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2026.zip"]:
    try:
        b=get(u); z=zipfile.ZipFile(io.BytesIO(b)); print("CVM", len(b), z.namelist())
        for nm in z.namelist():
            with z.open(nm) as f:
                head=f.read(1500).decode("latin-1"); print(nm, head.splitlines()[0][:600]); 
                if "geral" in nm: print(head.splitlines()[1][:600])
    except Exception as e: print("CVM ERR", e)
try:
    b=get("https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_2026.zip"); z=zipfile.ZipFile(io.BytesIO(b)); print("TRI", z.namelist())
    for nm in z.namelist():
        if "imovel" in nm.lower():
            with z.open(nm) as f: print(nm, f.read(800).decode("latin-1").splitlines()[0][:600])
except Exception as e: print("TRI ERR", e)
