# NexGrade — Modelagem do Produto e Especificação de Requisitos (v1.0)

**Documento:** Visão do Produto + Requisitos Funcionais e Não Funcionais
**Status:** Base para início do desenvolvimento
**Autoria:** Simone Barros — elaborado com apoio do Claude (Anthropic)

> Este documento descreve o NexGrade a partir de suas próprias premissas de negócio e das necessidades reais de escolas do Paraná (currículo, disponibilidade docente, turnos, integração com sistemas oficiais). Cada requisito é redigido com nomenclatura, fluxo e critérios próprios do NexGrade — nenhuma seção aqui foi copiada de telas, textos ou taxonomias de terceiros. Onde um requisito decorre de exigência estadual/federal (ex. Código SAE, INEP), isso está marcado explicitamente como **origem regulatória**, por ser dado público.

---

## 1. Visão do produto

### 1.1 O que é o NexGrade

O NexGrade é uma plataforma SaaS web para gestão inteligente de horários escolares. Seu papel central é transformar a montagem de grade — hoje um processo manual, repetitivo e sujeito a erro humano — numa experiência conversacional, auditável e conectada aos sistemas oficiais do Estado, permitindo que a equipe pedagógica gaste seu tempo em decisões pedagógicas, não em tentativa e erro de planilha.

### 1.2 Público-alvo

- Escolas estaduais e municipais
- Escolas particulares
- Colégios técnicos e Institutos Federais
- Núcleos Regionais de Educação (uso agregando múltiplas escolas)

### 1.3 Princípios de design do produto

1. **Conversação em vez de configuração.** A maior parte das decisões de negócio (regras de geminação de aula, prioridades, exceções) deve ser expressável em linguagem natural para um assistente de IA, não apenas por meio de formulários e códigos técnicos.
2. **Transparência algorítmica.** Toda decisão automática do motor de otimização deve ser explicável em linguagem natural ao usuário — "por que essa aula foi colocada aqui, por que esse conflito não foi resolvido".
3. **Dado oficial como cidadão de primeira classe.** Códigos regulatórios (SAE, INEP, matriz curricular oficial) são a espinha dorsal do modelo de dados, não um anexo — isso viabiliza integração de fato, não só exportação de arquivo.
4. **Reversibilidade.** Qualquer alteração de grade deve poder ser desfeita, comparada e auditada — a grade escolar é um artefato vivo, não um documento final.
5. **Multiplataforma por padrão.** Toda função do produto deve funcionar em celular, tablet e desktop sem app nativo dedicado obrigatório.

### 1.4 Diferenciais criativos do NexGrade

| Diferencial | Descrição |
|---|---|
| **Assistente Pedagógico Conversacional** | Um assistente de IA entende comandos e perguntas em linguagem natural sobre a grade ("distribua Educação Física evitando o primeiro horário", "quais professores têm carga incompleta?", "por que a turma 8MA tem uma janela na quarta?") e executa ou responde diretamente, com explicação do racional. |
| **Parser de Importação Universal** | Upload de PDF, Excel ou CSV de qualquer layout de horário/matriz já existente na escola é interpretado automaticamente, extraindo professores, turmas, disciplinas e disponibilidades sem digitação manual, com um passo de conferência guiado antes de confirmar a importação. |
| **Vínculo nativo ao Código SAE** | Disciplinas são cadastradas já vinculadas ao código oficial (SAE) e à matriz curricular do curso, eliminando divergência entre o que a escola usa internamente e o que precisa ser reportado oficialmente. |
| **Motor de Otimização Explicável** | O solver não apenas gera a grade: para cada decisão relevante (conflito não resolvido, janela criada, aula não geminada), oferece uma explicação em linguagem natural e sugestões de ajuste. |
| **Simulação de Cenários (A/B de grade)** | Permite gerar múltiplas versões candidatas da grade, compará-las lado a lado por métricas (janelas totais, geminações atendidas, conflitos) e publicar a escolhida. |
| **Histórico e Reversão de Grade** | Toda publicação de grade gera uma versão imutável; é possível comparar duas versões e reverter com um clique. |
| **Painel Gerencial em Tempo Real** | Métricas prontas — aulas não distribuídas, professores sobrecarregados/ociosos, ocupação de salas por turno, conflitos pendentes — sem precisar navegar por telas de cadastro para descobrir isso. |
| **Gestão de Substituição Assistida** | Ao registrar a ausência de um professor, o sistema sugere automaticamente substitutos compatíveis por disponibilidade e disciplina. |
| **Colaboração Multiusuário em Tempo Real** | Mais de um usuário pode editar partes distintas da grade simultaneamente, com registro de quem alterou o quê. |
| **Ponte Inteligente com Sistemas Oficiais** | Leitura automática do arquivo de matriz curricular exportado do sistema estadual e geração automática do arquivo de grade no formato aceito por ele de volta — reduzindo o trabalho da equipe pedagógica à conferência e a dois uploads, em vez de redigitação manual. Não se trata de uma integração automática em tempo real (o sistema estadual não oferece esse canal a terceiros), e sim de eliminar a parte manual mais cara do processo. |
| **App do Professor** | Cada docente acessa sua própria grade, recebe notificação de alterações e substituições, sem precisar de acesso ao sistema administrativo completo. |

