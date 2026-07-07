# Análise de Formatos de Dados Reais — C.E. Prof. Mário B. Teixeira Braga

Documento de referência a partir de material enviado (capturas do **URÂNIN UP**, telas do **SERE/SEED-PR**, PDFs de horário exportados e notas de planejamento do projeto). Objetivo: registrar como esses sistemas modelam dados e funcionalidades — para servir de base ao desenho do NexGrade — **sem copiar nada do concorrente**, apenas entendendo o problema que ele resolve.

---

## 0. Aviso legal e diretrizes de originalidade (leia antes de usar este documento)

> **Não sou advogado, e isto não é aconselhamento jurídico.** O que segue são diretrizes práticas de engenharia de software para reduzir risco de disputa por direito autoral/concorrência desleal. Antes do lançamento comercial do NexGrade, vale ter um advogado especializado em propriedade intelectual/software revisando o produto final — o custo disso é baixo perto do risco de uma notificação extrajudicial ou processo depois que o produto já estiver no ar.

### 0.1 O que a lei de direito autoral de software tipicamente protege — e o que não protege

No Brasil (Lei 9.610/98 e Lei 9.609/98 — Lei do Software), como na maioria das jurisdições, direito autoral de software protege a **expressão** de uma ideia, não a ideia em si. Na prática, isso costuma significar:

| Provavelmente **protegido** (evitar copiar) | Tipicamente **não protegido** (livre para usar) |
|---|---|
| Código-fonte literal | A ideia de "montar horário escolar automaticamente" |
| Texto exato de telas, mensagens de erro, nomes de menus específicos e criativos | Conceitos funcionais genéricos: professor, turma, disciplina, disponibilidade, hora-atividade |
| Layout visual distintivo, paleta de cores, logotipo, identidade visual | O fato de existirem esses campos/conceitos (qualquer sistema do gênero precisa deles) |
| Esquemas de codificação criativos e arbitrários do fornecedor (ex. a enumeração de letras "TIPO A"–"TIPO $" do URÂNIN UP, que é uma taxonomia proprietária específica) | Códigos oficiais do governo (SAE, INEP, Composição Curricular BNC/FGB/IFA/IFP/PD etc.) — são dados públicos da SEED-PR, não do URÂNIN UP |
| Estrutura exata de relatório/impressão (arranjo específico de campos, textos gerados automaticamente) | O requisito funcional de "gerar um relatório de horário por professor" |
| Nomes de banco de dados/tabelas se forem suficientemente criativos e extensos (baixo risco, mas evitável) | Estruturas de dados genéricas e dispensáveis de qualquer forma (ex. tabela professor com nome/cpf/carga horária) |

A doutrina de **merger** (quando só existe uma forma razoável de expressar uma função) e a de **scènes à faire** (elementos padrão do gênero, ex. "tela de cadastro de professor com grade de disponibilidade") reduzem ainda mais o que é protegível num sistema de gestão escolar — mas isso não é uma licença para copiar; é um motivo para que, ao reimplementar a mesma função, o time **desenhe sua própria expressão** (textos, nomes, taxonomias, layout) do zero.

### 0.2 Regra prática adotada neste documento e no projeto

1. **Fonte pública/governamental (SERE, SEED-PR, INEP, RCO)** → dados e códigos oficiais (SAE, INEP, Composição Curricular) podem ser usados livremente — são parte do sistema educacional público do Paraná, não propriedade do URÂNIN UP.
2. **Comportamento/função observada no URÂNIN UP** (ex.: "existe um conceito de hora-atividade fixa", "existe geração de relatório por turma ou por professor") → tratamos como **requisito funcional**, documentado em linguagem própria, sem reaproveitar nomes de tela, textos de botão, mensagens ou esquemas de codificação do concorrente.
3. **Nomenclatura e taxonomias proprietárias e específicas do URÂNIN UP** (ex.: a lista "TIPO A" a "TIPO $" para geminação de aulas, os nomes exatos dos menus "Situação do Horário", "Exibir Profs", os textos de frase gerados em "Controle - Fixar aulas") → **não reproduzir no produto final**. O NexGrade deve resolver o mesmo problema com sua própria taxonomia, nomenclatura e frases.
4. **Nenhuma engenharia reversa de código, banco de dados interno ou arquivos proprietários do URÂNIN UP foi feita** — toda a análise aqui vem de capturas de tela que a própria usuária (cliente do URÂNIN UP) tirou de sua própria conta, mais dados públicos do SERE. Isso é uma diferença relevante: estamos olhando "o que o produto faz", como qualquer comprador/avaliador de mercado poderia observar, não "como ele foi construído por dentro".
5. Quando o NexGrade for de fato especificado e implementado, cada requisito deve idealmente citar sua origem: **(a) exigência legal/curricular do Estado** (mais seguro), **(b) prática comum do setor / necessidade funcional óbvia** (seguro), ou **(c) inspirado numa função observada em concorrente, mas reexpressa com nomenclatura própria** (aceitável, desde que a reexpressão seja de fato original). Isso cria um rastro de decisão útil se um dia a originalidade do NexGrade for questionada.
6. Bom sinal adicional de originalidade: o PRD/SRS do NexGrade já aponta diferenciais que o URÂNIN UP não tem (assistente de IA conversacional, parser inteligente multi-formato, integração de um clique, painel gerencial, app do professor, simulações de cenário) — isso reforça que o produto está sendo desenhado para resolver o problema de forma diferente, não para clonar a solução existente.

