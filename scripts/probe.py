import urllib.request, json
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36","Accept":"application/json"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
for c in [432,433,13522,1,12,4389,192,7456,7495,189,11]:
    try: print("SGS",c,get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{c}/dados/ultimos/2?formato=json")[:200])
    except Exception as e: print("SGS",c,"ERR",e)
for c in [192,7456]:
    try:
        b=get(f"https://dadosabertos.bcb.gov.br/api/3/action/package_search?q=sgs+{c}&rows=1")
        j=json.loads(b); print("META",c,[r["title"] for r in j["result"]["results"]][:1])
    except Exception as e: print("META",c,"ERR",e)
for s in ["BZ=F","GC=F","USDBRL=X","^BVSP","PETR4.SA"]:
    try:
        j=json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(s)}?range=5d&interval=1d"))
        m=j["chart"]["result"][0]["meta"]; print("YH",s,m.get("regularMarketPrice"),m.get("chartPreviousClose"),m.get("currency"))
    except Exception as e: print("YH",s,"ERR",str(e)[:120])
for u in ["https://brapi.dev/api/quote/PETR4?modules=summaryProfile&dividends=true","https://brapi.dev/api/quote/MXRF11"]:
    try: print("BRAPI",u,get(u)[:300])
    except Exception as e: print("BRAPI",u,"ERR",str(e)[:120])