Nenhum desses diferenciais depende de replicar a forma de qualquer outro produto do mercado — cada um resolve uma necessidade observada nas próprias conversas com escolas (equipe pedagógica sobrecarregada, retrabalho manual, falta de visibilidade gerencial, dificuldade de comunicar mudanças de horário aos professores).

---

## 2. Modelo de domínio (visão de alto nível)

Entidades centrais e como se relacionam (linguagem própria, independente de qualquer schema de terceiros):

```
Escola (1) ──< Turno (N)
Escola (1) ──< Usuario (N) [papéis: Master, Gestor Escolar, Coordenador, Professor]
Turno  (1) ──< Turma (N)
Curso  (1) ──< MatrizCurricular (N, por série) ──< ItemMatriz (N) ──> Disciplina
Turma  (N) ──> Curso (1)
Professor (1) ──< Disponibilidade (N, por dia/slot)
Professor (1) ──< VinculoDisciplina (N) ──> Disciplina
Turma (1) ──< AlocacaoGrade (N) ──> Professor, Disciplina, Sala, Slot
VersaoGrade (1) ──< AlocacaoGrade (N)  [snapshot imutável]
CenarioSimulado (1) ──< AlocacaoGrade (N) [rascunho não publicado]
Ausencia (1) ──> Professor, Data ──< SugestaoSubstituicao (N)
JobOtimizacao (1) ──> VersaoGrade | CenarioSimulado
LogAuditoria (N) ──> Usuario, Entidade, AcaoRealizada
```

Este modelo é mais rico que o schema mínimo do MVP atual (`escolas`, `professores`, `disponibilidade`, `alocacoes`) — a seção 4 abaixo prioriza o que entra em cada fase.

---

## 3. Requisitos Funcionais (RF)

Convenção: cada requisito tem **ID**, **descrição**, **prioridade** (P0 = MVP, P1 = segunda fase, P2 = visão de produto/futuro) e, quando útil, um critério de aceite objetivo.

### 3.1 Autenticação, contas e multi-tenant (RF-AUTH)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-AUTH-01 | O sistema deve permitir login por e-mail/senha com verificação de e-mail. | P0 |
| RF-AUTH-02 | O sistema deve suportar múltiplos papéis de usuário: Master (Anthropic/dono da plataforma), Gestor Escolar, Coordenador Pedagógico, Professor. | P0 |
| RF-AUTH-03 | Todo dado (professores, turmas, alocações) deve ser isolado por `escola_id` — nenhum usuário de uma escola pode ler/escrever dados de outra. | P0 |
| RF-AUTH-04 | O sistema deve permitir múltiplos usuários vinculados à mesma escola com papéis diferentes. | P0 |
| RF-AUTH-05 | O sistema deve suportar recuperação de senha por e-mail. | P0 |
| RF-AUTH-06 | O sistema deve suportar autenticação de dois fatores opcional para papéis administrativos. | P1 |
| RF-AUTH-07 | O sistema deve permitir login social (Google) para reduzir fricção de adoção por professores. | P2 |

