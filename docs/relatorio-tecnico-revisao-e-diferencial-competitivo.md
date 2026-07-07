# NexGrade — Relatório Técnico de Revisão e Diferencial Competitivo

**Versão:** 2.0 (atualizado após a rodada de correções de segurança, auditoria, Painel Master, testes/CI e renomeação)
**Data original:** 04/07/2026
**Escopo:** Revisão técnica completa do código-base (backend, frontend, banco de dados, segurança) e posicionamento competitivo do produto.

---

## 1. Sumário executivo

O NexGrade está funcionalmente completo no núcleo e, depois de duas rodadas de revisão, **seguro no nível esperado de um SaaS multi-tenant comercial**: autenticação obrigatória em toda a API, isolamento de dados por escola em absolutamente todas as rotas (14 endpoints corrigidos ao longo da revisão), CORS restrito, XSS fechado, rate limiting, tratamento de erro global, auditoria instrumentada nos módulos principais e um começo real de testes automatizados + CI.

O Painel Master SaaS (RF-MASTER), que na primeira versão deste relatório estava marcado como "não iniciado", **já está implementado** — gestão de escolas, planos e métricas agregadas da plataforma.

O que resta não é mais nem "brecha de segurança" nem "funcionalidade ausente" — é **profundidade**: mais cobertura de teste, migrations versionadas aplicadas de fato ao banco em uso, e evolução do Solver para além da heurística atual. Nada disso bloqueia a operação comercial com a escola-piloto hoje.

---

## 2. Arquitetura técnica

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | React + Vite + Tailwind + shadcn/ui | SPA, roteamento client-side (wouter) |
| Backend | Express 5 + TypeScript | Monorepo pnpm workspace |
| Banco | PostgreSQL + Drizzle ORM | Queries parametrizadas (protegido contra SQL injection por construção) |
| Contrato de API | OpenAPI → Orval (codegen) | Backend e hooks do frontend gerados a partir da mesma fonte — reduz divergência entre o que a API expõe e o que o frontend consome |
| Autenticação | Clerk (Organizations = Escola) | Sessão via cookie, mesma origem |
| IA | OpenAI (`gpt-4o-mini`, function calling) | Ações confirmadas, nunca automáticas |

**Ponto forte de arquitetura:** o par OpenAPI + Orval é uma escolha superior à prática comum de escrever tipos manualmente dos dois lados — qualquer mudança de contrato quebra a build imediatamente em vez de falhar silenciosamente em produção.

**Ponto de atenção:** o schema do banco é sincronizado com `drizzle-kit push`, não por migrations versionadas com histórico. Isso é aceitável para o ritmo de protótipo/piloto, mas precisa mudar antes de haver dado real de mais de uma escola em produção — `push` pode interpretar uma alteração de coluna como "remover e recriar" e apagar dado sem aviso.

---

## 3. Segurança — estado final após as duas rodadas de revisão

### 3.1 O que já existia e estava correto desde o início
- Autenticação via Clerk (infraestrutura sólida, padrão de mercado).
- Queries parametrizadas via Drizzle ORM.
- Validação de entrada com Zod na maior parte das rotas de escrita.
- Segredos exclusivamente em variável de ambiente — nenhuma chave hardcoded encontrada em toda a varredura do código.

### 3.2 O que foi encontrado e corrigido (todas as rodadas)

| # | Problema | Gravidade | Status |
|---|---|---|---|
| 1 | Nenhuma rota exigia sessão válida — `clerkMiddleware()` só decodifica o token quando existe, não bloqueia quando ausente | **Crítico** | Corrigido — `requireAuth` global |
| 2 | `GET /audit` devolvia log de auditoria de **todas as escolas** para qualquer chamada | **Crítico** | Corrigido |
| 3 | 10 rotas sem filtro de escola (`horarios`, `conflitos`, `disponibilidade`, `salas`, `licencas`, `comunicados`, `configuracoes`, `audit`, `export`, `stats`, `usuarios`) | **Crítico** | Corrigido |
| 4 | 2 vazamentos adicionais em `cursos.ts` (`GET`/`DELETE` de matrizes sem checar escola) e 1 em `professores.ts` (`GET /:id/carga`) | **Alto** | Corrigido |
| 5 | CORS com `origin: true` + `credentials: true` — abria caminho para CSRF via qualquer site usando o cookie de sessão do usuário | **Alto** | Corrigido — allowlist explícito (`CORS_ALLOWED_ORIGINS`) |
| 6 | XSS no Assistente de IA — resposta renderizada como HTML bruto sem escapar | **Médio-Alto** | Corrigido |
| 7 | Sem rate limiting em nenhuma rota | Médio | Corrigido — geral + limite apertado em `/ai` |
| 8 | Sem middleware de erro global (risco de vazar stack trace) | Médio | Corrigido |