---

## 1. URÂNIN UP — sistema de referência (concorrente) usado hoje pela escola

O URÂNIN UP é o software que a escola usa atualmente para montar a grade horária. As capturas mostram as seguintes áreas do sistema.

### 1.1 Cadastro - Básico (configuração do turno)

Cada **turno** da escola é tratado como um cadastro/projeto **separado** — o título da janela mostra isso: `C.E. PROF. MÁRIO B. TEIXEIRA BRAGA - MANHÃ (001 Exp)`. Manhã, Tarde e Noite não são "abas" da mesma base, são instâncias distintas, cada uma com:

| Campo | Exemplo observado | Observação |
|---|---|---|
| Nome do estabelecimento + turno | `C.E. PROF. MÁRIO B. TEIXEIRA BRAGA - MANHÃ` | Nome e turno concatenados num único texto |
| Número de dias com aula | `5 (De Segunda a Sexta-feira)` | |
| Número de aulas por dia | `06 aulas` | Quantidade de períodos/slots por dia |
| Horário das aulas | `01º 07:30 / 02º 08:20 / 03º 09:25 / 04º 10:15 / 05º 11:05 / 06º 11:55` | **Cada turno tem sua própria grade de horários de início** — confirmado nos PDFs: Manhã começa 07:30, Tarde 13:05, Noite 18:00 |

Além disso, um bloco de **parâmetros de montagem de horário** (não são dados cadastrais, são configuração do algoritmo): se todas as turmas começam no mesmo horário, comportamento quando o professor tem duas aulas no dia com a mesma turma, comportamento quando um professor leciona duas disciplinas na mesma turma, se professores podem dar muitas aulas por dia, preferência por aulas seguidas, e como funcionam trilhas de aprofundamento.

**Relevância funcional (não copiar a forma, só a necessidade):** confirma que o "Motor Otimizador" do NexGrade precisa de parâmetros de otimização configuráveis por turno/escola, não regras fixas no código — isso é um requisito funcional legítimo e de senso comum em qualquer sistema de scheduling, não uma criação exclusiva do concorrente.

### 1.2 Cadastro - Grade Curricular

Tela de matriz **turma × disciplina** em formato de planilha: linhas = lista de disciplinas (cadastradas livremente pela escola, ver 1.4), colunas = cada turma da unidade (`8MA`...`9MF`, `1MA EM`, `2MA ADM` etc.), células = número de aulas semanais daquela disciplina naquela turma, com total por turma na base (ex. `25` para turmas de Fundamental, `30` para turmas de Médio).

**Observação funcional:** isso é o equivalente, dentro do URÂNIN UP, à Matriz Curricular oficial do SERE (seção 2) — mas preenchido manualmente pela escola numa grade própria do sistema, não vinculado automaticamente ao Código SAE. Existe inclusive um item de menu "Importar dados da SEED-PR" (ver 1.6) que sugere a possibilidade de puxar isso automaticamente — algo que o NexGrade, com seu parser de importação, pode fazer de forma mais direta como diferencial.

### 1.3 Cadastro - Disciplinas

Lista simples de nomes de disciplinas cadastradas pela escola (texto livre, sem código oficial vinculado — ex. `ADM FINANC E ORÇAMENTÁRIA`, `ANÁLISE E MET P SISTEMAS`, `BIOSSEGURANÇA E SEG TRAB`), com opção de criar nova disciplina.

