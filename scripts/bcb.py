"""Página Banco Central -> bcb.json (uma vez por dia, ou no push com FORCAR)
- Séries do SGS (api.bcb.gov.br): Selic, IPCA, IGP-M, câmbio, atividade (IBC-Br), desemprego, fiscal,
  setor externo, crédito. Histórico mensal para os gráficos.
- Expectativas do Boletim Focus (olinda Expectativas): IPCA, PIB, câmbio e Selic do ano e do próximo.
- Último comunicado do Copom (API do site do BC): data, decisão e trechos usados como "o que o BC diz".
"""
import json, os, re, sys, time, html, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
SAIDA = os.path.join(DATA_DIR, "bcb.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", "Accept": "application/json,*/*"}
HOJE = datetime.now(timezone(timedelta(hours=-3)))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def sgs(cod, anos=4):
    ini = HOJE.replace(day=1, year=HOJE.year - anos).strftime("%d/%m/%Y")
    d = json.loads(get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json&dataInicial={ini}"))
    hoje = HOJE.strftime("%Y-%m-%d")  # a série da Selic traz datas futuras (meta vigente até a próxima reunião)
    return [p for p in ((f"{x['data'][6:10]}-{x['data'][3:5]}-{x['data'][0:2]}", float(x["valor"])) for x in d if x.get("valor") not in (None, "")) if p[0] <= hoje]


def mensal(pontos):
    """Último valor de cada mês (para séries diárias) -> [(aaaa-mm, valor)]."""
    m = {}
    for d, v in pontos:
        m[d[:7]] = v
    return sorted(m.items())


def acum12(pontos):
    """Variação mensal % -> acumulado em 12 meses %."""
    out = []
    for i in range(11, len(pontos)):
        f = 1
        for _, v in pontos[i - 11:i + 1]:
            f *= 1 + v / 100
        out.append((pontos[i][0], round((f - 1) * 100, 2)))
    return out


def var12(pontos):
    """Nível mensal -> variação % em 12 meses."""
    d = dict(pontos)
    out = []
    for k, v in pontos:
        a = f"{int(k[:4]) - 1}{k[4:]}"
        if a in d and d[a]:
            out.append((k, round((v / d[a] - 1) * 100, 2)))
    return out


# id: (código SGS, transformação, nome, unidade)
SERIES = {
    "selic": (432, "fim_mes", "Selic (meta)", "% a.a."),
    "ipca12": (13522, "mensal", "IPCA em 12 meses", "%"),
    "ipca_mes": (433, "mensal", "IPCA do mês", "%"),
    "igpm12": (189, "acum12", "IGP-M em 12 meses", "%"),
    "dolar": (1, "fim_mes", "Dólar (PTAX)", "R$"),
    "ibcbr": (24364, "var12", "Atividade econômica (IBC-Br)", "% em 12 meses"),
    "desemprego": (24369, "mensal", "Desemprego (PNAD)", "%"),
    "divida": (13762, "mensal", "Dívida bruta do governo", "% do PIB"),
    "primario": (5793, "mensal", "Resultado primário (12 meses)", "% do PIB"),
    "reservas": (13621, "fim_mes", "Reservas internacionais", "US$ bi"),
    "tc": (23079, "mensal", "Transações correntes (12 meses)", "% do PIB"),
    "inadimplencia": (21082, "mensal", "Inadimplência do crédito", "%"),
    "juros_credito": (20714, "mensal", "Juro médio do crédito", "% a.a."),
    "credito": (20539, "var12", "Crédito total", "% em 12 meses"),
}


def focus():
    """Mediana mais recente do Focus para IPCA, PIB, câmbio e Selic (ano corrente e próximo)."""
    out = {}
    base = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
    for ind in ("IPCA", "PIB Total", "Câmbio", "Selic"):
        f = urllib.parse.quote(f"Indicador eq '{ind}'")
        u = f"{base}?$top=60&$filter={f}&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana,baseCalculo"
        try:
            v = json.loads(get(u))["value"]
            v = [x for x in v if str(x.get("baseCalculo", 0)) == "0"] or v
            if not v:
                continue
            dmax = v[0]["Data"]
            anos = {}
            for x in v:
                if x["Data"] == dmax and str(x["DataReferencia"]) in (str(HOJE.year), str(HOJE.year + 1)):
                    anos[str(x["DataReferencia"])] = round(x["Mediana"], 2)
            # semana anterior, para a seta
            ant = {}
            datas = sorted({x["Data"] for x in v}, reverse=True)
            if len(datas) > 1:
                for x in v:
                    if x["Data"] == datas[1] and str(x["DataReferencia"]) in anos:
                        ant[str(x["DataReferencia"])] = round(x["Mediana"], 2)
            out[ind] = {"data": dmax, "anos": anos, "ant": ant}
        except Exception as e:
            log("focus", ind, e)
    return out


COPOM_URLS = [
    "https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?quantidade=1",
    "https://www.bcb.gov.br/api/servico/sitebcb/copomcomunicados/ultimas?quantidade=1",
    "https://www.bcb.gov.br/api/servico/sitebcb/comunicadoscopom/ultimos?quantidade=1",
]


def limpa(h):
    t = re.sub(r"<[^>]+>", " ", h or "")
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def copom(debug):
    for u in COPOM_URLS:
        try:
            j = json.loads(get(u))
            itens = j.get("conteudo") if isinstance(j, dict) else j
            if isinstance(itens, dict):
                itens = [itens]
            if not itens:
                debug.setdefault("copom_vazio", []).append(u); continue
            it = itens[0]
            debug["copom_campos"] = list(it.keys())[:30]
            texto = ""
            for k in ("textoComunicado", "texto", "conteudo", "corpo", "Texto"):
                if it.get(k):
                    texto = limpa(it[k]); break
            ref = it.get("nro_reuniao") or it.get("nroReuniao") or it.get("numeroReuniao") or it.get("reuniao")
            if not texto and ref:  # detalhe da reunião
                for d in (f"https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao={ref}",
                          f"https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicado_detalhes?nro_reuniao={ref}",
                          f"https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?nro_reuniao={ref}"):
                    try:
                        jj = json.loads(get(d)); x = jj.get("conteudo") if isinstance(jj, dict) else jj
                        x = (x[0] if isinstance(x, list) and x else x) or {}
                        debug.setdefault("copom_detalhe", []).append({"u": d, "campos": list(x.keys())[:20] if isinstance(x, dict) else str(type(x))})
                        for k in ("textoComunicado", "texto", "conteudo", "corpo"):
                            if isinstance(x, dict) and isinstance(x.get(k), str) and len(x[k]) > 200:
                                texto = limpa(x[k]); break
                        if texto:
                            break
                    except Exception as e:
                        debug.setdefault("copom_detalhe", []).append({"u": d, "erro": repr(e)[:100]})
            data = it.get("dataReferencia") or it.get("data") or it.get("dataPublicacao")
            titulo = limpa(it.get("titulo") or "")
            if texto:
                debug["copom_url"] = u
                return {"data": data, "reuniao": ref, "titulo": titulo, "texto": texto[:6000],
                        "link": f"https://www.bcb.gov.br/publicacoes/comunicadoscopom" + (f"/cop{ref}" if ref else "")}
            debug.setdefault("copom_sem_texto", []).append({"u": u, "campos": list(it.keys())[:20]})
        except Exception as e:
            debug.setdefault("copom_erro", []).append(f"{u}: {repr(e)[:120]}")
    return None


def main():
    debug = {}
    try:
        with open(SAIDA, encoding="utf-8") as f:
            ant = json.load(f)
        idade = (datetime.now(timezone.utc) - datetime.fromisoformat(ant["atualizado"])).total_seconds() / 3600
        if idade < 20 and not os.environ.get("FORCAR"):
            log(f"bcb.json tem {idade:.1f} h; nada a fazer."); return
    except Exception:
        ant = {}
    ind = {}
    for k, (cod, tr, nome, un) in SERIES.items():
        try:
            p = sgs(cod, 5 if tr in ("var12", "acum12") else 4)
            if tr == "fim_mes":
                s = mensal(p)
            elif tr == "acum12":
                s = acum12(mensal(p))
            elif tr == "var12":
                s = var12(mensal(p))
            else:
                s = mensal(p)
            if k == "reservas":
                s = [(d, round(v / 1000, 1)) for d, v in s]
            if k == "primario":  # o SGS traz a NFSP (positivo = déficit); na página, positivo = superávit
                s = [(d, round(-v, 2)) for d, v in s]
            s = s[-37:]
            ind[k] = {"nome": nome, "un": un, "cod": cod, "serie": s, "ult": s[-1] if s else None,
                      "dia": p[-1][0] if p else None}
            debug[k] = f"{cod}: {len(p)} pts, último {p[-1] if p else None}"
        except Exception as e:
            debug[k] = f"{cod}: ERRO {repr(e)[:100]}"
            if ant.get("ind", {}).get(k):
                ind[k] = ant["ind"][k]
        log(k, debug[k])
    fc = focus() or ant.get("focus") or {}
    cp = copom(debug) or ant.get("copom")
    log("focus:", list(fc), "copom:", bool(cp), debug.get("copom_url"), debug.get("copom_erro"), debug.get("copom_sem_texto"))
    if len(ind) < 6:
        log("Poucos indicadores; mantendo o arquivo anterior."); return
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ind": ind, "focus": fc,
                   "copom": cp, "debug": debug}, f, ensure_ascii=False, separators=(",", ":"))
    log("bcb.json:", len(ind), "indicadores", os.path.getsize(SAIDA) // 1024, "KB")


if __name__ == "__main__":
    main()
