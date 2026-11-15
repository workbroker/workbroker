"""Sonda temporária: formato dos dados do BCB (IF.data) e da CVM (IPE, DFP, cadastro)."""
import csv, io, json, os, sys, zipfile, urllib.request, urllib.parse
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "application/json,*/*"}
OUT = os.path.join(os.environ.get("DATA_DIR", "out"), "sonda_credito.json")
R = {}
def get(u, t=120): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
def tenta(nome, fn):
    try: R[nome] = fn()
    except Exception as e: R[nome] = "ERRO " + repr(e)[:300]
    print(nome, str(R[nome])[:1500], flush=True)
B = "https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/"
tenta("ifdata_anomes", lambda: json.loads(get(B + "ListaDeRelatorio()?$top=40&$format=json"))["value"][:40])
def cad(am):
    j = json.loads(get(B + f"IfDataCadastro(AnoMes=@AnoMes)?@AnoMes={am}&$top=5&$format=json"))
    return j["value"]
for am in (202606, 202603):
    tenta(f"cad_{am}", lambda am=am: cad(am))
def val(am, tipo, rel, top=60):
    u = B + f"IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)?@AnoMes={am}&@TipoInstituicao={tipo}&@Relatorio=%27{rel}%27&$top={top}&$format=json"
    v = json.loads(get(u))["value"]
    return {"n": len(v), "contas": sorted({(x.get("NomeColuna"), x.get("Conta")) for x in v}, key=str)[:60], "ex": v[:3]}
for tipo in (1, 3):
    for rel in (1, 5):
        tenta(f"val_202603_t{tipo}_r{rel}", lambda tipo=tipo, rel=rel: val(202603, tipo, rel, 400))
def cvm_csv(u, n=3):
    t = get(u).decode("latin-1").splitlines()
    return {"cab": t[0], "ex": t[1:1 + n], "linhas": len(t)}
tenta("cad_cia", lambda: cvm_csv("https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv"))
def ipe():
    z = zipfile.ZipFile(io.BytesIO(get("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip", 180)))
    out = {"arquivos": z.namelist()}
    nm = z.namelist()[0]
    rows = list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";"))
    out["n"] = len(rows); out["cab"] = list(rows[0].keys()); out["ex"] = rows[:2]
    out["cats"] = sorted({r.get("Categoria") for r in rows})[:40]
    rat = [r for r in rows if "rating" in (r.get("Assunto") or "").lower() or "classifica" in (r.get("Assunto") or "").lower()]
    out["n_rating"] = len(rat); out["ex_rating"] = rat[:6]
    return out
tenta("ipe", ipe)
def dfp():
    z = zipfile.ZipFile(io.BytesIO(get("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip", 240)))
    out = {"arquivos": z.namelist()}
    nm = [n for n in z.namelist() if "DRE_con" in n][0]
    rows = list(csv.DictReader(io.TextIOWrapper(z.open(nm), encoding="latin-1"), delimiter=";"))
    out["n"] = len(rows); out["cab"] = list(rows[0].keys()); out["ex"] = rows[:3]
    return out
tenta("dfp", dfp)
# documento de rating: tenta baixar o primeiro link
def doc():
    r = R.get("ipe")
    if not isinstance(r, dict) or not r.get("ex_rating"): return "sem"
    l = r["ex_rating"][0].get("Link_Download")
    b = get(l)
    return {"link": l, "tam": len(b), "ini": b[:8].decode("latin-1")}
tenta("doc", doc)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(R, open(OUT, "w"), ensure_ascii=False, indent=1, default=str)
