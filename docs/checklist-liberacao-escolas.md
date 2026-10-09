# Checklist de liberação para as escolas

Atualizado em 09/10/2026 (parte 1 revisada à tarde). Perfis liberados: **ADM** (Direção/Coordenação) e **Gestor de Reservas**.

Legenda: ✅ feito e conferido · 🟡 falta testar · ⬜ pendente

## 1. Código e PR

Última verificação (commit `c19ffe7`): `pnpm run typecheck` passou nos três projetos e `pnpm --filter @workspace/api-server test` passou **15 de 15** (inclui os testes novos de permissão, que cobrem o bloqueio ignorando maiúsculas).

**Conferido**
- ✅ Menu do ADM completo (navegador).
- ✅ Menu do Gestor: Horário, Calendário (consulta) e Reservas, sob o grupo "Consulta" (navegador).
- ✅ Convidado entra direto na escola, sem cair no cadastro de escola nova (testado com o gestor).
- ✅ Permissões: leituras da coordenação e regras por professor do gestor agora ignoram maiúsculas no endereço (`/Audit`, `/reservas/Regras-Professores`); testes automáticos passando.
- ✅ Marca (logo e nome) aparece uma vez só, na barra de cima; o menu lateral não repete (conferido no navegador).
- ✅ Falha de conexão com o banco mostra "Não foi possível carregar a sua escola" com *Tentar novamente*, em vez de mandar para o cadastro.
- ✅ Grade matutina do Romário conferida contra o PDF do Urânia: 420 aulas de cada lado, mesmas turmas, nenhuma diferença de professor. Ficaram só diferenças de rótulo da HA (`HA*` e `H.A.T`), um professor `JOSELEINE` com `R.9M` que só existe no Urânia e abreviações de disciplina (o NexGrade corta em 8 letras).
- ✅ Romário vespertino e noturno conferidos contra os PDFs do Urânia (09/10/2026; PDFs do Urânia de 06/10 e 05/10): vespertino 346 aulas, 14 turmas, mesmos horários e **mesmo professor em 346 de 346**; noturno 181 aulas, 10 turmas (3º ano dividido em FGB/IF), **mesmo professor em 181 de 181**, incluindo os 3 trios de terça (1NA, 1NB e 2NA-HUM). Em ambos cada código de disciplina corresponde a uma única disciplina do Urânia. Não comparado: hora-atividade e marcações próprias do Urânia (`IFA`, `A.3A`, `R.6M`, `COORD` etc.), que não vão no XML.
- ✅ XML do RCO do matutino do Romário: estrutura, `CODESCOLA`, horários, sem aula repetida e sem professor em duas turmas ao mesmo tempo.

**Implementado, falta testar no navegador**
- 🟡 Tela de Reservas por semana (segunda a sexta), com dados reais: criar sala, professor e 2 a 3 reservas; conferir os totais da semana, o filtro por Pendentes e Confirmadas (cartões clicáveis) e o clique no cartão de reserva (abre a edição).
- 🟡 Gestor: `/usuarios` e `/reservas/regras` voltam para `/reservas`; Horário em "Modo consulta"; Calendário só com a aba do calendário letivo.
- 🟡 ADM: cartão "Turmas sem Horário" da Visão Geral abre a lista filtrada (`/turmas?filtro=sem-horario`).
- ✅ Exportar para o RCO com e sem aulas assíncronas (matutino do Romário, 09/10/2026, pelo script `gerar-xml-sere.cjs`): 420 aulas sem e 422 com; as 2 extras são da 3STM (FGB) (André, quarta aula 2, e Elisiane, terça aula 3) e **não colidem** com outra aula da mesma turma, porque a aula regular desses horários está na parte IF. Professor igual ao do Urânia em 420 de 420 aulas; cada CODDISC corresponde a uma única disciplina do Urânia. Falta só testar a caixa da tela (precisa do deploy).