### 3.2 Cadastro de Escola e Turnos (RF-ESC)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-ESC-01 | Cadastrar escola com nome, código INEP (origem regulatória — identificador público), endereço, rede (estadual/municipal/particular/federal). | P0 |
| RF-ESC-02 | Cadastrar um ou mais turnos por escola, cada um com: nome, dias letivos da semana, quantidade de aulas por dia e horário de início de cada período. | P0 |
| RF-ESC-03 | Permitir configurar, por turno, os parâmetros padrão de otimização (ver RF-SOLV) que se aplicam a novas turmas/professores daquele turno. | P1 |
| RF-ESC-04 | Suportar múltiplas unidades/campi sob uma mesma conta de rede municipal/estadual. | P2 |

### 3.3 Cursos e Matriz Curricular (RF-CUR)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-CUR-01 | Cadastrar curso com nome, código de curso e nível (Fundamental, Médio, Técnico, Normal/Magistério). | P0 |
| RF-CUR-02 | Para cada curso, cadastrar a matriz curricular por série/ano: lista de disciplinas com carga horária semanal, categoria curricular (base comum, parte diversificada, itinerário formativo, etc. — nomenclatura própria do NexGrade) e indicativo de obrigatoriedade. | P0 |
| RF-CUR-03 | Suportar "grupos de disciplina" onde o aluno/turma escolhe uma opção entre várias (ex. língua estrangeira), com marcação de opção padrão. | P1 |
| RF-CUR-04 | Importar matriz curricular oficial a partir do **arquivo/relatório exportado manualmente pela escola** do sistema estadual de registro escolar (origem regulatória — não há API pública para essa troca; ver nota em 3.12), populando curso, série, disciplinas e cargas automaticamente (ver RF-PARSE). | P1 |
| RF-CUR-05 | Validar que a soma das cargas horárias semanais da matriz bate com a carga horária total declarada da série. | P0 |

### 3.4 Disciplinas (RF-DISC)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-DISC-01 | Cadastrar disciplina com nome, nome abreviado (para exibição em grade compacta) e, quando aplicável, código oficial (SAE — origem regulatória). | P0 |
| RF-DISC-02 | Impedir duplicidade de disciplina com o mesmo código oficial dentro da mesma escola. | P0 |
| RF-DISC-03 | Permitir editar o nome abreviado sem afetar o vínculo com o código oficial. | P1 |

### 3.5 Professores (RF-PROF)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-PROF-01 | Cadastrar professor com nome completo, CPF, e-mail, matrícula, carga horária semanal contratada. | P0 |
| RF-PROF-02 | Vincular um ou mais disciplinas que o professor está habilitado a lecionar. | P0 |
| RF-PROF-03 | Impedir salvar professor sem ao menos uma disciplina vinculada. | P0 |
| RF-PROF-04 | Registrar, para cada professor, sua grade de disponibilidade semanal com três estados possíveis por período: **disponível para aula**, **hora-atividade fixa**, **indisponível**. | P0 |
| RF-PROF-05 | Validar que a soma de aulas alocadas a um professor não ultrapasse sua carga horária contratada. | P0 |
| RF-PROF-06 | Permitir definir, por professor, parâmetros de otimização próprios (ver RF-SOLV) além dos padrões do turno. | P1 |
| RF-PROF-07 | Suportar professores com carga horária reduzida/parcial (ex. afastamento, contrato parcial) sem quebrar as validações de carga. | P1 |
| RF-PROF-08 | Manter histórico de alterações de carga horária e disponibilidade (quem alterou, quando, valor anterior). | P0 |

