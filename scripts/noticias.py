"""Busca as manchetes dos feeds RSS do InfoMoney e grava data/noticias.json.
Roda no GitHub Actions a cada 15 minutos (veja .github/workflows/noticias.yml)."""
import json, os, re, sys, html
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = {
    "ultimas": "https://www.infomoney.com.br/ultimas-noticias/feed/",
    "mercados": "https://www.infomoney.com.br/mercados/feed/",
    "economia": "https://www.infomoney.com.br/economia/feed/",
    "politica": "https://www.infomoney.com.br/politica/feed/",
}
SAIDA = os.path.join(os.path.dirname(__file__), "..", "data", "noticias.json")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 RicoWork-RSS"


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def limpar(txt):
    return html.unescape(re.sub(r"\s+", " ", txt or "")).strip()


def ler_feed(xml_bytes, limite=30):
    root = ET.fromstring(xml_bytes)
    itens = []
    for it in root.iter("item"):
        titulo = limpar(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        data = it.findtext("pubDate")
        try:
            iso = parsedate_to_datetime(data).astimezone(timezone.utc).isoformat() if data else None
        except Exception:
            iso = None
        cats = [limpar(c.text) for c in it.findall("category") if c.text]
        if titulo and link.startswith("http"):
            itens.append({"titulo": titulo, "link": link, "data": iso, "categoria": cats[0] if cats else ""})
        if len(itens) >= limite:
            break
    return itens


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            anterior = json.load(f)
    except Exception:
        anterior = {"fontes": {}}
    fontes, erros = {}, {}
    for chave, url in FEEDS.items():
        try:
            fontes[chave] = ler_feed(baixar(url))
            print(f"{chave}: {len(fontes[chave])} itens")
        except Exception as e:  # mantém o que já existia se o feed falhar
            fontes[chave] = anterior.get("fontes", {}).get(chave, [])
            erros[chave] = str(e)[:200]
            print(f"{chave}: ERRO {e}", file=sys.stderr)
    if not any(fontes.values()):
        print("Nenhum feed respondeu; nada a gravar.", file=sys.stderr)
        sys.exit(0)
    novo = {"fonte": "InfoMoney", "fontes": fontes, "erros": erros}
    if novo["fontes"] == anterior.get("fontes") and not erros:
        print("Sem novidades.")
        return
    novo["atualizado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
