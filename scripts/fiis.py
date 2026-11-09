"""Indicadores de todos os FIIs listados -> fiis.json (uma vez por dia)
- CVM (dados abertos, informes mensal e trimestral): nome, segmento, mandato, gestão, administrador,
  valor patrimonial por cota (hoje e 12 meses antes), patrimônio, cotistas, vacância.
- Yahoo Finance (gráfico semanal de 2 anos): cotação atual, no início do ano e 12 meses antes,
  volume médio e rendimentos pagos (por mês da data-com).
Os sinais (pontos críticos e bons) são calculados no site, a partir destes dados.
Roda no GitHub Actions; o arquivo vai para o ramo "dados" (sem histórico)."""
import csv, io, json, os, sys, time, zipfile, http.cookiejar, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "fiis.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
BRT = timezone(timedelta(hours=-3))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get(url, timeout=60):
    return opener.open(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def num(x):
    try:
        v = float(str(x).strip().replace(",", "."))
        return v if v == v else None
    except Exception:
        return None


# ---------- CVM ----------
def ler_zip(url):
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=180)))
    return {nm: list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";")) for nm in z.namelist()}


def col(row, nome, *partes):
    if nome in row:
        return row[nome]
    for k in row:
        if all(p.lower() in k.lower() for p in partes):
            return row[k]
    return None


def versao_final(linhas):
    """Fica com a última versão de cada (fundo, data de referência)."""
    m = {}
    for l in linhas:
        k = (l.get("CNPJ_Fundo_Classe") or l.get("CNPJ_Fundo"), l.get("Data_Referencia"))
        if not k[0] or not k[1]:
            continue
        v = num(l.get("Versao")) or 0
        if k not in m or v >= (num(m[k].get("Versao")) or 0):
            m[k] = l
    return m


def dados_cvm(debug):
    ano = datetime.now(BRT).year
    geral, comp, imoveis = [], [], []
    for a in (ano - 1, ano):
        try:
            for nm, linhas in ler_zip(f"https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{a}.zip").items():
                if "geral" in nm: geral += linhas
                elif "complemento" in nm: comp += linhas
        except Exception as e:
            log("cvm mensal", a, e)
        try:
            for nm, linhas in ler_zip(f"https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_{a}.zip").items():
                if nm.endswith(f"imovel_{a}.csv"): imoveis += linhas
        except Exception as e:
            log("cvm trimestral", a, e)
    debug["n_geral"], debug["n_comp"], debug["n_imoveis"] = len(geral), len(comp), len(imoveis)
    if comp: debug["cols_comp"] = list(comp[0].keys())
    if imoveis: debug["cols_imovel"] = list(imoveis[0].keys())
    G, C = versao_final(geral), versao_final(comp)
    cad = {}   # cnpj -> linha mais recente do "geral"
    for (cn, d), l in G.items():
        if cn not in cad or d > cad[cn].get("Data_Referencia", ""):
            cad[cn] = l
    hist = {}  # cnpj -> {AAAA-MM: (vp, pl, cotistas)}
    for (cn, d), l in C.items():
        vp = num(col(l, "Valor_Patrimonial_Cotas", "Patrimonial", "Cota"))
        pl = num(col(l, "Patrimonio_Liquido", "Patrimonio_Liquido"))
        ct = num(col(l, "Total_Numero_Cotistas", "Total", "Cotistas"))
        if vp:
            hist.setdefault(cn, {})[d[:7]] = (vp, pl, ct)
    # vacância (física) média ponderada pela área/receita, por trimestre
    vac = {}
    acc = {}
    for l in imoveis:
        cn, d = l.get("CNPJ_Fundo_Classe") or l.get("CNPJ_Fundo"), l.get("Data_Referencia", "")
        v = num(col(l, "Percentual_Vacancia", "Vacancia"))
        if not cn or not d or v is None:
            continue
        w = num(col(l, "Area", "Area")) or num(col(l, "Percentual_Receitas_FII", "Receitas")) or 1
        acc.setdefault(cn, {}).setdefault(d, []).append((v, w))
    for cn, por_data in acc.items():
        serie = []
        for d in sorted(por_data):
            lst = por_data[d]
            fator = 100 if max(v for v, _ in lst) <= 1 else 1
            tw = sum(w for _, w in lst)
            serie.append((d, round((sum(v * w for v, w in lst) / tw if tw else 0) * fator, 2)))
        vac[cn] = serie
    fundos = {}
    for cn, l in cad.items():
        isin = (l.get("Codigo_ISIN") or "").strip().upper()
        if len(isin) < 7 or not isin.startswith("BR") or (l.get("Mercado_Negociacao_Bolsa") or "").strip().upper() != "S":
            continue
        t = isin[2:6] + "11"
        h = hist.get(cn, {})
        if not h:
            continue
        meses = sorted(h)
        ult = meses[-1]
        a12 = (datetime.strptime(ult + "-01", "%Y-%m-%d") - timedelta(days=360)).strftime("%Y-%m")
        m12 = next((m for m in meses if m >= a12), None)
        reg = {
            "nome": (l.get("Nome_Fundo_Classe") or l.get("Nome_Fundo") or "").strip(),
            "seg": (l.get("Segmento_Atuacao") or "").strip(), "mandato": (l.get("Mandato") or "").strip(),
            "gestao": (l.get("Tipo_Gestao") or "").strip(), "adm": (l.get("Nome_Administrador") or "").strip(),
            "vp": h[ult][0], "vp_ref": ult, "pl": h[ult][1], "cot": h[ult][2],
            "vp12": h[m12][0] if m12 and m12 != ult else None, "vp12_ref": m12 if m12 != ult else None,
        }
        if cn in vac:
            s = vac[cn]
            reg["vac"], reg["vac_ref"] = s[-1][1], s[-1][0][:7]
            if len(s) > 1:
                reg["vac_ant"] = s[-2][1]
        if t not in fundos or reg["vp_ref"] > fundos[t]["vp_ref"]:
            fundos[t] = reg
    return fundos