### 3.6 Turmas (RF-TUR)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-TUR-01 | Cadastrar turma vinculada a um turno e a um curso/série da matriz curricular. | P0 |
| RF-TUR-02 | Gerar automaticamente, a partir da matriz curricular vinculada, a expectativa de carga horária semanal por disciplina daquela turma (o que deve ser alocado). | P0 |
| RF-TUR-03 | Permitir ajuste manual pontual da carga horária de uma disciplina numa turma específica, com registro do motivo. | P1 |
| RF-TUR-04 | Suportar turmas "híbridas"/compartilhadas entre séries para disciplinas eletivas ou itinerário formativo, sem duplicar o cadastro de aluno/turma. | P1 |

### 3.7 Salas e Recursos (RF-SALA)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-SALA-01 | Cadastrar salas/recursos (laboratório, quadra, sala de informática) com capacidade e tipo. | P1 |
| RF-SALA-02 | Vincular disciplinas práticas a tipos de sala obrigatórios (ex. aula prática de Química exige laboratório). | P1 |
| RF-SALA-03 | O motor de otimização deve impedir dois agendamentos simultâneos na mesma sala. | P1 |

### 3.8 Disponibilidade (RF-DISP)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-DISP-01 | Interface de grade semanal (dia × período) para marcar disponibilidade do professor, com os três estados definidos em RF-PROF-04. | P0 |
| RF-DISP-02 | Permitir edição em lote (ex. marcar todo um dia como indisponível de uma vez). | P1 |
| RF-DISP-03 | Alertar (não bloquear) quando a disponibilidade marcada for insuficiente para cobrir a carga horária contratada do professor. | P1 |

### 3.9 Alocação / Grade (RF-ALOC)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-ALOC-01 | Representar uma alocação como a associação de professor + turma + disciplina + sala (opcional) + período + dia da semana, dentro de uma versão de grade. | P0 |
| RF-ALOC-02 | Impedir duas alocações do mesmo professor no mesmo período/dia (conflito de professor). | P0 |
| RF-ALOC-03 | Impedir duas alocações na mesma turma no mesmo período/dia (conflito de turma). | P0 |
| RF-ALOC-04 | Impedir alocação de professor em período marcado como indisponível ou hora-atividade fixa. | P0 |
| RF-ALOC-05 | Permitir marcar uma alocação como "fixa" (não pode ser alterada pelo motor de otimização) com visualização clara na interface. | P1 |
| RF-ALOC-06 | Permitir edição manual de alocação por arrastar-e-soltar, respeitando as validações de conflito em tempo real. | P1 |
| RF-ALOC-07 | Registrar toda alocação sob uma "versão de grade" identificável e imutável após publicação. | P0 |

### 3.10 Motor de Otimização / Solver (RF-SOLV)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-SOLV-01 | Gerar automaticamente uma proposta de grade completa a partir de professores, turmas, disciplinas, disponibilidades e matriz curricular cadastrados. | P0 |
| RF-SOLV-02 | Garantir como restrição obrigatória (rígida): zero conflito de professor, zero conflito de turma, zero conflito de sala, respeito à disponibilidade declarada. | P0 |
| RF-SOLV-03 | Garantir como restrição obrigatória: disciplinas práticas somente em salas do tipo exigido. | P1 |
| RF-SOLV-04 | Suportar restrições configuráveis (não obrigatórias) de otimização: minimizar janelas ociosas do professor, respeitar preferência de agrupamento de aulas consecutivas por professor/turma (modelo próprio — ver seção 1.10 do documento de análise de mercado, não a taxonomia de terceiros), priorizar aulas duplas quando definido pela matriz curricular. | P0 |
| RF-SOLV-05 | Processar a geração de grade de forma assíncrona (fila de jobs), com acompanhamento de progresso visível ao usuário. | P0 |
| RF-SOLV-06 | Para cada execução, apresentar um relatório de resultado: percentual de aulas alocadas, conflitos não resolvidos (se houver), janelas geradas por professor, restrições não atendidas. | P0 |
| RF-SOLV-07 | Explicar em linguagem natural, para cada restrição não atendida, o motivo provável (ex. "não foi possível encaixar 2 aulas de Educação Física para a turma 9MA porque o único horário livre do professor coincide com outra aula já fixa"). | P1 |
| RF-SOLV-08 | Permitir reexecutar a otimização apenas sobre a parte não travada da grade (mantendo alocações fixas). | P1 |
| RF-SOLV-09 | Suportar execução incremental ao adicionar/remover um único professor ou turma, sem precisar refazer a grade inteira. | P2 |

