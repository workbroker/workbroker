"""Indicadores macro para o rodapé do site -> data/macro.json
Fontes: Banco Central (SGS, dados oficiais) e Yahoo Finance (cotações de mercado)."""
import json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timezone

SAIDA = os.path.join(os.path.dirname(__file__), "..", "data", "macro.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", "Accept": "application/json"}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read())


def sgs(codigo, n=13):
    dados = get_json(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados/ultimos/{n}?formato=json")
    return [(d["data"], float(d["valor"])) for d in dados]


def acumulado(valores):
    f = 1.0
    for v in valores:
        f *= 1 + v / 100
    return (f - 1) * 100


def mes_ref(data_br):  # "01/09/2026" -> "set/26"
    meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    d, m, a = data_br.split("/")
    return f"{meses[int(m) - 1]}/{a[2:]}"


def yahoo(simbolo):
    j = get_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(simbolo)}?range=1d&interval=5m")
    m = j["chart"]["result"][0]["meta"]
    preco, ant = m.get("regularMarketPrice"), m.get("chartPreviousClose")
    var = (preco / ant - 1) * 100 if preco and ant else None
    return preco, var


def main():
    itens = []

    def add(fn):
        try:
            itens.append(fn())
        except Exception as e:
            print("ERRO", fn.__name__, e, file=sys.stderr)

    def selic():
        d, v = sgs(432, 1)[-1]
        return {"id": "selic", "nome": "Selic", "valor": v, "fmt": "pct", "sub": "meta a.a."}

    def cdi():
        d, v = sgs(4389, 1)[-1]
        return {"id": "cdi", "nome": "CDI", "valor": v, "fmt": "pct", "sub": "a.a."}

    def ipca_mes():
        d, v = sgs(433, 1)[-1]
        return {"id": "ipca_mes", "nome": "IPCA mês", "valor": v, "fmt": "pct", "sub": mes_ref(d)}

    def ipca_ano():
        serie = sgs(433, 12)
        ano = serie[-1][0][-4:]
        return {"id": "ipca_ano", "nome": "IPCA no ano", "valor": acumulado([v for d, v in serie if d.endswith(ano)]), "fmt": "pct", "sub": f"até {mes_ref(serie[-1][0])}"}

    def ipca_12m():
        d, v = sgs(13522, 1)[-1]
        return {"id": "ipca_12m", "nome": "IPCA 12 meses", "valor": v, "fmt": "pct", "sub": mes_ref(d)}

    def incc():
        serie = sgs(7456, 12)
        d, v = serie[-1]
        return {"id": "incc", "nome": "INCC-M mês", "valor": v, "fmt": "pct", "sub": f"{mes_ref(d)} · 12m {acumulado([x for _, x in serie]):.2f}%".replace(".", ",")}

    def dolar():
        p, var = yahoo("USDBRL=X")
        return {"id": "dolar", "nome": "Dólar", "valor": p, "fmt": "brl", "var": var}

    def ibov():
        p, var = yahoo("^BVSP")
        return {"id": "ibov", "nome": "Ibovespa", "valor": p, "fmt": "pts", "var": var}

    def brent():
        p, var = yahoo("BZ=F")
        return {"id": "brent", "nome": "Petróleo Brent", "valor": p, "fmt": "usd", "var": var, "sub": "barril"}

    def ouro():
        p, var = yahoo("GC=F")
        return {"id": "ouro", "nome": "Ouro", "valor": p, "fmt": "usd", "var": var, "sub": "onça"}

    for fn in (selic, cdi, ipca_mes, ipca_ano, ipca_12m, incc, dolar, ibov, brent, ouro):
        add(fn)

    if not itens:
        print("Nenhum indicador obtido; mantendo o arquivo anterior.", file=sys.stderr)
        return
    try:
        with open(SAIDA, encoding="utf-8") as f:
            ant = json.load(f)
        # mantém indicadores que falharam desta vez
        ids = {i["id"] for i in itens}
        for i in ant.get("itens", []):
            if i["id"] not in ids:
                itens.append(i)
        if ant.get("itens") == itens:
            print("Sem mudanças nos indicadores.")
            return
    except Exception:
        pass
    ordem = ["selic", "cdi", "ipca_mes", "ipca_ano", "ipca_12m", "incc", "dolar", "ibov", "brent", "ouro"]
    itens.sort(key=lambda i: ordem.index(i["id"]) if i["id"] in ordem else 99)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "itens": itens}, f, ensure_ascii=False, indent=1)
    print(json.dumps(itens, ensure_ascii=False)[:600])


if __name__ == "__main__":
    main()
