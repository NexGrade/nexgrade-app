# NexGrade

SaaS completo de gestão de horários escolares para escolas públicas brasileiras. Multi-tenant (Clerk Organizations), com Assistente de IA, importação inteligente CSV, planos de billing e painel master SaaS.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — rodar API server (porta 8080)
- `pnpm --filter @workspace/horario-escolar run dev` — rodar frontend (porta via $PORT)
- `pnpm run typecheck` — typecheck completo em todos os pacotes
- `pnpm run build` — typecheck + build em todos os pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks e Zod schemas a partir do OpenAPI spec
- `pnpm --filter @workspace/db run push` — aplicar mudanças de schema ao banco (dev only)
- Env obrigatórios: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk Auth (`@clerk/express`)
- Frontend: React + Vite + Tailwind v4 + shadcn/ui + Clerk React (`@clerk/react`)
- DB: PostgreSQL + Drizzle ORM
- Validação: Zod (`zod`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — source-of-truth para todos os schemas do banco (index.ts exporta tudo)
- `lib/api-spec/openapi.yaml` — contrato da API (40+ endpoints)
- `artifacts/api-server/src/routes/` — todas as rotas do Express
- `artifacts/horario-escolar/src/pages/` — todas as páginas do frontend
- `artifacts/horario-escolar/src/App.tsx` — ClerkProvider + roteamento
- `artifacts/horario-escolar/src/components/layout.tsx` — sidebar com todos os nav groups

## Architecture decisions

- **Contract-first API**: OpenAPI spec → Orval codegen → React Query hooks + Zod schemas. Nunca alterar os hooks gerados manualmente.
- **Zod import**: usar `import { z } from "zod"` (NOT "zod/v4") no api-server — esbuild não resolve o subpath zod/v4.
- **Clerk Proxy**: `clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL` sempre incondicionalmente no ClerkProvider (vazio em dev, auto-populado em prod).
- **publishableKey**: sempre usar `publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)` — nunca a env var diretamente.
- **Tailwind v4 + Clerk**: `@layer theme, base, clerk, components, utilities` deve vir ANTES de `@import "tailwindcss"` no index.css. Usar `tailwindcss({ optimize: false })` no vite.config.ts.
- **Experimental mode**: POST /api/horarios/gerar com `experimental:true + nomeExperimental` salva em `horarios_experimentais`. POST /api/horarios/experimentais/:nome/promover copia para tabela oficial.

## Product

- **Autenticação multiusuário** (Clerk): perfis direção, coordenação, professor, secretaria
- **Grade Horária**: geração automática por algoritmo com redução de janelas e fator pedagógico
- **Detecção de conflitos** com 5 tipos e sugestões algorítmicas de resolução
- **Modo Experimental**: testar grades alternativas sem afetar a grade oficial
- **Salas e Espaços**: sala de aula, laboratório, informática, quadra, auditório, biblioteca
- **Licenças de professores** com substitutos e comunicados automáticos
- **Comunicados** para turmas com filtro de não lidos
- **Histórico de alterações** (audit log) filtrável por entidade
- **Usuários e permissões** com perfis por escola
- **Configurações** por escola (modalidade, SEED, geração de horário)
- **Exportação**: grade CSV, controle de ponto CSV, relatório SEED JSON por estado

## User preferences

- Foco em funcionalidade real, sem dados mockados
- Português brasileiro em toda a interface
- Estratégia de monetização: fase Piloto (atual) é gratuita para as escolas parceiras, para validação real de mercado. A arquitetura já está pronta para expansão SaaS paga (planos Pro/Master com Stripe, ver `lib/db/src/schema/escolas.ts` e `pages/onboarding`) — a cobrança é habilitada depois, sem precisar remodelar o schema.
- Nomenclatura, taxonomias e textos de interface devem ser sempre próprios do NexGrade — nunca reproduzir telas, rótulos ou esquemas de codificação de produtos de terceiros observados durante a pesquisa de mercado (ver `docs/analise-formatos-uranin-sere.md`)

## Onboarding

- `pages/onboarding/index.tsx` — primeiro cadastro da escola logo após o login (RF-ESC-01). Todo cadastro novo entra automaticamente no plano Piloto (gratuito); os planos Pro/Master já aparecem na tela, marcados "Em breve", para não exigir retrabalho de UI quando a cobrança for habilitada.
- `App.tsx` → `EscolaGate` redireciona qualquer usuário logado sem escola cadastrada (`useGetEscolaAtual().cadastrada === false`) para `/onboarding`, mesmo entrando por link profundo.
- Backend: `GET /escolas/planos`, `GET /escolas/me`, `POST /escolas` (ver `routes/escolas.ts`).

## Curso e Matriz Curricular (RF-CUR)

- `lib/db/src/schema/cursos.ts` — `Curso` → `MatrizCurricular` (por série/ano) → `ItemMatriz` (disciplina + categoria curricular + carga horária semanal + grupo de opções, ex. Língua Estrangeira). `categoriaCurricular` usa nomenclatura própria do NexGrade — ver `docs/analise-formatos-uranin-sere.md` antes de alterar esse enum.
- `disciplinasTable` ganhou `codigoSae` opcional (único campo de origem regulatória direta — Código SAE é dado público da SEED-PR).
- Telas: `pages/cursos/index.tsx` (lista/criação) e `pages/cursos/id.tsx` (monta a matriz de cada série).
- **Pendente (próxima etapa natural):** ~~`turmasTable.matrizCurricularId` já existe no schema mas ainda não é usado~~ — **resolvido**: `POST /turmas/:id/aplicar-matriz` copia disciplinas + cargas horárias da matriz escolhida para `turma_disciplinas` (campo `cargaHorariaSemanalOverride`), e `routes/horarios.ts`/`routes/conflitos.ts` agora usam essa carga efetiva (override da matriz, com fallback para a carga global de `disciplinasTable` quando a turma não tem matriz aplicada). UI em `pages/turmas/horario.tsx` (card "Matriz Curricular").
- **Integração RCO/SEED-PR:** ainda não há parser/exportador específico. Não existe API pública do RCO — só troca manual de arquivo XML, e a especificação exata do XML ainda não foi obtida. Ver RF-PARSE-07 no documento de requisitos: o caminho correto é solicitar formalmente à SEED-PR, não tentar inferir o formato. Quando a especificação chegar, o Código SAE em `disciplinasTable` e a estrutura de `Curso`/`MatrizCurricular` já são a base pronta para o mapeamento.

## Assistente de IA com ações confirmadas (RF-IA)

- `routes/ai.ts` — o modelo (`gpt-4o-mini`, function calling) nunca escreve no banco diretamente. Duas ações estão implementadas: `definir_disponibilidade` e `gerar_horario_turma`. Fluxo: (1) o modelo decide chamar uma função e informa os nomes como o usuário os digitou (não IDs); (2) o backend resolve esses nomes contra os dados reais da escola — se não achar ninguém, avisa; se achar mais de um, pede pra especificar (RF-IA-05, nunca adivinha); se achar exatamente um, monta um resumo em português e devolve como `acaoPendente` via SSE, **sem persistir nada**; (3) o frontend mostra botões Confirmar/Cancelar; (4) só em `POST /ai/executar-acao`, depois do clique em Confirmar, a escrita acontece de fato — e grava em `audit_logs` (RF-IA-03).
- Isso é o único lugar do sistema hoje que escreve em `audit_logs` — o restante das rotas (professores, turmas, etc.) ainda não grava auditoria (RF-AUD-01 geral segue pendente, ver próxima seção).
- Perguntas comuns (sem tool call) continuam funcionando como antes — resposta da IA é salva e enviada num único evento SSE (trade-off: perdeu o streaming token-a-token que existia antes, porque agora a mesma chamada decide "é ação ou é pergunta" antes de responder; sem isso duplicaria a chamada à OpenAI). Se a experiência de streaming token-a-token for importante, dá pra reintroduzir mantendo o function-calling, com um pouco mais de complexidade (detectar tool call nos primeiros deltas do stream).

## Migrations versionadas (substitui `drizzle-kit push`)

`lib/db/drizzle.config.ts` agora tem `out: ./drizzle` e os scripts `generate`/`migrate` (além do `push` antigo, mantido por compatibilidade). Uma migration inicial de baseline já foi gerada (`lib/db/drizzle/0000_slow_saracen.sql`), refletindo o schema atual — gerada sem precisar de banco vivo (`generate` só faz diff de schema, não conecta).

**Atenção — passo manual obrigatório antes de usar `migrate` no banco já em uso:** o banco de produção/desenvolvimento atual já tem esse schema aplicado via `push`. Rodar `pnpm run migrate` direto tentaria `CREATE TABLE` em tabelas que já existem e falharia. Antes de adotar `migrate` dali pra frente:
1. Rodar a migration 0000 uma vez contra um banco **vazio** para confirmar que o SQL gerado está correto.
2. No banco real (já populado), marcar a migration 0000 como "já aplicada" inserindo manualmente o registro correspondente na tabela de controle do drizzle (`drizzle.__drizzle_migrations` — nome padrão, confirmar exato na versão instalada do drizzle-kit) com o hash da migration 0000, **sem executar o SQL dela**.
3. Só a partir daí, toda mudança de schema nova segue `generate` → revisar o SQL → commitar → `migrate`, nunca mais `push`.

Isso não foi executado nesta sessão porque não há uma `DATABASE_URL` de banco real disponível neste ambiente de revisão — fazer esse passo com cuidado, olhando o SQL gerado, é mais seguro do que eu tentar simular sem visibilidade do banco de verdade.

## Testes automatizados (início)

`artifacts/api-server` ganhou Vitest (`pnpm run test`), com um `vitest.config.ts` que injeta uma `DATABASE_URL` fictícia — necessária porque `@workspace/db` cria o Pool do `pg` no escopo do módulo e lança erro se a variável não existir; o Pool em si só conecta na primeira query, então isso é seguro para testes puramente unitários (sem tocar banco de verdade). Cobertura inicial:
- `lib/escola-id.test.ts`: as 3 regras de precedência (orgId > userId > escola_default) que sustentam todo o isolamento multi-tenant corrigido nesta revisão.
- `routes/importar.test.ts`: parser de CSV e detecção de tipo de arquivo.

Ainda não há testes de integração (rota + banco real) nem cobertura das regras de negócio do Solver (`horarios.ts`) — próximo passo natural depois deste início.

## Painel Master SaaS (RF-MASTER-01 a RF-MASTER-03)

- **Acesso**: allowlist simples via variável de ambiente `MASTER_USER_IDS` (userId do Clerk, separados por vírgula) — ver `middlewares/requireMaster.ts`. Sem essa variável configurada, ninguém acessa `/master` (comportamento seguro por padrão). Trocar por um papel de verdade no banco quando houver mais de uma pessoa administrando a plataforma.
- **`GET /master/whoami`** é o único endpoint deste módulo que qualquer usuário autenticado pode chamar — é assim que o frontend decide se mostra o link "Painel Master" no menu (`components/layout.tsx`), sem expor nenhum dado de verdade.
- **Escolas** (RF-MASTER-01): listar todas com métricas básicas (professores/turmas), ativar/desativar (`planoAtivo`), trocar de plano.
- **Planos** (RF-MASTER-02): CRUD completo — preço, limites, quais recursos o plano libera (IA/export/import), ativo/inativo.
- **Métricas da plataforma** (RF-MASTER-03): total de escolas (ativas/inativas/em trial), professores, turmas, aulas distribuídas, usuários, mensagens enviadas ao Assistente de IA — agregado de TODAS as escolas, de propósito (é o único lugar do sistema que faz isso; todo o resto é escopado por escola).
- **Ainda não implementado**: RF-MASTER-04 (triagem de suporte) e RF-MASTER-05 (changelog/controle de atualizações) — ambos exigiriam tabelas novas, deixados como próximo passo natural quando fizerem sentido.

## Pendências gerais conhecidas

- **RF-AUD-01 (auditoria geral):** hoje só as ações confirmadas pelo Assistente de IA gravam em `audit_logs`. CRUD manual de professores/turmas/disciplinas/etc. ainda não grava — a tabela e a tela de consulta (`routes/audit.ts`, `pages/audit`) já existem, falta só instrumentar as rotas de escrita.

- ~~`routes/horarios.ts` e `routes/conflitos.ts` não filtravam por `escolaId`~~ — **corrigido**: toda leitura/escrita nessas duas rotas agora é escopada à escola do usuário autenticado, incluindo as tabelas de junção sem coluna própria de escola (`turma_disciplinas`, `professor_disciplinas`, `disponibilidade_professores`), escopadas indiretamente via a lista de turmas/professores já filtrada. Também passam a validar que a turma pertence à escola antes de gerar horário, criar slot manual ou promover um experimental.

## Segurança — correção crítica (RNF-SEG-03 / RNF-SEG-04)

Auditoria encontrou dois problemas sérios, ambos corrigidos:

1. **Nenhuma rota exigia login.** `clerkMiddleware()` só decodifica o token quando ele existe — não bloqueia quem não manda nenhum. Só `GET /usuarios/me` checava isso manualmente; todo o resto respondia normalmente para chamadas sem sessão, tratando-as como pertencentes a uma "escola" `escola_default`. **Corrigido**: `src/middlewares/requireAuth.ts` aplicado a toda a API em `app.ts`, exceto `/healthz` (que precisa continuar público para monitoramento).
2. **8 rotas sem nenhum isolamento por escola**: `disponibilidade`, `salas`, `licencas`, `comunicados`, `configuracoes`, `audit`, `export`, `stats` liam/escreviam misturando dados de todas as escolas da plataforma. O caso mais grave: `GET /audit` devolvia o log de auditoria de qualquer escola pra qualquer chamada. **Corrigido**: todas agora filtram por `escolaId` (via coluna própria ou, no caso de `disponibilidade_professores`, validando o `professorId` envolvido).

Isso não afeta o fluxo normal de quem já está logado no navegador — o app depende do cookie de sessão do Clerk (mesma origem), não de um header `Authorization` explícito (`setAuthTokenGetter` existe no cliente gerado mas não é usado hoje; é para um cenário futuro de acesso via token, ex. app mobile/integração externa).

Mais 3 achados da mesma varredura, também corrigidos:
- `routes/usuarios.ts` também não isolava por escola (`GET /`, `POST /`, `PATCH /:id`).
- CORS estava com `origin: true` + `credentials: true` — permitia CSRF via qualquer site usando o cookie de sessão do usuário. Agora exige `CORS_ALLOWED_ORIGINS` (env var, domínios separados por vírgula) ou mesma origem.
- `pages/assistente/index.tsx` usava `dangerouslySetInnerHTML` sem escapar HTML — resposta de IA manipulada por prompt injection podia executar script no navegador. Corrigido.

**Pendências de produção identificadas na revisão de segurança:**
- ~~Sem rate limiting~~ — **corrigido**: `middlewares/rateLimit.ts` (geral + limite apertado para `/ai`).
- ~~Sem middleware de erro global~~ — **corrigido**: `middlewares/errorHandler.ts`.
- ~~Zero testes automatizados~~ — **início feito**: Vitest com 9 testes (ver seção "Testes automatizados" acima); ainda falta cobertura de integração e do Solver.
- ~~Sem CI/CD~~ — **corrigido**: `.github/workflows/ci.yml` (typecheck em PR/push).
- Pool do Postgres sem configuração de SSL/timeout explícita — **ainda pendente**.
- ~~Schema gerenciado só por `drizzle-kit push`~~ — **scaffolding pronto** (ver seção "Migrations versionadas" acima), mas a transição segura no banco real ainda precisa do passo manual documentado ali.

## Gotchas

- Ao mudar o OpenAPI spec, sempre rodar `pnpm --filter @workspace/api-spec run codegen` antes de editar páginas frontend.
- **Depois do codegen, rodar `pnpm run typecheck:libs` (= `tsc --build`) antes de conferir o typecheck do frontend/backend.** As libs (`lib/db`, `lib/api-zod`, `lib/api-client-react`) têm uma pasta `dist/` com declarações pré-compiladas; graças às TypeScript project references, o `tsc` de um artifact pode ler essas declarações desatualizadas em vez do `src/` atual e reportar "no exported member" para símbolos que na verdade existem. `tsc --build --force` na raiz resolve.
- `pnpm --filter @workspace/db run push` só funciona com banco acessível (não rodar em CI puro).
- O nome da aplicação no widget Clerk em dev mostra o nome do tenant (não configurável no código) — muda no dashboard do Clerk.
- Não adicionar `queryKey` manualmente em hooks que já o recebem por padrão via Orval — mas quando usar `{ query: { enabled } }`, incluir `queryKey` explicitamente.

## Pointers

- Ver skill `pnpm-workspace` para estrutura do workspace, TypeScript setup e detalhes dos pacotes
- Ver skill `clerk-auth` para setup de autenticação, customização e troubleshooting