### 3.11 Assistente de IA Conversacional (RF-IA)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-IA-01 | Permitir ao usuário digitar uma instrução em linguagem natural referente à grade (ex. "professor Carlos não pode dar aula na sexta-feira") e ter essa instrução convertida em uma alteração de disponibilidade/restrição real no sistema. | P1 |
| RF-IA-02 | Permitir perguntas de consulta em linguagem natural sobre o estado da grade (ex. "quais professores ainda têm carga incompleta?", "quais turmas têm aulas não distribuídas?"). | P1 |
| RF-IA-03 | Toda ação executada pelo assistente deve ser confirmada explicitamente pelo usuário antes de persistir, e deve gerar um registro de auditoria como qualquer outra alteração manual. | P0 (regra de segurança, vale desde que RF-IA-01 exista) |
| RF-IA-04 | O assistente deve responder com explicação do impacto pedagógico da mudança solicitada antes/depois de aplicá-la. | P1 |
| RF-IA-05 | O assistente deve reconhecer ambiguidade (ex. mais de um "Carlos" cadastrado) e pedir esclarecimento em vez de adivinhar. | P1 |

### 3.12 Parser de Importação Inteligente (RF-PARSE)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-PARSE-01 | Aceitar upload de arquivo PDF, Excel (.xlsx) ou CSV contendo horário, matriz curricular ou cadastro de professores já existente na escola. | P1 |
| RF-PARSE-02 | Identificar automaticamente professores, turmas, disciplinas e horários a partir do conteúdo do arquivo, independentemente do layout específico do arquivo de origem. | P1 |
| RF-PARSE-03 | Apresentar uma tela de conferência mostrando o que foi extraído, com possibilidade de correção manual, antes de confirmar a importação definitiva. | P1 |
| RF-PARSE-04 | Detectar e reportar dados ambíguos ou inconsistentes durante a extração (ex. dois professores com nomes muito parecidos, carga horária que não fecha). | P1 |
| RF-PARSE-05 | Suportar leitura do arquivo de exportação de matriz curricular do sistema estadual de registro escolar (origem regulatória, formato público), obtido manualmente pela escola — ver nota abaixo sobre ausência de API. | P2 |
| RF-PARSE-06 | Manter log de toda importação (arquivo original, data, usuário, quantidade de registros criados/atualizados). | P1 |
| RF-PARSE-07 | Registrar formalmente, junto ao canal oficial de atendimento aos Sistemas da SEED-PR, uma solicitação de avaliação de acesso a webservice/API para fornecedores homologados de sistemas de gestão escolar, documentando data do pedido, protocolo e resposta obtida — independentemente do resultado, mantendo isso como registro de que a via de integração buscada foi sempre a oficial e não a engenharia reversa. | P2 |

> **Nota confirmada sobre integração com RCO/SERE (SEED-PR):** não existe API pública documentada para troca automática de dados entre sistemas de terceiros e o RCO/SERE. A única via de integração hoje é a **troca manual de arquivo**: a escola exporta um relatório/arquivo do sistema oficial e faz upload no NexGrade (RF-PARSE-05), e o NexGrade gera um arquivo no formato aceito pelo sistema oficial para a escola fazer upload manual de volta (RF-REL-04). O NexGrade **não deve anunciar isso como "integração automática em tempo real"** — o ganho real é eliminar a redigitação manual dos dados, não eliminar o passo humano de transportar o arquivo entre os dois sistemas. Caso a SEED-PR abra futuramente um canal programático (API/webservice) para fornecedores homologados, o caminho formal é solicitar acesso pelo canal oficial de atendimento aos Sistemas da SEED — não construir integração por engenharia reversa.

