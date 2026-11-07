import urllib.request
UAS={"chrome":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36","feedly":"Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)"}
URLS=["https://www.infomoney.com.br/feed/","https://www.infomoney.com.br/mercados/feed/","https://www.infomoney.com.br/feed/?post_type=post","https://www.infomoney.com.br/news-sitemap.xml","https://www.infomoney.com.br/sitemap_index.xml","https://www.infomoney.com.br/wp-json/wp/v2/posts?per_page=3&_fields=title,link,date","https://www.infomoney.com.br/ultimas-noticias/"]
for u in URLS:
  for k,ua in UAS.items():
    try:
      b=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":ua}),timeout=20).read()
      print(k,u,len(b),"items",b.count(b"<item"),b.count(b"<url>"),b.count(b"news:title"),b[:150].replace(b"\n",b" "))
    except Exception as e: print(k,u,"ERR",str(e)[:100])