**Observação:** confirma que, no URÂNIN UP, "disciplina" é uma entidade **desacoplada** do Código SAE oficial do SERE — cada escola nomeia como quiser. Isso é uma decisão de design que o NexGrade pode ou não repetir; sugerimos considerar vincular nativamente ao Código SAE desde o início (diferencial de integração), mas isso é uma decisão de arquitetura nossa, não algo "copiado".

### 1.4 Cadastro - Professores (disponibilidade e regras)

| Campo | Exemplo | Observação |
|---|---|---|
| Nome | `SIMONE` | Só primeiro nome |
| "Tipo" (código de geminação) | `G` | Ver seção 1.7 — regra de como agrupar aulas consecutivas |
| Aulas semanais | `16` | Carga horária semanal deste professor neste turno |
| Hora-atividade | `06` | Quantidade de períodos de hora-atividade na semana |
| Preferência de minimizar janelas | `É bom` | Parâmetro de otimização |
| Grade de disponibilidade | `Hor × Seg–Sex`, célula = `Aula` / `HA` / `---` | Disponibilidade e hora-atividade fixa editadas na mesma grade |

**Observação funcional:** confirma 3 estados de disponibilidade (disponível para aula / hora-atividade fixa / indisponível), não 2 — requisito de negócio real, não elemento de expressão criativa do concorrente.

### 1.5 Controle - Fixar aulas

Lista de alocações fixas (aulas que não podem ser remanejadas pelo Solver), exibidas como frases geradas automaticamente, ex.: *"[Professor] terá aula com a [Turma]([Disciplina]) no [Nº]° horário de [Dia da Semana]"*.

**Observação:** o requisito funcional — permitir fixar manualmente certas alocações antes de rodar o otimizador — é genérico e necessário em qualquer solver de horário escolar. **A frase-modelo específica usada para exibir isso é do URÂNIN UP**; o NexGrade deve ter sua própria redação para essa mesma função (ex. uma UI mais visual em vez de frases geradas, ou um texto redigido de forma diferente).

### 1.6 Menu Geral / Integração

O menu principal expõe, entre outras opções: Importar Dados, Exportar Horário, Exportar Vários Horários, Exportar Ponto, integração "Urania+", **Importar dados da SEED-PR**, e **Exportar Horário para RCO**.

**Observação relevante para o PRD:** os nomes **SEED-PR** e **RCO** são os sistemas oficiais do governo do Paraná — não pertencem ao URÂNIN UP. O fato de o concorrente já ter esse tipo de integração **confirma que é uma demanda real do mercado** (o PRD do NexGrade já previa isso, de forma independente, como "Integração Nativa RCO/SERE"), não uma cópia — é a mesma necessidade de negócio sendo endereçada por dois produtos diferentes.

### 1.7 Exportar Vários Horários

Tela para gerar um arquivo unificado a partir dos horários de Manhã/Tarde/Noite: nome do arquivo, duração das aulas em minutos, **Código INEP da escola** (identificador oficial nacional de escola, público), e seleção de quais horários (turnos) incluir.

**Observação:** Código INEP é um dado público (Censo Escolar/INEP), livre para uso.

### 1.8 Relatório Administrativo - Ponto Diário

Gera uma folha de ponto diário por professor, com opções: imprimir campo de observação, nome completo dos professores, hora-atividade, turma/disciplina, linha para visto por aula, filtrando por dia num calendário mensal.

**Observação funcional:** revela que o domínio de "gestão de horário escolar" tipicamente inclui também controle de frequência/ponto docente — um possível módulo futuro do NexGrade (fora do escopo do PRD v1.0 atual), útil registrar como aprendizado de mercado.

### 1.9 Relatório - Turmas (Individual)

Tela irmã da já documentada "Relatório - Professores (Individual)": mesmas opções de composição (Disciplina / Professor / Disciplina+Professor / Professor+Disciplina / Disciplina+Recurso / Professor+Disciplina+Recurso), detalhes adicionais e configuração de impressão — só que pivotado por turma em vez de por professor.

### 1.10 "Tipos" de geminação de aula — lista completa (Grupos 1 a 7)

Consolidando as duas capturas da lista de tipos, o URÂNIN UP define uma taxonomia própria e extensa de ~24 códigos (letras e símbolos) controlando como agrupar ("geminar") aulas consecutivas de um mesmo professor numa turma:

| Grupo | Regra geral | Códigos |
|---|---|---|
| 1 | No máximo 1 aula/dia do professor na turma | `A` (sem restrição adicional), `B` (mínimo 1 dia de intervalo entre aulas), `@` (uma aula terá 1 dia de intervalo das demais) |
| 2 | No máximo 1 dia/semana com 2 aulas do professor na turma; se caírem 2 no mesmo dia | `C` (tentar geminar), `D` (geminar obrigatoriamente), `E` (tentar não geminar), `F` (não geminar) |
| 3 | 1 ou 2 aulas/dia; se caírem 2 no mesmo dia | `G` (tentar geminar), `H` (geminar obrigatoriamente), `I` (tentar não geminar), `J` (não geminar) |
| 4 | Um par fixo de aulas geminadas; nos demais dias | `K` (no máximo 1 aula), `L` (tentar geminar se caírem 2), `M` (geminar obrigatoriamente se caírem 2) |
| 5 | Todas as aulas da turma com o professor agrupadas em blocos | `N` (pares), `Y` (pares com intervalo mínimo de 1 dia), `O` (trios), `P` (quartetos), `Z` (quintetos), `$` (sextetos) |
| 6 | Até 3 aulas/dia; se caírem 2+ no dia | `Q` (tentar geminar), `R` (geminar obrigatoriamente), `#` (geminar 2 e não a 3ª), `S` (tentar não geminar), `T` (não geminar) |
| 7 | Várias aulas/dia (sem limite de 3); se caírem 2+ no dia | `U` (tentar geminar), `V` (geminar obrigatoriamente), `W` (tentar não geminar), `X` (não geminar) |

**Atenção de originalidade:** esta tabela específica — a divisão em 7 grupos, a escolha de letras/símbolos, e a redação exata de cada regra — é uma **taxonomia proprietária e criativa do URÂNIN UP**. O requisito de negócio por trás dela (controlar como o Solver agrupa aulas consecutivas por professor/turma) é genérico e necessário — mas o NexGrade **não deve reaproveitar esta enumeração literal**. Recomendação: desenhar um modelo próprio, por exemplo parâmetros estruturados e nomeados de forma independente:
- `maxAulasPorDiaPorTurma` (número)
- `comportamentoGeminacao` (enum com nomes próprios, ex.: `SEMPRE_GEMINAR` / `TENTAR_GEMINAR` / `NUNCA_GEMINAR` / `GEMINAR_PARCIAL`)
- `tamanhoBlocoGeminado` (número de aulas seguidas desejado)
- `intervaloMinimoEntreBlocos` (dias)

Isso cobre o mesmo espaço de regras de negócio com uma expressão inteiramente original, e é inclusive mais amigável para configurar via IA conversacional (diferencial do NexGrade) do que decorar códigos de letra.

---

## 2. SERE (Sistema Estadual de Registro Escolar, SEED-PR) — Matriz Curricular

Sistema **governamental**, não do URÂNIN UP — todos os códigos e estruturas aqui são dados públicos do Estado do Paraná, seguros para uso no NexGrade. Estrutura observada (idêntica em todas as capturas):

```
Município / Estabelecimento / Período Letivo / Curso (nome + código) / Turno / Código Matriz
  └─ aba "Matriz Curricular" | aba "Organização da matriz"
       └─ seletor "Organização" (Ano ou Série)
            └─ Carga Horária Semanal — Total
            └─ Tabela "Disciplinas da Série":
                 Nº | Nome da Disciplina (Código SAE) | Composição Curricular | C.H Semanal | GrupoDisciplina | Padrão do Grupo | O(*)
```

### 2.1 Campos-chave da tabela de disciplinas

| Campo | Exemplo | Significado |
|---|---|---|
| Nome da Disciplina (Código SAE) | `MATEMATICA (201)` | Nome + código nacional/estadual SAE — identificador oficial, reutilizável entre escolas |
| Composição Curricular | `BNC`, `FGB`, `PD`, `IFA`, `IF`, `IFP`, `APF`, `PFO` | Categoria da disciplina na matriz (ver 2.2) |
| C.H Semanal | `2`, `3`, `4`... | Carga horária semanal daquela disciplina, naquela série |
| GrupoDisciplina | ex. `Língua Estrangeira Moderna` | Disciplina pertence a um grupo de opções (ex. Espanhol *ou* Inglês) |
| Padrão do Grupo | `S` | Disciplina padrão/default do grupo |
| O (*) | `S` | Indicativo de obrigatoriedade |

### 2.2 Códigos de "Composição Curricular" observados (ampliado)