**Pendente**
- ⬜ Grade SEED (lista da GEHA/SEED) das 13 turmas do Romário que ainda não têm, para o RCO conferir "disciplina fora da grade" também nelas. Hoje só as 4 turmas do 3º ano (FGB/IF) têm.
- ✅ Horário da 3ª aula do noturno do Romário alinhado ao Urânia em 09/10/2026 (`lib/db/ajustar-horario-noturno-romario.cjs`): de `20:30` (50 min) para `20:35` (45 min, termina às 21:20). A duração de 45 min foi deduzida do início da 4ª aula no PDF do Urânia; confirmar com a escola. Falta reexportar o noturno para conferir o XML.
- ⬜ Turma `2640411` = **3STM (FGB)** sem a disciplina `3780` (Projeto de Vida) que a grade SEED prevê. O Urânia também não a mostra nessa turma (o Projeto de Vida só aparece na 3ADM, sexta 09:10); confirmar com a escola.
- ⬜ Trilhas de aprofundamento (`TIPODISC`): a lista no gerador está vazia, tanto para o Romário quanto para o Mário Braga. Confirmar se a escola tem trilhas.
- ⬜ Fazer o merge do PR 1 e confirmar como o deploy sai (automático da `main`, ou manual).

## 2. Clerk (ambiente de produção)

- ⬜ Conferir que a produção usa as chaves `pk_live_` e `sk_live_` (os testes usaram `pk_test_`).
- ⬜ Limitar a **1 organização por usuário** (Organizations → Settings), se o plano permitir. Evita a escola duplicada que apareceu nos testes.
- ⬜ Redirecionamento do link do convite: em teste ele caiu no painel do Clerk. Configurar a URL do sistema para o convidado entrar direto.
- ⬜ E-mail do convite: hoje chega **em inglês** e **no spam** (remetente genérico do Clerk). Traduzir o modelo e configurar remetente/domínio próprio (SPF e DKIM).
- ⬜ Login por senha ligado, para aparecer o link "Esqueci minha senha"; conferir também o login com Google.
- ⬜ O gestor funciona como membro comum com `cargo = reservas` na membership (plano Hobby). Conferir que o convite feito em produção grava isso (em teste funcionou).

## 3. Banco de dados (Supabase)

- ⬜ **Backups:** o plano gratuito do Supabase não faz backup automático (o painel mostrava "No backups"). Conferir que o fluxo `backup-banco.yml` (GitHub Actions) está rodando e que o `teste-restauracao.yml` passa.
- ⬜ Não rodar `drizzle-kit push` na produção sem revisar o que ele vai alterar (ele aplica direto, sem perguntar).
- ℹ️ O erro `ECONNRESET` visto nos testes era só do Node no Windows local. Para rodar local, use `NODE_OPTIONS=--no-network-family-autoselection`. A produção (Linux) não é afetada.
- ℹ️ O projeto `nexgrade-teste` (Supabase) e o arquivo `.env.teste` servem para testes locais e não vão para o GitHub.

## 4. Dados de cada escola

- ⬜ Código INEP em *Dados da Escola*.
- ⬜ Para exportar ao RCO: código SERE das turmas e código do RCO das disciplinas cadastrados.
- ⬜ Criar o ADM de cada escola e convidar os gestores pela tela *Usuários*.

## 5. Comunicação com as escolas

- ⬜ Avisar que o convite chega por e-mail (olhar o spam) e que se deve usar **o link do convite**, e não o botão "Cadastre-se" (que cria uma escola nova).
- ⬜ Divulgar o contato de suporte (hoje no rodapé do login: `contato@nexuscoretecnologia.com.br`).
- ⬜ Não anunciar a exportação do RCO como "integração automática": a escola envia o arquivo manualmente.

## 6. Depois de liberar

- ⬜ Acompanhar os logs da API na primeira semana (erros 500 e 403).
- ⬜ Conferir se alguma escola caiu no cadastro de escola nova por engano.
