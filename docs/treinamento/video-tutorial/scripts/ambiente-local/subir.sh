#!/bin/bash
# [VIDEO-LOCAL] Recria o banco do vídeo a partir do modelo e sobe motor CP-SAT (8001), API (3000) e site (5173).
# Tudo no PC: o banco é o Postgres LOCAL (nunca o real), o login é simulado (preparar-worktree.sh).
# uso: WT=<worktree> VENV=<venv com ortools> bash subir.sh [recriar|motor|api|site]
#   recriar: apaga nexgrade_video e copia de MODELO (padrão nexgrade_video_modelo_v4)
set -e
PG="/c/Program Files/PostgreSQL/17/bin"
BANCO=${BANCO:-nexgrade_video}; MODELO=${MODELO:-nexgrade_video_modelo_v4}
URL="postgresql://postgres@localhost:5432/$BANCO"
case "${1:-}" in
  recriar)
    "$PG/psql" -h localhost -U postgres -w -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname='$BANCO'" >/dev/null
    "$PG/dropdb" -h localhost -U postgres -w --if-exists "$BANCO"
    "$PG/createdb" -h localhost -U postgres -w -T "$MODELO" "$BANCO"
    echo "banco $BANCO recriado de $MODELO" ;;
  motor)
    cd "$WT/cpsat-service"; exec "$VENV/Scripts/python" -m uvicorn app.main:app --port 8001 ;;
  api)
    cd "$WT/artifacts/api-server"
    # DATABASE_URL local SEMPRE explícita (sem ela nada sobe); sem .env na worktree
    case "$URL" in postgresql://postgres@localhost:5432/*) ;; *) echo "banco não é local"; exit 1 ;; esac
    export DATABASE_URL="$URL" DATABASE_SSL=disable PORT=3000 NODE_ENV=development \
      CORS_ALLOWED_ORIGINS=http://localhost:5173 CPSAT_SERVICE_URL=http://localhost:8001 LOG_LEVEL=warn \
      CLERK_PUBLISHABLE_KEY=pk_test_dmlkZW8ubG9jYWwk CLERK_SECRET_KEY=sk_test_video_local
    node ./build.mjs && exec node --enable-source-maps ./dist/index.mjs ;;
  site)
    cd "$WT/artifacts/horario-escolar"
    # o Git Bash trocaria "/" por "C:/Program Files/Git/": desliga a conversão para BASE_PATH
    export MSYS2_ENV_CONV_EXCL=BASE_PATH PORT=5173 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_video_local
    exec npx vite --config vite.config.ts ;;
  *) echo "uso: subir.sh recriar|motor|api|site"; exit 1 ;;
esac