| Código | Cursos onde aparece | Significado provável (a confirmar com a SEED-PR) |
|---|---|---|
| `BNC` | Fundamental (6º–9º ano) | Base Nacional Comum |
| `PD` | Fundamental e Médio | Parte Diversificada |
| `FGB` | Ensino Médio (Novo Ensino Médio) | Formação Geral Básica |
| `IFA` | Ensino Médio, variante "IFA" do curso | Itinerário Formativo — variante A |
| `IF` | Ensino Médio, variante "IF" do curso | Itinerário Formativo — variante genérica |
| `IFP` | Cursos Técnicos integrados | Itinerário Formativo Profissionalizante |
| `APF` | Cursos Técnicos | Aprofundamento / Prática Profissional |
| `PFO` | 3ª série EM | Parte Flexível/Formação |

> Interessante: cursos nomeados "ENSINO MEDIO **IFA** ..." usam a etiqueta `IFA`, enquanto cursos nomeados "ENSINO MEDIO **IF** ..." usam `IF` para disciplinas equivalentes (ex. Biologia II, Física II/III, Química I) — sugere que `IFA`/`IF` são variações da mesma categoria dependendo de como o curso foi cadastrado no SERE, não duas categorias com significados totalmente distintos. Vale confirmar oficialmente antes de fixar como enum.

### 2.3 Cursos identificados (lista ampliada)

- `ENS FUND 6/9 ANO-SERIE` — Fundamental anos finais (6º–9º), com organização "Ano" (6º, 7º, 8º, 9º)
- `ENSINO MEDIO IFA LGG/CHS`, `ENSINO MEDIO IFA MAT/CNT`, `ENSINO MEDIO IF LGG/CHS L INGL`, `ENSINO MEDIO IF MAT/CNT` — Ensino Médio regular, variações por itinerário formativo/área (Linguagens, Ciências Humanas, Matemática, Ciências da Natureza)
- `TEC EM MEIO AMBIENTE - ET AS`, `TEC EM DES DE SISTEMAS - ET IC`, `TEC EM ADMINISTRACAO - ET GN` — Técnicos integrados
- `FORM DOC ED INF AI EF - NORMAL` — Curso Normal/Magistério, turno Integral
- `NEM EPT IF TEC ADMINISTR-ET GN` — Técnico em Administração (Novo Ensino Médio, EPT)

Cada curso tem seu próprio Código Matriz e carga horária total por série — confirma que "curso" precisa ser entidade própria.

---

## 3. PDFs de horário exportado (URÂNIN UP → PDF)

*(Sem alterações desde a versão anterior — resumo mantido)*

Dois formatos de exportação, cobrindo o mesmo período letivo por eixos diferentes:

- **Por Professor**: um bloco por professor, com `Hor × Seg–Sex`, célula = traço (sem aula) / `HA` / `TURMA/DISCIPLINA` / código especial de atividade não-letiva.
- **Por Turma**: um bloco por turma, mesma grade, célula com duas linhas (disciplina + nome do professor).

Horários variam por turno: Manhã `07:30–11:55` (6 aulas), Tarde `13:05–16:40` (5 aulas), Noite `18:00–22:10` (6 aulas).

Códigos especiais de atividade não-letiva observados: `HA` (hora-atividade), `PAEE`, `COORD`, `SUP.`, `FORM`, `REP*`, `CEL.1`/`CEL.2`, `IF-1B`/`IF-2B`/`IF-2C`, `HIBRIDA-*`/`HIB`, `TEATR`, códigos de bloco pouco claros (`3B*`, `1B*`, `2B*`, `2C*`, `3C*`, `E.M.*`, `F.E.*`, `RH*`), e professores marcados com `*` (carga muito reduzida). Estes são **nomes/abreviações específicas da escola/URÂNIN**, não conceitos exclusivos — o NexGrade deve modelar a função ("ocupação não-letiva de um horário") de forma própria, com nomenclatura configurável pela escola, não copiar esta lista de siglas.

---

## 4. Padrão de nomenclatura dos códigos de turma

*(Sem alterações — este é um padrão observado no uso real da escola, não uma criação do URÂNIN UP; é análogo a qualquer convenção de nomenclatura de turma adotada livremente pela própria instituição)*

```
[SÉRIE/ANO][TURNO][TURMA][ESPAÇO][CURSO-OPCIONAL]
```
Exemplos: `8MA` (8º ano, Manhã, turma A), `1MA EM` (1ª série, Manhã, turma A, Ensino Médio regular), `2MA ADM` (2ª série, Manhã, turma A, Técnico Administração), `1NF ADM` (Técnico Administração, Noite, turma F).

