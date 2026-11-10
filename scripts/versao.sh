#!/bin/sh
# Atualiza o ?v= dos arquivos .js/.css em todas as páginas, para o navegador não usar versão antiga guardada.
V=$(date +%Y%m%d%H%M)
cd "$(dirname "$0")/.." && for f in *.html; do
  sed -i -E "s#(src|href)=\"(assets/[A-Za-z0-9_./-]+\.(js|css))(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" "$f"
done
echo "versão $V"
