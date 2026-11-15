"""Sonda temporária 3: como baixar o PDF de um documento IPE do RAD/CVM."""
import json, os, re, urllib.request, urllib.parse, http.cookiejar
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
OUT = os.path.join(os.environ.get("DATA_DIR", "out"), "sonda_credito.json")
R = {}
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def req(u, data=None, h=None):
    hh = dict(UA); hh.update(h or {})
    r = op.open(urllib.request.Request(u, data=data, headers=hh), timeout=90)
    return r.read(), r.headers.get("Content-Type"), r.headers.get("Content-Disposition"), r.geturl()
def tenta(nome, fn):
    try: R[nome] = fn()
    except Exception as e: R[nome] = "ERRO " + repr(e)[:300]
    print(nome, str(R[nome])[:3000], flush=True)
base = "https://www.rad.cvm.gov.br/ENET/"
link = base + "frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1487911&numSequencia=1012617&numVersao=1"
def post():
    b, *_ = req(link)
    h = b.decode("utf-8", "ignore")
    vs = re.search(r'id="__VIEWSTATE" value="([^"]*)"', h).group(1)
    vg = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]*)"', h).group(1)
    d = urllib.parse.urlencode({"__VIEWSTATE": vs, "__VIEWSTATEGENERATOR": vg}).encode()
    b2, ct, cd, u = req(link, d, {"Content-Type": "application/x-www-form-urlencoded", "Referer": link})
    return {"ct": ct, "cd": cd, "tam": len(b2), "ini": b2[:16].decode("latin-1")}
tenta("post", post)
def exibir():
    b, *_ = req(base + "frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1487911")
    h = b.decode("utf-8", "ignore")
    achados = re.findall(r'(?:src|href|action|url)\s*[=:]\s*["\']([^"\']+)["\']', h)
    js = [m for m in re.findall(r"[\w./]*\.aspx[^\"'<> ]*", h)]
    return {"achados": [a for a in achados if "css" not in a][:60], "aspx": sorted(set(js))[:40], "trechos": [h[m.start()-200:m.start()+300] for m in re.finditer(r"(?i)download|iframe|pdf", h)][:8]}
tenta("exibir", exibir)
def visualizar():
    out = {}
    for u in [base + "frmDownloadDocumento.aspx?Tela=ext&numSequencia=1012617&numVersao=1&numProtocolo=1487911&descTipo=IPE&CodigoInstituicao=1",
              "https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1487911&numSequencia=1012617&numVersao=1",
              base + "frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1487911&TipoDocumento=PDF"]:
        try:
            b, ct, cd, uu = req(u); out[u[-60:]] = {"ct": ct, "cd": cd, "tam": len(b), "ini": b[:10].decode("latin-1")}
        except Exception as e: out[u[-60:]] = repr(e)[:200]
    return out
tenta("variantes", visualizar)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(R, open(OUT, "w"), ensure_ascii=False, indent=1, default=str)