Útil como heurística de parsing (regex + tabela de exceções), não como algo a "copiar", já que é uma convenção da própria escola.

---

## 5. Confronto com o schema atual do NexGrade (atualizado)

Só observações — nenhuma mudança de código feita a partir desta análise:

1. **Turno como conceito de primeira classe** — grade de horários (slots) e configurações de otimização variam por turno.
2. **Turma como entidade própria** — hoje só existe como `turma_id` solto; precisa de código, curso vinculado, série/ano, turno.
3. **Curso / Matriz Curricular** — nenhuma entidade hoje cobre isso; SERE mostra estrutura rica (Composição Curricular, GrupoDisciplina, Padrão do Grupo, Código SAE).
4. **Disciplina desacoplada vs. vinculada ao SAE** — o concorrente trata disciplina como texto livre por escola; o NexGrade pode se diferenciar vinculando nativamente ao Código SAE oficial desde o cadastro.
5. **Disponibilidade com 3 estados**, não 2 (disponível / hora-atividade fixa / indisponível).
6. **Parâmetros de geminação de aula configuráveis por professor** — via modelo próprio (ver seção 1.10), não a taxonomia do concorrente.
7. **Atividades não-letivas** (`PAEE`, `COORD`, `SUP.`, `FORM` etc., em nomenclatura própria) precisam de lugar no schema — nem toda ocupação de horário é uma aula regular.
8. **Grade curricular por turma** (aulas semanais de cada disciplina em cada turma) como uma visão derivada da Matriz Curricular do curso + eventuais ajustes locais da escola.
9. **Fixação manual de alocações** antes de rodar o Solver — um professor/turma/disciplina/horário pode ser travado manualmente.
10. Nenhuma exigência técnica aqui obriga o NexGrade a reproduzir nomes de tela, textos de mensagem ou esquemas de codificação do URÂNIN UP — cada um desses pontos pode e deve receber nomenclatura, fluxo de tela e textos próprios.

---

## 6. Arquivos de origem (referência)

| Arquivo | Conteúdo |
|---|---|
| `06_PROFESSORES_MANHA/TARDE/NOITE_*.pdf` | Horário por professor, por turno |
| `06_TURMAS_MANHA/TARDE/NOITE_*.pdf` | Horário por turma, por turno |
| `image_1_, 3_, 10_, 11_, 12_.png` (lote anterior) | URÂNIN UP — Cadastro Básico, Cadastro de Turmas, Lista de Tipos (parte 1), Relatório de Professores, Cadastro de Professor |
| `image_2_.png` (novo) | URÂNIN UP — Cadastro - Grade Curricular (matriz turma × disciplina) |
| `image_3_.png` (novo) | URÂNIN UP — Relatório - Turmas (Individual) |
| `image_5_, 7_.png` (novo) | URÂNIN UP — Tela inicial e menu Geral/Integração (Importar/Exportar, SEED-PR, RCO) |
| `image_6_, 14_.png` (novo) | URÂNIN UP — Lista de Tipos completa (Grupos 1–4 e 5–7) |
| `image_8_.png` (novo) | URÂNIN UP — Exportar Vários Horários (Código INEP) |
| `image_12_.png` (novo, reindexado) | URÂNIN UP — Controle - Fixar aulas |
| `image_13_.png` (novo) | URÂNIN UP — Relatório Administrativo - Ponto Diário |
| `image_16_.png` (novo) | URÂNIN UP — Cadastro - Disciplinas |
| `image_1_, 4_, 9_, 10_, 11_, 15_.png` (lote novo, SERE) | SERE/SEED-PR — Consultar Matriz Curricular (mais cursos/séries) |
| `Modelo_do_Sistema.pdf` | Registro do planejamento estratégico do projeto (fases de documentação, diferenciais competitivos frente ao URÂNIN UP) — mesmo conteúdo já discutido em conversa |

---

*Documento gerado a partir de material fornecido por Simone para o projeto NexGrade. Serve de insumo para decisões futuras de schema e do parser de importação, com diretrizes explícitas de originalidade para reduzir risco de disputa por direito autoral/concorrência desleal. Nenhuma alteração de código foi feita a partir desta análise. Recomenda-se revisão por advogado especializado em propriedade intelectual antes do lançamento comercial.*
