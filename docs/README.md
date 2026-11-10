# Documentação do NexGrade

- [`requisitos-funcionais-e-nao-funcionais.md`](./requisitos-funcionais-e-nao-funcionais.md) — visão do produto, diferenciais e todos os requisitos funcionais (RF-*) e não funcionais (RNF-*), com prioridade (P0/P1/P2).
- [`analise-formatos-sere.md`](./analise-formatos-sere.md) — registro de proveniência: análise de dados públicos (SERE/SEED-PR) e de funcionalidades observadas no mercado, com diretrizes de originalidade. Leitura obrigatória antes de nomear qualquer tela, campo ou fluxo novo.
- [`relatorio-tecnico-revisao-e-diferencial-competitivo.md`](./relatorio-tecnico-revisao-e-diferencial-competitivo.md) — revisão técnica completa (arquitetura, segurança, estado das funcionalidades) e análise de diferencial competitivo.
- [`passagem-2026-11-09.md`](./passagem-2026-11-09.md) — nota de passagem mais recente: Modo Rascunho depois dos testes do Romário Martins (alcance por turno/turmas, choques antes de promover, troca de professor leva as aulas, Melhorar em 120 s, Promover como único caminho) e o registro das mudanças jurídicas do site feitas pela outra conta.
- [`passagem-2026-11-05.md`](./passagem-2026-11-05.md) — nota de passagem: C. E. Iedo (6ª de quarta com 9 professores para 10 turmas cheias), diagnóstico do motor por horário e antes de calcular, como investigar pelo log do Render, Projeto de Vida 3780 no RCO, proposta em PDF no Painel Master e deploys do motor pelo navegador.
- [`passagem-2026-11-04.md`](./passagem-2026-11-04.md) — nota de passagem: regras de HA confirmadas pela dona e valendo em todo o sistema (por turno, PAEE fora, FOR conta, Híbrida, 3 seguidas, dia inteiro, 18:00, "não muda, só completa"), Melhorar com a HA encaixada, horário DOC travado, banco real conferido e deploy do motor pelo navegador.
- [`passagem-2026-11-01.md`](./passagem-2026-11-01.md) — nota de passagem: PDF em retrato, quadro Carga Horária, escola nova no PR (migração 0005), cliente da API alinhado, intervalo com a turma integral, banco de teste local e a lista de pendências atualizada.
- [`passagem-2026-10-31.md`](./passagem-2026-10-31.md) — nota de passagem: planilhas em Excel formatadas, cargo Pedagogia no banco, turma integral pelo horário real, Mário Braga pelo Urânia, Ensino Médio 2026 no catálogo, Iedo, Escola Demonstração, esquema aula por aula e o que está em aberto.
- [`passagem-2026-10-17.md`](./passagem-2026-10-17.md) — nota de passagem: Reservas (tablets por quantidade, gestor agendando por professor, cards da semana, permissões), como testar e o que está em aberto.

### Materiais da escola e comerciais (03/11/2026)
- [`manual-escola/`](./manual-escola/) — para entregar à escola: `manual-uso-escola.html` (manual de uso), `modo-rascunho.html` (passo a passo do Modo Rascunho, 06/11/2026) e `cadastro-de-escola.html` (o que a escola precisa enviar para a implantação). Os PDFs (`NexGrade-*.pdf`) saem do HTML pelo Edge (comando no topo de cada arquivo).
- [`apresentacao/`](./apresentacao/) — apresentação para escolas 2027: `slides-novos.html` (slides novos) + `base-2026-10-22.pdf`; `montar-apresentacao.py` junta os dois no PDF final. Em 09/11/2026: `NexGrade-Apresentacao.pdf` (30 slides) com o texto jurídico do site (`corrigir-base.py` refaz os slides do PDF base com frases antigas) e o slide do Modo Rascunho. Também em PowerPoint (`NexGrade-Apresentacao.pptx`, 30 slides 16:9) e em imagens (`slides/slide-01.png` a `slide-30.png`), gerados do PDF por `gerar-pptx.py`.
- [`relatorio-executivo/`](./relatorio-executivo/) — **interno**: relatório executivo com preços e projeção financeira.
- [`treinamento/`](./treinamento/) — **interno**: treinamento comercial (playbook de vendas para escolas públicas).
- [`email-marketing/`](./email-marketing/) — e-mail de divulgação para as escolas estaduais: `email-opcao-2.html` (versão escolhida, pronta para colar no Gmail/Outlook) e `email-marketing.md` (texto, assuntos e o que conferir antes de enviar). Sem preços.
- [`divulgacao-redes/`](./divulgacao-redes/) — folders para redes sociais e WhatsApp (09/11/2026): 5 peças em `folders.html` (feed 1080×1350, status 1080×1920, WhatsApp 1080×1080), PNGs gerados por `gerar-imagens.sh` e `textos-dos-posts.md` com as legendas e a mensagem do WhatsApp. Seguem a regra de texto do site (ver `passagem-2026-11-09.md`).
- [`propostas/`](./propostas/) — **interno**: propostas comerciais enviadas a escolas (HTML e PDF). O modelo atual fica no Painel Master → Simulador de proposta (`artifacts/horario-escolar/src/pages/master/proposta-pdf.ts`).

- [`../CLAUDE.md`](../CLAUDE.md) — instruções que o Claude Code carrega ao abrir o projeto (onde ler primeiro, regras de trabalho, banco, verificação e git).

## Convenção de rastreabilidade

Toda funcionalidade implementada deve ser rastreável a um ID de requisito (`RF-XXX-NN` / `RNF-XXX-NN`). Commits e PRs devem referenciar esse ID (ex. `fix(horarios): respeitar disponibilidade (RF-ALOC-04)`), seguindo o padrão já usado nos commits deste histórico.
