# Documentação do NexGrade

- [`requisitos-funcionais-e-nao-funcionais.md`](./requisitos-funcionais-e-nao-funcionais.md) — visão do produto, diferenciais e todos os requisitos funcionais (RF-*) e não funcionais (RNF-*), com prioridade (P0/P1/P2).
- [`analise-formatos-uranin-sere.md`](./analise-formatos-uranin-sere.md) — registro de proveniência: análise de dados públicos (SERE/SEED-PR) e de funcionalidades observadas no mercado, com diretrizes de originalidade. Leitura obrigatória antes de nomear qualquer tela, campo ou fluxo novo.
- [`relatorio-tecnico-revisao-e-diferencial-competitivo.md`](./relatorio-tecnico-revisao-e-diferencial-competitivo.md) — revisão técnica completa (arquitetura, segurança, estado das funcionalidades) e análise de diferencial competitivo.

## Convenção de rastreabilidade

Toda funcionalidade implementada deve ser rastreável a um ID de requisito (`RF-XXX-NN` / `RNF-XXX-NN`). Commits e PRs devem referenciar esse ID (ex. `fix(horarios): respeitar disponibilidade (RF-ALOC-04)`), seguindo o padrão já usado nos commits deste histórico.
