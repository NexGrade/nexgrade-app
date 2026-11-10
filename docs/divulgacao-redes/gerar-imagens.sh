#!/usr/bin/env bash
# Gera os PNGs dos folders (folders.html?p=N) pelo Edge, no tamanho de cada peça. Rodar no Git Bash, nesta pasta.
set -e
E="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PASTA="$(cd "$(dirname "$0")" && pwd -W)"
PERFIL="${TEMP:-/tmp}/edge-folders"
gerar() { # numero largura altura nome
  timeout 90 "$E" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=8000 --user-data-dir="$PERFIL" \
    --window-size="$2,$3" --screenshot="$PASTA/$4.png" "file:///$PASTA/folders.html?p=$1" >/dev/null 2>&1 || true
  echo "$4.png"
}
gerar 1 1080 1350 "01-feed-menos-janelas"
gerar 2 1080 1350 "02-feed-tudo-num-lugar"
gerar 3 1080 1350 "03-feed-modo-rascunho"
gerar 4 1080 1920 "04-status-stories"
gerar 5 1080 1080 "05-whatsapp-30-dias"