**Total: 14 endpoints com problema de isolamento/acesso corrigidos ao longo da revisão**, em 6 arquivos de rota diferentes.

### 3.3 O que ainda falta (não bloqueante, recomendado antes de escalar)

| Item | Estado |
|---|---|
| RF-AUD-01 (auditoria geral) | 🟡 Instrumentado em `professores`, `disciplinas`, `turmas`, `cursos`/matriz e importação em lote + todas as ações de IA. Ainda falta em `salas`, `licencas`, `comunicados`, `configuracoes`. |
| Testes automatizados | 🟡 Início real: Vitest configurado, 9 testes cobrindo a regra de isolamento multi-tenant (`getEscolaId`) e o parser de CSV. Falta cobertura de integração (rota + banco) e do Solver. |
| CI/CD | ✅ Workflow de typecheck (libs + backend + frontend) em todo PR/push. |
| Migrations versionadas | 🟡 Scaffolding pronto (`generate`/`migrate`, baseline gerado), mas a transição segura no banco já em uso ainda precisa de um passo manual (documentado em `replit.md`) que não pôde ser executado neste ambiente por falta de acesso ao banco real. |
| Pool do Postgres sem SSL/timeout explícitos | Ainda pendente. |

**Recomendação de prioridade:** o passo manual de migrations e a cobertura de auditoria nas 4 rotas restantes são os itens de maior valor/menor esforço que sobraram.

---

## 4. Estado das funcionalidades (vs. documento de requisitos)

| Módulo | Status |
|---|---|
| Autenticação e multi-tenant (RF-AUTH) | ✅ Funcional e agora seguro |
| Onboarding / plano Piloto (RF-ESC-01) | ✅ Completo |
| Professores, disciplinas, turmas (RF-PROF/DISC/TUR) | ✅ Completo |
| Curso / Matriz Curricular / Código SAE (RF-CUR) | ✅ Completo, incluindo aplicação de matriz à turma |
| Disponibilidade do professor (RF-DISP) | ✅ Completo — 3 telas + respeitado pelo Solver |
| Motor de geração de horário (RF-SOLV) | ✅ Funcional (heurística gulosa por turma, não um solver de otimização global — ver seção 6) |
| Detecção de conflitos (RF-ALOC) | ✅ 6 tipos detectados, com sugestão de resolução |
| Assistente de IA com ações (RF-IA) | ✅ RF-IA-01/03/05 implementados; RF-IA-02 (consulta livre) funcional; RF-IA-04 parcial |
| Parser de importação (RF-PARSE) | 🟡 Só CSV genérico — sem ponte com RCO/SEED-PR (bloqueado por falta de especificação oficial, ver `docs/analise-formatos-uranin-sere.md`) |
| Painel Master SaaS (RF-MASTER) | ✅ Implementado: gestão de escolas (ativar/desativar, trocar plano), gestão de planos (CRUD), métricas agregadas da plataforma. RF-MASTER-04 (suporte) e RF-MASTER-05 (changelog) ainda não iniciados. |
| Auditoria geral (RF-AUD) | 🟡 Professores, disciplinas, turmas, cursos/matriz, importação em lote e todas as ações de IA gravam log; faltam salas/licenças/comunicados/configurações |
| Simulação de cenários (RF-SIM) | 🟡 Existe "horário experimental" (promover/descartar), mas sem comparação lado a lado |

---

## 5. Diferencial competitivo

Esta seção usa como referência o levantamento de mercado já registrado em `docs/analise-formatos-uranin-sere.md` (dados públicos do SERE/SEED-PR e funcionalidades observadas em sistemas de gestão de horário escolar hoje usados por escolas do Paraná). Nenhuma comparação aqui envolve nome de produto de terceiros — o objetivo é mostrar em que eixos o NexGrade se diferencia de qualquer sistema tradicional do gênero.

### 5.1 Onde o NexGrade já entrega algo que o modelo tradicional do mercado não tem