### 3.13 Relatórios e Exportação (RF-REL)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-REL-01 | Gerar relatório de grade por professor (visualização e impressão/PDF). | P0 |
| RF-REL-02 | Gerar relatório de grade por turma (visualização e impressão/PDF). | P0 |
| RF-REL-03 | Permitir configurar quais detalhes aparecem no relatório (horário de início, disciplina abreviada, hora-atividade, sala). | P1 |
| RF-REL-04 | Gerar, com um único clique, um **arquivo** no formato aceito pelo sistema oficial de registro de classe (origem regulatória) para a escola importar manualmente naquele sistema — não é uma integração automática em tempo real (ver nota em 3.12). | P1 |
| RF-REL-05 | Gerar relatório gerencial consolidado: aulas não distribuídas, professores com carga incompleta/excedente, ocupação de salas por turno. | P1 |
| RF-REL-06 | Exportar dados em planilha (CSV/XLSX) para uso externo. | P1 |

### 3.14 Painel Master SaaS (RF-MASTER)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-MASTER-01 | Cadastro e ativação/cancelamento de escolas assinantes. | P1 |
| RF-MASTER-02 | Gestão de planos de assinatura e cobrança. | P1 |
| RF-MASTER-03 | Painel de métricas de uso da plataforma (escolas ativas, jobs de otimização processados, volume de importações). | P2 |
| RF-MASTER-04 | Triagem e acompanhamento de tickets de suporte técnico por escola. | P2 |
| RF-MASTER-05 | Controle de atualizações/changelog visível às escolas. | P2 |

### 3.15 Gestão de Substituição (RF-SUBST)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-SUBST-01 | Registrar ausência de um professor em uma data específica. | P1 |
| RF-SUBST-02 | Sugerir automaticamente professores substitutos compatíveis (mesma disciplina ou habilitação, disponibilidade livre naquele horário). | P2 |
| RF-SUBST-03 | Registrar a substituição efetivada, mantendo rastreabilidade de quem cobriu a aula. | P2 |

### 3.16 Simulação de Cenários (RF-SIM)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-SIM-01 | Permitir criar múltiplos cenários de grade não publicados a partir dos mesmos dados de entrada. | P2 |
| RF-SIM-02 | Comparar dois cenários lado a lado por métricas objetivas (janelas totais, restrições atendidas, conflitos). | P2 |
| RF-SIM-03 | Publicar um cenário como versão oficial da grade, descartando ou arquivando os demais. | P2 |

### 3.17 Histórico e Versionamento (RF-HIST)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-HIST-01 | Toda publicação de grade gera uma versão numerada e imutável. | P1 |
| RF-HIST-02 | Permitir visualizar e comparar duas versões publicadas (diferença de alocações). | P2 |
| RF-HIST-03 | Permitir reverter para uma versão anterior, gerando uma nova versão (nunca sobrescrevendo o histórico). | P2 |

### 3.18 Colaboração (RF-COLAB)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-COLAB-01 | Suportar mais de um usuário editando simultaneamente diferentes partes da grade, com indicação de quem está editando o quê. | P2 |
| RF-COLAB-02 | Registrar comentários vinculados a uma alocação ou turma específica. | P2 |

### 3.19 Aplicativo/Área do Professor (RF-APPPROF)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-APPPROF-01 | Professor autenticado visualiza apenas sua própria grade. | P1 |
| RF-APPPROF-02 | Professor recebe notificação (e-mail/push) quando sua grade é alterada. | P2 |
| RF-APPPROF-03 | Professor pode consultar sala e disciplina de cada aula do seu horário. | P1 |

