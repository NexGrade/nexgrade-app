# Checklist de liberação para as escolas

Atualizado em 09/10/2026. Perfis liberados: **ADM** (Direção/Coordenação) e **Gestor de Reservas**.

Legenda: ✅ feito e conferido · 🟡 falta testar · ⬜ pendente

## 1. Código e PR

- ✅ `pnpm run typecheck` passou nos três projetos (commit `8aaafe2`).
- ✅ Menu do ADM completo (conferido no navegador).
- ✅ Menu do Gestor: Horário, Calendário (consulta) e Reservas (conferido).
- ✅ Convidado entra direto na escola, sem cair no cadastro de escola nova (conferido com o gestor).
- 🟡 Tela de Reservas por semana, com dados reais: criar sala, professor e 2 a 3 reservas; conferir os filtros Pendentes e Confirmadas e o clique no cartão.
- 🟡 Gestor: `/usuarios` e `/reservas/regras` voltam para `/reservas`; Horário em "Modo consulta"; Calendário sem a aba de turnos.
- 🟡 ADM: cartão "Turmas sem Horário" da Visão Geral abre a lista filtrada.
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