# ---------- Yahoo ----------
def grafico(simbolo):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{simbolo}?range=2y&interval=1wk&events=div"
    for tentativa in range(3):
        try:
            r = json.loads(get(url, timeout=30))["chart"]["result"][0]
            return r
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 + tentativa * 3)
        except Exception:
            time.sleep(2 + tentativa * 3)
    return None


def mercado(t):
    r = grafico(t + ".SA")
    if not r:
        return None
    meta = r.get("meta", {})
    ts = r.get("timestamp") or []
    q = (r.get("indicators", {}).get("quote") or [{}])[0]
    fech, vol = q.get("close") or [], q.get("volume") or []
    pts = [(datetime.fromtimestamp(a, BRT), c, v or 0) for a, c, v in zip(ts, fech, vol) if c]
    preco = meta.get("regularMarketPrice") or (pts[-1][1] if pts else None)
    if not preco or not pts:
        return None
    hoje = datetime.now(BRT)
    ini_ano = datetime(hoje.year, 1, 1, tzinfo=BRT)
    antes = lambda lim: next((c for d, c, _ in reversed(pts) if d < lim), None)
    rec = [c * v / 5 for d, c, v in pts[-9:-1] if v]  # média diária aproximada das últimas 8 semanas
    divs = {}
    for ev in (r.get("events", {}).get("dividends") or {}).values():
        d = datetime.fromtimestamp(ev["date"], BRT).strftime("%Y-%m")
        divs[d] = round(divs.get(d, 0) + float(ev["amount"]), 4)
    ult_neg = pts[-1][0]
    return {
        "p": round(preco, 2), "p_ano": antes(ini_ano), "p12": antes(hoje - timedelta(days=365)),
        "vol": round(sum(rec) / len(rec)) if rec else None,
        "r": sorted(divs.items(), reverse=True)[:14],
        "neg": ult_neg.strftime("%Y-%m-%d"),
    }


def main():
    hoje = datetime.now(BRT)
    if os.path.exists(SAIDA) and not os.environ.get("FORCAR"):
        try:
            ant = json.load(open(SAIDA, encoding="utf-8"))
            ger = datetime.fromisoformat(ant.get("gerado"))
            if hoje - ger < timedelta(hours=20) and len(ant.get("f", {})) > 50:
                log("fiis.json gerado há menos de 20 h; nada a fazer")
                return
        except Exception:
            pass
    debug = {}
    fundos = dados_cvm(debug)
    log("FIIs na CVM:", len(fundos))
    try:
        get("https://fc.yahoo.com")
    except Exception:
        pass
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = dict(zip(fundos, ex.map(mercado, list(fundos))))
    saida = {}
    for t, f in fundos.items():
        m = res.get(t)
        if not m:
            continue
        if m["neg"] < (hoje - timedelta(days=45)).strftime("%Y-%m-%d"):
            continue  # sem negociação recente
        f.update(m)
        saida[t] = {k: v for k, v in f.items() if v not in (None, "")}
    debug["com_preco"] = len(saida)
    ifix = None
    for s in ("IFIX.SA", "^IFIX", "XFIX11.SA"):
        r = grafico(s)
        try:
            ts, fech = r["timestamp"], r["indicators"]["quote"][0]["close"]
            pts = [(datetime.fromtimestamp(a, BRT), c) for a, c in zip(ts, fech) if c]
            atual = r["meta"].get("regularMarketPrice") or pts[-1][1]
            antes = lambda lim: next((c for d, c in reversed(pts) if d < lim), None)
            p12, pano = antes(hoje - timedelta(days=365)), antes(datetime(hoje.year, 1, 1, tzinfo=BRT))
            ifix = {"fonte": s, "r12": round(atual / p12 - 1, 4) if p12 else None, "ano": round(atual / pano - 1, 4) if pano else None}
            break
        except Exception:
            continue
    log("FIIs com cotação:", len(saida), "IFIX:", ifix)
    if len(saida) < 50:
        log("poucos FIIs; mantendo o arquivo anterior")
        return
    with open(SAIDA, "w", encoding="utf-8") as fp:
        json.dump({"gerado": hoje.isoformat(timespec="seconds"), "ifix": ifix, "f": saida, "_debug": debug}, fp, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