| Diferencial | O que existe hoje no NexGrade | Por que o modelo tradicional não faz isso |
|---|---|---|
| **Assistente conversacional que executa, não só informa** | "Marque o professor Carlos indisponível na sexta" vira uma ação real, com confirmação e auditoria — não uma tela de configuração técnica | Sistemas tradicionais de horário escolar são desktop/instalados, construídos antes da era de LLMs; a interação é 100% por formulário e código de configuração (ex. tabelas de letras/códigos técnicos para regras de geminação) |
| **Currículo vinculado ao Código SAE desde o cadastro** | Disciplina já nasce com campo de Código SAE oficial; Matriz Curricular por série já é estrutura nativa, não uma tabela solta desconectada do currículo oficial | No modelo tradicional observado, "disciplina" é texto livre por escola, sem vínculo com o código oficial do Estado — a conexão com o currículo oficial fica manual |
| **Contrato de API único (OpenAPI) gerando back e frontend** | Qualquer mudança de dado quebra a build, não a produção | Sistemas legados desse mercado tendem a ser monolitos antigos sem tipagem ponta a ponta |
| **Arquitetura SaaS multi-tenant nativa desde o primeiro commit** | Uma instância, várias escolas isoladas, plano de expansão comercial (Piloto → Pro → Master) já modelado no banco | O modelo tradicional do setor historicamente vende licença por instalação/computador, não assinatura multi-tenant na nuvem |
| **Auditoria e confirmação como parte do fluxo de IA, não um adendo** | Toda ação de IA é auditável e reversível pelo humano antes de acontecer | Ferramentas que começaram a incorporar IA por cima de um produto antigo tendem a tratar isso como um chat lateral desconectado da escrita de dados |
| **Administração de rede de escolas nativa, não um relatório à parte** | Painel Master já mostra métricas agregadas de todas as escolas (professores, turmas, aulas geradas, uso da IA) e permite ativar/desativar/trocar plano direto na mesma base de dados | Sistemas tradicionais tendem a tratar "gestão de rede" como um produto ou módulo separado, vendido à parte |

### 5.2 Onde o mercado tradicional ainda está à frente (honestidade importa aqui)

- **Maturidade do algoritmo de otimização**: sistemas consolidados no setor têm anos de refinamento em heurísticas de distribuição de aula (geminação, minimização de janela, prioridades por professor) — o Solver do NexGrade hoje é uma heurística gulosa turma-a-turma, funcional mas não testada em escala real com centenas de professores e restrições concorrentes.
- **Base instalada e confiança de mercado**: anos de uso real em milhares de escolas geram uma reputação que um produto novo ainda precisa construir.
- **Integração de fato com RCO/SERE**: hoje nenhum concorrente nem o NexGrade têm uma API oficial disponível — mas quem já opera há anos nesse mercado tem o fluxo manual de exportação/importação mais rodado e testado.

### 5.3 Recomendação de discurso comercial

O diferencial mais defensável e verdadeiro do NexGrade, hoje, **não é "fazer a mesma coisa só que melhor"** — é resolver o problema com um modelo de interação e de dados diferente: conversa em vez de configuração técnica, currículo oficial nativo em vez de anexo, e SaaS multi-tenant em vez de instalação por escola. Isso é honesto, verificável no próprio código, e não depende de nenhuma alegação sobre o que o concorrente faz ou deixa de fazer.

---

## 6. Recomendações priorizadas (próximos passos)

Itens já concluídos desde a primeira versão deste relatório: rate limiting, middleware de erro global, CI/CD, auditoria nos módulos principais, Painel Master SaaS, testes automatizados (início), scaffolding de migrations, e definição/renomeação da marca (NexGrade, verificada contra conflitos de mercado).

O que resta, em ordem de valor/esforço:

1. **Executar o passo manual de transição de migrations** no banco real (documentado em `replit.md`) — só pode ser feito por quem tem acesso direto ao banco de produção.
2. **Completar RF-AUD-01** nas 4 rotas restantes (`salas`, `licencas`, `comunicados`, `configuracoes`), seguindo o padrão já usado em `professores.ts`.
3. **Ampliar cobertura de testes**: integração (rota + banco real) e regras de negócio do Solver.
4. **SSL/timeout explícitos no pool do Postgres.**
5. Só depois disso: evoluir o Solver para um motor de otimização mais robusto (RF-SOLV-04 em diante) e avançar em RF-MASTER-04/05 (suporte e changelog).

---

## 7. Changelog desta sessão de revisão (resumo por commit)

- Auth obrigatória em toda a API (`requireAuth` global, exceto `/healthz`)
- Isolamento por escola corrigido em 14 pontos, em 6 arquivos de rota diferentes
- CORS restrito a allowlist explícito
- XSS corrigido no Assistente de IA
- Rate limiting (geral + IA)
- Middleware de erro global
- Auditoria (RF-AUD-01) instrumentada em professores, disciplinas, turmas, cursos/matriz, importação em lote
- CI/CD (typecheck em PR/push)
- Testes automatizados (Vitest, 9 testes iniciais)
- Scaffolding de migrations versionadas (baseline gerado)
- Painel Master SaaS completo (escolas, planos, métricas)
- Produto renomeado de "YardFlow" para "YardGrid" e, posteriormente, para **NexGrade** (by NexCore Tecnologia), após verificações de mercado (as 5 sugestões anteriores já pertenciam a produtos EdTech reais; "YardFlow" também já era usado por outra empresa de software, fora do setor educacional)

---

*Relatório produzido como parte da revisão técnica solicitada. Referências: `docs/requisitos-funcionais-e-nao-funcionais.md` (especificação completa de RF/RNF) e `docs/analise-formatos-uranin-sere.md` (base de mercado e diretrizes de originalidade).*
