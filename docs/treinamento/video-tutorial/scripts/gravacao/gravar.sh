#!/bin/bash
# Recria o banco do vídeo (cópia local da Demonstração), cadastra a Ana Teste e grava as telas.
# uso: bash gravar.sh <pasta_saida> [--ate=CENA] [--fotos]
# (motor, API e site já no ar: ver ../ambiente-local/subir.sh)
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
bash "$AQUI/../ambiente-local/subir.sh" recriar
sleep 2
export PYTHONIOENCODING=utf-8
cd "$AQUI"; python preparar_dados.py
# sem conversão de caminho do Git Bash ("--pagina=/turmas")
MSYS_NO_PATHCONV=1 python gravar_passo_a_passo.py "$@"
