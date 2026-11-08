"""Busca as manchetes recentes do InfoMoney e grava data/noticias.json.
Fonte principal: o sitemap de notícias do site (traz título, data e editoria pelo endereço).
Reserva: o feed RSS geral. Roda no GitHub Actions a cada 15 minutos."""
import json, os, re, sys, html
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

SITEMAP = "https://www.infomoney.com.br/news-sitemap.xml"
RSS = "https://www.infomoney.com.br/feed/"
SAIDA = os.path.join(os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data")), "noticias.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
EDITORIAS = {"mercados": "Mercados", "economia": "Economia", "politica": "Política", "mundo": "Mundo",
             "onde-investir": "Onde investir", "business": "Business", "advisor": "Advisor", "brasil": "Brasil"}
IGNORAR = {"esportes", "consumo", "carreira", "minhas-financas", "patrocinados", "saude", "colunistas"}
LIMITE = 40


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def limpar(txt):
    return html.unescape(re.sub(r"\s+", " ", txt or "")).strip()


def sem_ns(root):
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def iso(txt):
    if not txt:
        return None
    try:
        return datetime.fromisoformat(txt.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except Exception:
        try:
            return parsedate_to_datetime(txt).astimezone(timezone.utc).isoformat()
        except Exception:
            return None


def editoria(link):
    partes = [p for p in urlparse(link).path.split("/") if p]
    return partes[0] if partes else ""


def do_sitemap():
    root = sem_ns(ET.fromstring(baixar(SITEMAP)))
    itens = []
    for u in root.iter("url"):
        link = (u.findtext("loc") or "").strip()
        n = u.find("news")
        if n is None or not link.startswith("http"):
            continue
        titulo = limpar(n.findtext("title"))
        data = iso(n.findtext("publication_date"))
        if titulo:
            itens.append({"titulo": titulo, "link": link, "data": data, "ed": editoria(link)})
    return itens


def do_rss():
    root = sem_ns(ET.fromstring(baixar(RSS)))
    itens = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        titulo = limpar(it.findtext("title"))
        if titulo and link.startswith("http"):
            itens.append({"titulo": titulo, "link": link, "data": iso(it.findtext("pubDate")), "ed": editoria(link)})
    return itens


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            anterior = json.load(f)
    except Exception:
        anterior = {"fontes": {}}
    itens, origem = [], ""
    for nome, fn in (("sitemap", do_sitemap), ("rss", do_rss)):
        try:
            itens = fn()
            origem = nome
            print(f"{nome}: {len(itens)} itens")
            if itens:
                break
        except Exception as e:
            print(f"{nome}: ERRO {e}", file=sys.stderr)
    if not itens:
        print("Nenhuma fonte respondeu; mantendo o arquivo anterior.", file=sys.stderr)
        return
    # remove duplicados e ordena do mais novo para o mais antigo
    vistos, unicos = set(), []
    for it in sorted(itens, key=lambda x: x["data"] or "", reverse=True):
        if it["link"] in vistos:
            continue
        vistos.add(it["link"])
        it["categoria"] = EDITORIAS.get(it["ed"], it["ed"].replace("-", " ").capitalize())
        unicos.append(it)
    relevantes = [i for i in unicos if i["ed"] not in IGNORAR]
    fontes = {"ultimas": relevantes[:LIMITE]}
    for chave in ("mercados", "economia", "politica", "mundo"):
        fontes[chave] = [i for i in unicos if i["ed"] == chave][:LIMITE]
    for lista in fontes.values():
        for i in lista:
            i.pop("ed", None)
    if fontes == anterior.get("fontes"):
        print("Sem novidades.")
        return
    novo = {"fonte": "InfoMoney", "origem": origem, "atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "fontes": fontes}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    print({k: len(v) for k, v in fontes.items()})


if __name__ == "__main__":
    main()
