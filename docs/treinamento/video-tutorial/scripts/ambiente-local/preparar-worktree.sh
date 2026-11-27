#!/bin/bash
# [VIDEO-LOCAL] Prepara uma worktree DESCARTÁVEL do NexGrade para gravar vídeos no PC, sem Clerk.
# Nada disto vai para a main: as mudanças ficam só na worktree (que é apagada depois).
#  - API: troca o clerkMiddleware por um "login" fixo da coordenação (org:admin) na Escola Demonstração.
#  - Site: o Vite aponta "@clerk/react" (e /internal, @clerk/themes) para clerk-falso.tsx.
# uso: bash preparar-worktree.sh <pasta_da_worktree>
#   (crie antes: git worktree add --detach <pasta> origin/main ; cd <pasta> ; pnpm install --frozen-lockfile)
set -e
WT="${1:?informe a pasta da worktree}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
cp "$AQUI/clerk-falso.tsx" "$WT/artifacts/horario-escolar/src/clerk-falso.tsx"

# --- API: login simulado (mesmo formato do req.auth dos testes de integração)
APP="$WT/artifacts/api-server/src/app.ts"
python - "$APP" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
ini = s.index('app.use(\n  clerkMiddleware((req)')
fim = s.index('\n);\n', ini) + 4
falso = '''// [VIDEO-LOCAL] login simulado: coordenação da Escola Demonstração (só na worktree descartável)
app.use((req, _res, next) => {
  const a = { orgId: "esc_1ce4d2d30c4146a99fb7ffa5", userId: "u_video", orgRole: "org:admin", tokenType: "session_token",
    sessionClaims: { email: "coordenacao@demonstracao.local" } };
  (req as unknown as { auth: unknown }).auth = Object.assign(() => a, { [Symbol.for("@clerk/express.auth")]: true });
  next();
});
'''
s = s[:ini] + falso + s[fim:]
open(p, 'w', encoding='utf-8').write(s)
print('app.ts: login simulado')
PY

# --- Site: alias do Clerk para o arquivo falso
VC="$WT/artifacts/horario-escolar/vite.config.ts"
python - "$VC" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
alvo = '    alias: {\n'
novo = alvo + '''      // [VIDEO-LOCAL] sem Clerk: usuário simulado
      "@clerk/react/internal": path.resolve(import.meta.dirname, "src/clerk-falso.tsx"),
      "@clerk/react": path.resolve(import.meta.dirname, "src/clerk-falso.tsx"),
      "@clerk/themes": path.resolve(import.meta.dirname, "src/clerk-falso.tsx"),
'''
assert alvo in s
s = s.replace(alvo, novo, 1)
open(p, 'w', encoding='utf-8').write(s)
print('vite.config.ts: alias do Clerk')
PY