### 3.20 Dashboard Gerencial (RF-DASH)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-DASH-01 | Exibir, na tela inicial do Gestor/Coordenador, indicadores-chave: % de aulas distribuídas, conflitos pendentes, professores com carga incompleta. | P1 |
| RF-DASH-02 | Permitir filtrar indicadores por turno e por curso. | P2 |

### 3.21 Auditoria e Logs (RF-AUD)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-AUD-01 | Registrar usuário, data/hora, ação e dado anterior para toda criação, alteração ou exclusão de professor, turma, disciplina ou alocação. | P0 |
| RF-AUD-02 | Tornar o log de auditoria consultável pelo Gestor Escolar (filtrável por entidade, usuário e período). | P1 |

---

## 4. Requisitos Não Funcionais (RNF)

| ID | Categoria | Requisito |
|---|---|---|
| RNF-PERF-01 | Performance | Telas de cadastro e consulta devem responder em até 2 segundos sob carga normal (até 200 usuários simultâneos por escola). |
| RNF-PERF-02 | Performance | A geração de grade (Solver) deve ser assíncrona; escolas de até 100 professores e 40 turmas devem receber o resultado em até 5 minutos. |
| RNF-ESCAL-01 | Escalabilidade | A arquitetura deve suportar crescimento horizontal do backend e do worker de otimização de forma independente. |
| RNF-ESCAL-02 | Escalabilidade | O banco de dados deve suportar particionamento lógico por escola (multi-tenant) sem degradação perceptível com o crescimento do número de escolas. |
| RNF-SEG-01 | Segurança | Toda comunicação cliente-servidor deve ser criptografada (HTTPS/TLS). |
| RNF-SEG-02 | Segurança | Senhas devem ser armazenadas com hash forte e salt (nunca em texto plano). |
| RNF-SEG-03 | Segurança | Controle de acesso deve ser validado no backend em toda requisição, não apenas ocultado na interface. |
| RNF-SEG-04 | Segurança | Dados de uma escola nunca devem ser acessíveis por usuários de outra escola, nem por engano em consultas mal filtradas (testes automatizados de isolamento multi-tenant). |
| RNF-LGPD-01 | Privacidade | Dados pessoais de professores e alunos devem ser tratados conforme a LGPD: finalidade declarada, minimização de dados, direito de exclusão/portabilidade. |
| RNF-LGPD-02 | Privacidade | O sistema deve permitir anonimizar ou excluir dados de um professor que deixou a escola, mantendo a integridade do histórico de grades já publicadas. |
| RNF-DISP-01 | Disponibilidade | A plataforma deve ter meta de disponibilidade de 99,5% em horário comercial. |
| RNF-DISP-02 | Disponibilidade | Falha no worker de otimização não deve derrubar o restante da aplicação (isolamento de falhas). |
| RNF-BACKUP-01 | Continuidade | Backup diário automatizado do banco de dados, com retenção mínima de 30 dias. |
| RNF-BACKUP-02 | Continuidade | Procedimento de restauração testado periodicamente (não apenas backup gerado, mas restauração validada). |
| RNF-USA-01 | Usabilidade | Qualquer fluxo de cadastro essencial (professor, turma, disciplina) deve ser completável em no máximo 5 passos/telas. |
| RNF-USA-02 | Usabilidade | A interface deve ser responsiva e utilizável em celular, tablet e desktop sem funcionalidade essencial perdida. |
| RNF-USA-03 | Usabilidade | Mensagens de erro devem ser específicas e acionáveis (nunca apenas "erro genérico"). |
| RNF-ACESS-01 | Acessibilidade | Interface deve atender contraste mínimo AA (WCAG 2.1) e navegação por teclado nas telas principais. |
| RNF-MANUT-01 | Manutenibilidade | Código organizado em módulos com fronteiras claras por domínio (escolas, professores, disponibilidade, alocações, solver), permitindo evolução independente. |
| RNF-MANUT-02 | Manutenibilidade | Cobertura de testes automatizados mínima para regras de negócio críticas (validação de conflito, carga horária, isolamento multi-tenant). |
| RNF-OBS-01 | Observabilidade | Logging estruturado e métricas de erro/latência para todos os serviços (API, worker de otimização, parser). |
| RNF-OBS-02 | Observabilidade | Alertas automáticos para falhas recorrentes no processamento de jobs de otimização ou importação. |
| RNF-INTEG-01 | Integração | Integrações com sistemas oficiais devem usar exclusivamente formatos/arquivos de exportação públicos e documentados, nunca engenharia reversa de sistemas de terceiros. |
| RNF-ORIG-01 | Originalidade/Proveniência | Toda nomenclatura de tela, texto de interface, taxonomia de configuração e esquema de codificação do NexGrade deve ser desenhada de forma própria — nenhuma reprodução de nomes, textos ou taxonomias criativas de produtos de terceiros observados durante a pesquisa de mercado. |
| RNF-ORIG-02 | Originalidade/Proveniência | Cada decisão de modelagem relevante deve ser rastreável a uma destas origens: exigência regulatória (dado público), necessidade funcional evidente do domínio, ou inovação própria do NexGrade — documentado no changelog de arquitetura. |
| RNF-LOC-01 | Localização | Interface e mensagens em português do Brasil como padrão; arquitetura preparada para internacionalização futura sem reescrita. |
| RNF-DOC-01 | Documentação | Toda API deve ter especificação atualizada (OpenAPI/Swagger) publicada para uso interno e eventual integração de terceiros autorizados. |

