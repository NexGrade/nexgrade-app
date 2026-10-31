# Documentação do NexGrade

- [`requisitos-funcionais-e-nao-funcionais.md`](./requisitos-funcionais-e-nao-funcionais.md) — visão do produto, diferenciais e todos os requisitos funcionais (RF-*) e não funcionais (RNF-*), com prioridade (P0/P1/P2).
- [`analise-formatos-sere.md`](./analise-formatos-sere.md) — registro de proveniência: análise de dados públicos (SERE/SEED-PR) e de funcionalidades observadas no mercado, com diretrizes de originalidade. Leitura obrigatória antes de nomear qualquer tela, campo ou fluxo novo.
- [`relatorio-tecnico-revisao-e-diferencial-competitivo.md`](./relatorio-tecnico-revisao-e-diferencial-competitivo.md) — revisão técnica completa (arquitetura, segurança, estado das funcionalidades) e análise de diferencial competitivo.
- [`passagem-2026-10-31.md`](./passagem-2026-10-31.md) — nota de passagem mais recente: planilhas em Excel formatadas, cargo Pedagogia no banco, turma integral na geração/trava/conflitos pelo horário real, Mário Braga pelo Urânia de 02-06/11 e o que está em aberto.
- [`passagem-2026-10-17.md`](./passagem-2026-10-17.md) — nota de passagem: Reservas (tablets por quantidade, gestor agendando por professor, cards da semana, permissões), como testar e o que está em aberto.
- [`../CLAUDE.md`](../CLAUDE.md) — instruções que o Claude Code carrega ao abrir o projeto (onde ler primeiro, regras de trabalho, banco, verificação e git).

## Convenção de rastreabilidade

Toda funcionalidade implementada deve ser rastreável a um ID de requisito (`RF-XXX-NN` / `RNF-XXX-NN`). Commits e PRs devem referenciar esse ID (ex. `fix(horarios): respeitar disponibilidade (RF-ALOC-04)`), seguindo o padrão já usado nos commits deste histórico.
