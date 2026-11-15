"""Sonda temporária 2: download de documentos do RAD/CVM e cadastro completo do IF.data."""
import csv, io, json, os, re, sys, zipfile, urllib.request, http.cookiejar, collections
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
OUT = os.path.join(os.environ.get("DATA_DIR", "out"), "sonda_credito.json")
R = {}
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(u, t=120, h=None):
    r = op.open(urllib.request.Request(u, headers=h or UA), timeout=t)
    return r.read(), r.headers.get("Content-Type"), r.geturl()
def tenta(nome, fn):
    try: R[nome] = fn()
    except Exception as e: R[nome] = "ERRO " + repr(e)[:300]
    print(nome, str(R[nome])[:2500], flush=True)
link = "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1487911&numSequencia=1012617&numVersao=1"
def d1():
    b, ct, u = get(link); return {"ct": ct, "url": u, "html": b.decode("latin-1")[:4300]}
tenta("doc_html", d1)
def d2():
    b, ct, u = get(link); return {"ct": ct, "tam": len(b), "ini": b[:12].decode("latin-1")}
tenta("doc_2a_vez", d2)
def d3():
    b, ct, u = get("https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1487911")
    return {"ct": ct, "tam": len(b), "html": b.decode("latin-1")[:3000]}
tenta("exibir", d3)
B = "https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/"
def cad():
    v = json.loads(get(B + "IfDataCadastro(AnoMes=@AnoMes)?@AnoMes=202606&$format=json")[0])["value"]
    c = collections.Counter((x.get("Tcb"), x.get("Td"), x.get("Tc")) for x in v)
    alvo = [x for x in v if re.search(r"C6|MASTER|BTG|AGIBANK|PINE|INTER\b|XP|DAYCOVAL|BRB", x.get("NomeInstituicao") or "")]
    return {"n": len(v), "tipos": {str(k): n for k, n in c.most_common(30)}, "alvo": alvo[:40]}
tenta("cad", cad)
def tipos():
    out = {}
    for t in (1, 2, 3, 4):
        u = B + f"IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)?@AnoMes=202603&@TipoInstituicao={t}&@Relatorio=%271%27&$format=json&$filter=Conta%20eq%20%27140246%27"
        try:
            v = json.loads(get(u)[0])["value"]; out[t] = {"n": len(v), "ex": [(x["CodInst"], x["Saldo"]) for x in v[:8]]}
        except Exception as e: out[t] = repr(e)[:200]
    return out
tenta("tipos", tipos)
def per():
    v = json.loads(get(B + "IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)?@AnoMes=202606&@TipoInstituicao=1&@Relatorio=%271%27&$top=3&$format=json")[0])["value"]
    return {"n202606": len(v)}
tenta("per", per)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(R, open(OUT, "w"), ensure_ascii=False, indent=1, default=str)
