"""Radar de proventos: dividendos, JCP e rendimentos já aprovados das ações do Ibovespa e das mais negociadas
fora dele, com valor por ação, data com e data de pagamento. Fonte: B3 (dados da empresa listada, cashDividends).
Roda a cada ~2 h (ou no push com FORCAR) e grava proventos.json."""
import base64, json, os, sys, time, urllib.request
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


def main():
    forcar = os.environ.get("FORCAR") == "1"
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
    if falhas > len(emissores) * 0.5:
        log("Falhas demais; mantendo o arquivo anterior."); return
    # remove repetidos (a B3 às vezes lista o mesmo provento duas vezes)
    vistos, unicos = set(), []
    for p in todos:
        k = (p["tk"], p["tipo"], p["valor"], p["com"], p["pag"])
        if k not in vistos:
            vistos.add(k); unicos.append(p)
    unicos.sort(key=lambda p: (p["aprov"] or "", p["tk"]), reverse=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "hoje": hoje.isoformat(),
                   "emissores": len(emissores), "p": unicos, "debug": debug}, fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
