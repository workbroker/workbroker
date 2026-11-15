"""Sonda temporária 4: chamada ExibirPDF do visualizador do RAD/CVM."""
import json, os, re, urllib.request, http.cookiejar
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
OUT = os.path.join(os.environ.get("DATA_DIR", "out"), "sonda_credito.json")
R = {}
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def req(u, data=None, h=None):
    hh = dict(UA); hh.update(h or {})
    r = op.open(urllib.request.Request(u, data=data, headers=hh), timeout=90)
    return r.read(), r.headers.get("Content-Type")
base = "https://www.rad.cvm.gov.br/ENET/"
pag = base + "frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1487911"
try:
    b, _ = req(pag); h = b.decode("utf-8", "ignore")
    i = h.find("function ExibirPDF"); R["fn"] = h[i:i + 2500]
    j = h.find("function MontarDadosCabecalhoTela"); R["fn2"] = h[j:j + 1500]
    R["hidden"] = re.findall(r'<input[^>]+type="hidden"[^>]*>', h)[:30]
    R["captcha"] = [h[m.start()-300:m.start()+300] for m in re.finditer(r"(?i)captcha", h)][:3]
except Exception as e:
    R["erro"] = repr(e)
# tentativas
def chama(corpo):
    try:
        b, ct = req(base + "frmExibirArquivoIPEExterno.aspx/ExibirPDF", json.dumps(corpo).encode(),
                    {"Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", "Referer": pag})
        return {"ct": ct, "tam": len(b), "ini": b[:300].decode("latin-1")}
    except Exception as e:
        return repr(e)[:300]
for nome, corpo in (("vazio", {}),):
    R["call_" + nome] = chama(corpo)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(R, open(OUT, "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps(R, ensure_ascii=False)[:6000])
