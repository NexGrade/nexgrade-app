# NexGrade — instruções para o Claude Code

Sistema SaaS de gestão de horários escolares (grade, professores, turmas, salas e **reservas**). Monorepo pnpm: `artifacts/api-server` (Express + Drizzle), `artifacts/horario-escolar` (React), `lib/db` (esquema e migrações). Idioma de tudo que o usuário vê e de commits/PRs: **português do Brasil**.

## Leia antes de mexer
1. `docs/passagem-2026-10-17.md` — estado mais recente: o que está no ar, permissões, banco, pendências.
2. `replit.md` — arquitetura, convenções e armadilhas (gotchas).
3. `docs/README.md` — índice dos demais documentos.

## Como trabalhar com o dono do projeto
- **PowerShell: um comando de cada vez**, e esperar ele colar o resultado antes de passar o próximo.
- **Qualquer script que grava no banco roda primeiro em dry-run** (padrão dos scripts em `scripts/`), com o resultado colado e conferido antes do `--aplicar`.
- Não crie PR nem faça merge sem ele pedir. Quando pedir, **espere o CI ficar verde** antes de mesclar.
- Diga com franqueza o que **não foi testado** (por exemplo, "só typecheck, não vi na tela").
- Antes de apagar ou sobrescrever dados, olhe o que existe e mostre a ele.

## Banco de dados
- **Nunca use `drizzle-kit push` no banco real.** Mudou o esquema → `pnpm --filter @workspace/db run generate` → **revisar o SQL gerado** → testar num Postgres temporário → o dono roda `pnpm --filter @workspace/db run migrate` no banco real.
- O código novo deve **continuar funcionando se a migração atrasar** (o rollout dos bloqueios foi feito assim).
- O banco real já adotou a base de migrações (`scripts/adotar-migracoes.ts`, feito em 17/10/2026).

## Verificar antes de commitar
- `pnpm run typecheck:libs` (recompila as libs; sem isso o typecheck vê tipos antigos), depois o typecheck de `artifacts/api-server` e `artifacts/horario-escolar` (`pnpm run typecheck` na raiz faz tudo).
- `pnpm --filter @workspace/api-server run test` (o CI também roda). Os testes de **integração** (`*.integration.test.ts`, reservas com banco real) só rodam com `TEST_DATABASE_URL` apontando para um Postgres **já migrado** (o CI sobe um e aplica as migrações); sem ela são pulados. Mudou regra de reserva, bloqueio, tablets ou permissão? **Acrescente o caso nesse arquivo** e rode contra um Postgres local antes do PR.
- O CI falha se o esquema (`lib/db/src/schema`) mudou **sem a migração gerada** e se as migrações não aplicam num banco vazio.
- Mexeu em permissão (`artifacts/api-server/src/lib/permissao.ts`)? Rode os testes e acrescente casos: o professor **não** pode ler nem gravar dados da equipe.

## Git
- Depois de um PR mesclado por squash, recomece a branch de trabalho a partir da `main` (`git checkout -B <branch> origin/main`). Se o push for recusado, use `--force-with-lease=<branch>:<sha-antigo>` (só quando a remota tem apenas trabalho já mesclado).