---

## 5. Priorização sugerida (visão de fases)

| Fase | Escopo | Requisitos principais |
|---|---|---|
| **MVP (Fase 1)** | Cadastro completo do domínio + geração básica de grade sem conflito | RF-AUTH-01 a 05, RF-ESC-01/02, RF-CUR-01/02/05, RF-DISC-01/02, RF-PROF-01 a 05/08, RF-TUR-01/02, RF-DISP-01, RF-ALOC-01 a 04/07, RF-SOLV-01/02/05/06, RF-REL-01/02, RF-AUD-01, todos os RNF-SEG, RNF-LGPD, RNF-BACKUP |
| **Fase 2 — Diferenciação** | Otimização avançada + parser + relatórios ricos | RF-SOLV-03/04/07/08, RF-PARSE-01 a 04/06, RF-REL-03 a 06, RF-DISP-02/03, RF-ALOC-05/06, RF-HIST-01, RF-APPPROF-01/03, RF-DASH-01, RF-AUD-02 |
| **Fase 3 — Inteligência e Escala** | IA conversacional + SaaS multi-escola + colaboração | RF-IA (todos), RF-MASTER (todos), RF-SUBST (todos), RF-SIM (todos), RF-HIST-02/03, RF-COLAB (todos), RF-APPPROF-02, RF-DASH-02, RF-PARSE-07, RNF-ESCAL-02 |

---

## 6. Nota de encerramento sobre originalidade

Este documento foi elaborado a partir de: (a) premissas de negócio definidas pela própria fundadora do projeto; (b) necessidades funcionais evidentes de qualquer sistema de gestão de horário escolar (conflito de professor, carga horária, disponibilidade); (c) dados e estruturas públicas do sistema educacional do Paraná (Código SAE, Código INEP, matriz curricular oficial). Nenhum nome de tela, texto de interface, taxonomia de configuração ou fluxo específico foi copiado de qualquer produto de terceiros observado durante a fase de pesquisa. Recomenda-se manter esta prática — e este documento como registro de proveniência — ao longo de todo o desenvolvimento, e submeter o produto final à revisão de um advogado especializado em propriedade intelectual de software antes do lançamento comercial.

*(Não sou advogado; esta seção não constitui aconselhamento jurídico, apenas registro de boas práticas de engenharia adotadas no projeto.)*
