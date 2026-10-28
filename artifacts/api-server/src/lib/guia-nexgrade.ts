// [GUIA-IA] Passo a passo de cada tela do NexGrade, consultado pelo
// Assistente de IA (funcao consultar_guia_sistema em routes/ai.ts).
//
// Fica fora do prompt principal de proposito: o assistente so busca o
// trecho do assunto perguntado, entao o guia pode ser detalhado sem deixar
// cada conversa mais lenta ou mais cara.
//
// MANUTENCAO: escrito a partir das telas reais em 04/10/2026 (geracao, grade e conflitos revistos em 16/10/2026;
// turno Integral, RCO (XML e script), Arquivo do RCO e aula manual revistos em 26/10/2026). Ao mudar um
// nome de menu, botao ou fluxo no front (artifacts/horario-escolar), atualize
// o topico correspondente aqui -- o assistente repete o que estiver escrito.

export type TopicoGuia = {
  titulo: string;
  /** Palavras que ajudam a achar o topico quando a IA manda um tema livre. */
  palavras: string[];
  texto: string;
};

export const GUIA_NEXGRADE: Record<string, TopicoGuia> = {
  primeiros_passos: {
    titulo: "Primeiros passos — montar uma escola nova",
    palavras: ["começar", "inicio", "escola nova", "ordem", "configurar", "implantação", "primeira vez", "onboarding"],
    texto: `Ordem recomendada (é a mesma ordem do menu "Montagem da escola"):
1. Escola → aba Dados da Escola: confira nome, CNPJ, INEP, NRE e turnos ofertados.
2. Calendário e Turnos → aba Esquema de aulas por turno: configure os horários das aulas de cada turno, inclusive o Integral se a escola tiver turma de período integral (sem isso a Disponibilidade e a geração não funcionam para aquele turno). Na aba Calendário letivo, confira o calendário (escola nova já vem com o oficial SEED-PR; se estiver vazio, clique em "Usar o calendário oficial SEED-PR").
3. Cursos e Disciplinas → aba Catálogo SEED-PR: importe o catálogo oficial e marque os cursos que a escola oferece. Confira as disciplinas na aba Disciplinas.
4. Professores: cadastre cada professor com as disciplinas que ele pode lecionar (ou use Configurações → Importar planilhas).
5. Turmas: crie as turmas escolhendo curso e série/matriz; depois, na edição da turma, escolha o professor de cada disciplina.
6. Disponibilidade: marque bloqueios e hora-atividade (HA) de cada professor, por turno.
7. Salas: cadastre os espaços (salas, laboratórios, quadra).
8. Horário → Modo Experimental: gere a grade (botão Turno inteiro), compare com "Simular promoção" e clique em "Promover para oficial".
9. Usuários: libere o acesso da direção, coordenação, secretaria e gestor de reservas. Professores não precisam: entram com o e-mail do cadastro em Professores.
10. Códigos do RCO e Arquivo do RCO: confira os códigos SERE das turmas e os Códigos Externos das disciplinas; se a equipe NexGrade pedir, envie o arquivo da Grade de Horário do RCO.
11. RCO → Exportar para o RCO: grave a grade no RCO (veja o assunto "rco").`,
  },

  visao_geral: {
    titulo: "Visão Geral (painel inicial)",
    palavras: ["painel", "dashboard", "inicio", "resumo", "visão geral", "indicadores"],
    texto: `Menu Visão Geral. Mostra os totais da escola: Professores, Turmas, Disciplinas, Salas, Aulas Distribuídas, Turmas sem Horário, Conflitos Detectados, Licenças Ativas e Comunicados Não Lidos.
- O bloco "Atenção necessária" destaca o que precisa de ação (ex.: turmas sem horário, conflitos).
- O botão "Ver Grade Horária" leva para Horário → Grade.`,
  },

  calendario_turnos: {
    titulo: "Calendário e Turnos (calendário letivo e horários das aulas)",
    palavras: ["calendário", "feriado", "recesso", "trimestre", "dias letivos", "esquema", "horário das aulas", "turno", "intervalo", "duração da aula", "slots"],
    texto: `Menu Calendário e Turnos. Tem duas abas:

ABA CALENDÁRIO LETIVO
- Mostra feriados, recessos, pontos facultativos, dias de estudo e planejamento, início/fim do ano letivo e dos trimestres oficiais SEED-PR, com o total de dias letivos.
- Use as setas para trocar de mês. Cores: cada trimestre tem um tom (1º azul, 2º verde, 3º lilás), as semanas alternam entre tom claro e um pouco mais forte, feriado fica rosa, recesso âmbar e fim de semana cinza. As datas aparecem também na Minha Agenda dos professores.
- Se o ano ainda não tem calendário, aparece o botão "Usar o calendário oficial SEED-PR": um clique grava os 3 trimestres (201 dias letivos em 2026) e os feriados nacionais. Escola nova já começa com ele.
- Direção, coordenação e secretaria podem ajustar: "Editar trimestres" (datas e dias letivos), "Adicionar data" ou clicar num dia (recesso, feriado municipal, ponto facultativo, reposição) e o lápis/lixeira de cada data. "Restaurar oficial SEED-PR" volta ao calendário oficial e apaga os ajustes.
- Sem trimestres cadastrados, a aba Conflitos mostra "turma sem calendário" em todas as turmas.
- Gestor de reservas e professor só consultam.

ABA ESQUEMA DE AULAS POR TURNO (é aqui que se define o horário de cada aula)
1. Escolha o turno (matutino, vespertino ou noturno). No matutino, escolha também o nível: Fundamental (6º–9º ano) ou Médio/Técnico (1ª–3ª série), porque podem ter quantidades de aulas diferentes.
2. Preencha: Horário de início, Quantidade de aulas, Duração de cada aula (min), Intervalo após a aula nº e Duração do intervalo (min).
3. Clique em Continuar e confira a Pré-visualização dos horários.
4. Clique em "Salvar esquema". Repita para cada turno/nível.

TURNO INTEGRAL (turma de manhã e tarde, ex.: Formação de Docentes)
- Botão "Integral" na mesma aba. O NexGrade sugere as aulas juntando a manhã (Médio/Técnico) e a tarde; ajuste aula por aula para ficar IGUAL ao RCO da escola (por exemplo, em algumas escolas a 9ª aula começa às 15:00, não às 14:45, porque o intervalo da tarde do integral é depois da 2ª aula) e clique em Salvar.
- Cada aula do integral fica ligada à aula da manhã ou da tarde que acontece no mesmo horário: o professor da turma integral não pode estar em outra turma nesse horário, e a disponibilidade dele continua sendo a da manhã/tarde (não precisa cadastrar nada novo).
Observação: aulas fixas não ficam mais aqui — ficam na Disponibilidade de cada professor (botão "Modo fixar aula").`,
  },

  cursos_disciplinas: {
    titulo: "Cursos e Disciplinas (catálogo SEED-PR, cursos, matrizes e disciplinas)",
    palavras: ["curso", "matriz", "matriz curricular", "disciplina", "catálogo", "seed", "carga horária", "série", "sigla", "cor", "sae", "técnico"],
    texto: `Menu Cursos e Disciplinas. Tem três abas:

ABA CATÁLOGO SEED-PR
1. A lista mostra todos os cursos do catálogo oficial (Fundamental, Médio e Técnicos). Use "Buscar curso..." e os filtros de nível.
2. Marque os cursos que a escola oferece. Ao marcar, entram só aquele curso, as matrizes das séries e as disciplinas dele — o menu de disciplinas não fica lotado com o catálogo inteiro.
3. Desmarcar tira o curso da aba Cursos e da criação de turmas, sem apagar nada; marcar de novo religa. Use "Só ofertados" para ver só o que a escola tem.

ABA CURSOS E MATRIZ CURRICULAR
- Clique num curso para expandir e ver as matrizes por série/ano.
- "Novo Curso": informe Nível, Eixo tecnológico, Forma de oferta e, se tiver, o Código do curso. Depois de criado, expanda o curso para adicionar matrizes.
- "Nova matriz (série/ano)" cria a matriz de uma série. "Aplicar modelo oficial SEED-PR" preenche a matriz inteira com as disciplinas e cargas oficiais (disciplinas que não existem são criadas sozinhas). Em cursos técnicos, se o sistema não casar o curso sozinho, escolha o modelo oficial na lista.
- Dentro da matriz: "Adicionar disciplina" (Categoria, Disciplina, Carga), "Código SERE (opcional)" e "Copiar esta grade para outras turmas" / "Aplicar esta matriz às turmas" para atualizar turmas já criadas.

ABA DISCIPLINAS
- Por padrão mostra só as disciplinas em uso pela escola; marque "Mostrar catálogo completo" para ver todas.
- "Adicionar do Catálogo" traz disciplinas oficiais (SEED-PR/SAE) já com nome e código corretos.
- "Nova Disciplina": Nome, Sigla (usada nos PDFs compactos), Aulas por Semana, Cor no Horário, Categoria curricular fixa (opcional), Código SAE (opcional) e Sala exigida (ex.: Laboratório de Informática, Quadra).
- Os nomes seguem o padrão automático: inicial maiúscula em cada palavra e números romanos (I, II, III).
- Remover uma disciplina tira ela de todas as turmas e professores.`,
  },

  professores: {
    titulo: "Professores (cadastro, edição, carga horária e portal)",
    palavras: ["professor", "professora", "docente", "cadastrar professor", "editar professor", "inativo", "carga horária", "convite", "portal", "acesso do professor"],
    texto: `CADASTRAR
1. Menu Professores → "Novo Professor".
2. Preencha Nome Completo e Email (obrigatório — é o e-mail que o professor usa para entrar na Minha Agenda). Telefone é opcional. O e-mail cadastrado já libera o acesso do professor à Minha Agenda, sem convite: basta ele criar a conta com esse mesmo e-mail no endereço do sistema.
3. Em Disciplinas, marque todas que ele pode lecionar (isso diz em quais disciplinas ele é habilitado; a ligação com as turmas é feita em Turmas).
4. Clique em "Salvar Professor(a)".
Muitos professores de uma vez: use Configurações → Importar planilhas (tipo Professores).

EDITAR / CONSULTAR (clique no professor na lista)
- Status do Professor: professores inativos não recebem aulas no horário automático.
- Carga Horária: total semanal, por turno, HA obrigatória x necessária (institucional), HA* (contraturno) e distribuição por dia.
- "Gerenciar disponibilidade": abre a Disponibilidade já com esse professor.
- "Corrigir Conflitos (recomendado)": depois de mudar a disponibilidade, move só as aulas dele que ficaram em conflito, sem refazer a turma inteira. Mostra o que foi movido e o que precisa de ajuste manual.
- "Regenerar Horário (prévia)": gera uma prévia só das turmas desse professor; ela fica em Horário → Modo Experimental até alguém promover.

LISTA
- Busca por nome, filtro por disciplina e visualização em grade ou lista.
- O ícone "Convidar para o portal do professor" confirma que o acesso está liberado e mostra o endereço e o e-mail que o professor deve usar (não envia e-mail; avise o professor por WhatsApp ou pessoalmente).
- Remover professor tira o cadastro (confirmação obrigatória).`,
  },

  turmas: {
    titulo: "Turmas (cadastro, professores por disciplina, co-docência, trio e assíncronas)",
    palavras: ["turma", "classe", "série", "cadastrar turma", "professor da turma", "co-docência", "dupla docência", "trio", "assíncrona", "matriz da turma"],
    texto: `CRIAR TURMA
1. Menu Turmas → "Nova Turma".
2. Em "Curso e Matriz Curricular (recomendado)": escolha Nível, Curso e Série/Matriz — as disciplinas e cargas da matriz entram automaticamente. (Sem matriz, marque as disciplinas à mão em "Disciplinas da Turma (manual)".)
3. Informe Nome da Turma (ex.: 1º Ano A), Turno e Ano Letivo e salve. Turno "Integral (manhã e tarde)" é para turma de período integral; antes, salve o esquema Integral em Calendário e Turnos.
4. Código da turma no SERE (para o RCO) e Código SERE da parte IF (só 3º ano com duas turmas no RCO): também dá para preencher depois, em Códigos do RCO.

DEFINIR OS PROFESSORES (abrir a turma para editar)
- Na seção "Professores, co-docência e trio", escolha o professor de cada disciplina. Os "Habilitados nesta disciplina" aparecem primeiro. Tudo grava na hora.
- Co-docência (dois professores dando a mesma aula juntos): botão "+ co-docência" na disciplina.
- Trio (3 disciplinas, cada uma com seu professor, sempre no mesmo dia e horário): "+ Criar trio" e marque as 3 disciplinas. Elas precisam ter a mesma carga semanal e já ter professor definido. Para desfazer, use "desfazer" no trio.
- Assíncronas/sem.: quantas aulas semanais da disciplina são assíncronas (a aula assíncrona ocupa o professor, não a turma).

HORÁRIO DA TURMA
- Na lista, o botão "Horário" abre a grade da turma, com "Professores por Disciplina", aplicação de matriz e o botão "Gerar grade" (gera uma prévia no Modo Experimental; a grade oficial só muda depois de promover).
- Remover turma apaga também todo o horário dela.`,
  },

  disponibilidade_ha: {
    titulo: "Disponibilidade, hora-atividade (HA) e aulas fixas",
    palavras: ["disponibilidade", "bloqueio", "indisponível", "hora-atividade", "ha", "ha*", "ha fixa", "contraturno", "fixar aula", "aula fixa"],
    texto: `Menu Disponibilidade (ou, no cadastro do professor, "Gerenciar disponibilidade").
1. Escolha o professor (dá para buscar pelo nome) e a aba do turno (Matutino, Vespertino, Noturno).
2. Clique nas células da grade. Cada clique muda o estado: Disponível (verde) → Bloqueado (vermelho) → Hora-Atividade obrigatória (amarelo) → HA fixa (o motor não move) → volta para Disponível.
3. Clique em "Salvar" (ou "Desfazer" para descartar). Repita para cada turno em que o professor trabalha.
- Se o horário já tem aula real e você bloqueia, o sistema avisa que isso vai gerar conflito "professor indisponível".
- Se aparecer "Nenhum esquema de horário configurado para o turno", configure antes em Calendário e Turnos → Esquema de aulas por turno.
- HA* = hora-atividade em contraturno (num turno em que o professor não tem aula) ou referente a aulas de outro turno (ex.: HA das aulas da tarde cumprida de manhã). Aparece assim na Grade, na Minha Agenda, no perfil e nos PDFs.
- Quantidade de HA: a tabela oficial da SEED-PR é consultada com as aulas de CADA turno, e não com o total da escola. Ex.: 14 aulas de manhã (4 HA) + 8 à tarde (2 HA) = 6 HA.

PELA GRADE DO PROFESSOR (atalho para trocas do dia a dia)
Em Horário → Grade, filtre um professor e clique num horário vazio ou numa HA: abre um menu com Marcar HA, Tirar HA, Bloquear horário e Liberar horário. Grava na mesma Disponibilidade. HA fixa e abono do probatório (com cadeado 🔒) só mudam aqui na tela Disponibilidade.

FIXAR UMA AULA (a geração mantém a aula naquele horário)
1. Ligue "Modo fixar aula".
2. Clique na célula, escolha a turma e a disciplina e confirme.
3. Para soltar, clique de novo na célula com o modo ligado (ou use o botão de soltar na lista de aulas fixas).

Depois de mudar a disponibilidade de alguém com grade pronta, use Professores → (professor) → "Corrigir Conflitos (recomendado)".`,
  },

  salas: {
    titulo: "Salas e espaços",
    palavras: ["sala", "espaço", "laboratório", "quadra", "auditório", "biblioteca", "capacidade"],
    texto: `Menu Salas → "Nova Sala".
1. Informe Nome da Sala (ex.: Sala 12) e Capacidade.
2. Em Tipo, escolha: Sala de aula, Laboratório, Laboratório de Informática, Quadra poliesportiva, Auditório, Biblioteca, Sala de arte — ou "Outro tipo (digitar)..." (ex.: Sala Maker, Ateliê).
3. Salve. Para editar ou remover, use os botões da sala na lista.
Os espaços cadastrados aqui são os que aparecem em Reservas.`,
  },

  regras_distribuicao: {
    titulo: "Regras de Distribuição (limites usados na geração)",
    palavras: ["regras", "geminadas", "aulas seguidas", "limite por dia", "máximo por dia", "distribuição"],
    texto: `Menu Regras de Distribuição — mostra como o gerador aplica cada regra, em camadas.
- "Máximo de aulas geminadas (padrão da rede)": 3, igual em todas as escolas (regra travada, a escola não altera). Vale para toda disciplina/turma sem limite próprio.
- Por turma/disciplina: defina o "máx. geminadas/dia" de cada disciplina.
- Por professor: "Adicionar regra" → Professor, Turma (opcional — vazio vale para qualquer turma) e Máx./dia.
- Trio, co-docência e aulas assíncronas não ficam aqui: configure em Turmas → editar a turma.
- Os parâmetros da Resolução SEED 7.200/2025 (regência, HA, tetos por turno) aparecem em Escola → Configurações → Conformidade SEED-PR, só para consulta: são regras da rede, iguais em todas as escolas.`,
  },

  gerar_grade: {
    titulo: "Gerar a grade horária (Turma, Turno parcial, Turno inteiro, Modo Experimental e promover)",
    palavras: ["gerar", "gerar horário", "gerar grade", "cp-sat", "experimental", "promover", "oficial", "prévia", "melhorar grade", "janelas", "refazer horário", "turno parcial", "turma", "turno inteiro", "parar", "cancelar", "andamento", "simular promoção"],
    texto: `A grade é gerada no menu Horário → aba Modo Experimental. Toda geração vira um EXPERIMENTO: nada muda na grade oficial até você clicar em "Promover para oficial".

QUAL BOTÃO USAR (Turma, Turno parcial ou Turno inteiro)
O NexGrade recalcula só as turmas escolhidas. As aulas das outras turmas ficam paradas e contam como horário ocupado para os professores delas (ninguém fica em dois lugares). Ao promover, só as turmas do experimento são trocadas.
- Turma: corrige 1 ou poucas turmas sem mexer nas outras. Use quando abriu uma turma nova, mudou o professor ou a carga de uma disciplina, ou uma turma ficou com aula vaga ou conflito.
- Turno parcial: refaz um grupo de turmas do mesmo turno. Use quando a mudança atinge várias turmas (ex.: todos os 6º anos, porque o professor que circula entre eles mudou; só o Fundamental da manhã) ou para dividir um turno muito grande que demora a gerar.
- Turno inteiro: reorganiza o turno todo. Use no início do ano ou numa reorganização grande. É o que dá menos janelas, mas é o que mais muda a vida de alunos e professores.
- Regra prática: quanto menor a parte gerada, menos coisa muda e menos o sistema consegue melhorar. No meio do ano (grade já no RCO e passada às famílias), prefira Turma ou Turno parcial; o Turno inteiro fica para o planejamento do ano.

PASSO A PASSO
1. Clique em Turma, Turno parcial ou Turno inteiro.
2. À esquerda: nome do experimento (já vem preenchido, ex.: Grade-vespertino-2026-10-16-14h10), o turno ou as turmas e, no turno inteiro, o "Tempo limite (segundos)" (padrão 120; turnos grandes podem precisar de 300 a 600).
3. À direita, no turno inteiro: o aviso de hora-atividade DO TURNO ESCOLHIDO. Em cinza ("parte da HA em outro turno (HA*) -- sem problema"): a HA que não cabe no turno vai para o outro turno. Em vermelho ("com HA faltando"): o professor não tem horário disponível em nenhum turno; resolve liberando horários na Disponibilidade.
4. Clique em "Gerar grade". O andamento aparece à direita: lendo dados, ligando o servidor de cálculo (se estava desligado, leva 1 a 2 minutos), calculando (com as janelas da melhor grade encontrada caindo ao vivo) e salvando.
5. Durante o cálculo:
   - "Parar e usar a melhor até agora": interrompe e salva a melhor grade encontrada até ali (fica disponível depois da primeira grade encontrada).
   - "Cancelar sem salvar": interrompe e não salva nada.
6. Se a página recarregar no meio, a geração continua de onde parou.
- "Melhorar grade oficial" (turno inteiro): parte da grade oficial e tenta reduzir janelas trocando aulas de lugar. O resultado também vira um experimento.

CONFERIR E PROMOVER
- Em cada experimento: veja a grade por turma, baixe "PDF por turma" ou "PDF por professor".
- "Simular promoção": sem gravar nada, compara as janelas dos professores (aula + HA + atividade fora de sala) de como a grade ficaria depois de promover com a oficial como está hoje, e diz se vale promover. Mostra também quais aulas mudam de lugar (professor, turma, disciplina, de onde sai e para onde vai) e a HA que muda de cada professor. Use sempre antes de promover.
- "Promover para oficial" substitui o horário das turmas do experimento (pede confirmação) e recalcula a HA desses professores. HA marcada à mão (HA manual, HA fixa, probatório) é mantida.
- Apague os experimentos que não for usar.

REGRAS DA HORA-ATIVIDADE AO PROMOVER
- Quantidade pela tabela SEED-PR com as aulas de cada turno.
- No máximo 3 HA por dia em cada turno (4 só como exceção, quando não há outra saída); até 2 seguidas, a não ser que seja a única opção do turno.
- HA de aula do diurno nunca vai para a noite. O que não couber aparece em Conflitos como HA insuficiente.

OUTROS CAMINHOS
- Turmas → botão Horário da turma → "Gerar grade" (uma turma, vai para o Modo Experimental).
- Professores → (professor) → "Regenerar Horário (prévia)" (só as turmas daquele professor).
- "Mostrar gerador simples (emergência)": só se a geração normal estiver fora do ar. Ele NÃO respeita aulas fixas, HA fixa, trio, aulas assíncronas nem a reserva de HA, e o "Gerar Grade (simples)" da aba Grade substitui a grade OFICIAL da turma direto.

O Assistente de IA não gera grade — ele só explica o caminho.`,
  },

  grade_conflitos: {
    titulo: "Grade oficial e Conflitos (ver, filtrar, aula manual, HA e bloqueios pela grade)",
    palavras: ["grade", "ver horário", "filtrar", "aula manual", "adicionar aula", "excluir aula", "conflito", "conflitos", "vago", "livre", "indisponível", "turnos lado a lado", "trocar ha", "bloquear"],
    texto: `Menu Horário → aba Grade.
- Filtre por Turno (Matutino, Vespertino, Noturno ou Integral), por Turma ou por Professor (botão "Limpar" volta ao início). Selecione uma turma, um professor ou um turno para ver a grade.
- Turma integral: a grade mostra todas as aulas do esquema Integral (ex.: 11), com a hora de cada linha, mesmo vazias.
- Na grade do PROFESSOR, a aula da turma integral aparece no turno real (manhã ou tarde) e na linha correspondente; por isso a hora pode diferir um pouco da grade da turma (ex.: 15:00 no integral = 3ª aula da tarde, 14:45).
- Trio: a célula mostra a disciplina do professor presencial da semana, os 3 professores e o selo "PRESENCIAL"; clicando aparecem as 3 disciplinas.
- Professor com aula ou HA em mais de um turno, com o filtro em "Todos os turnos": aparece um quadro por turno, lado a lado, com o horário de cada aula e o total de aulas e HA do turno. Para ver só um, escolha o turno no filtro.
- Na grade do professor: Livre (contorno verde) = horário disponível sem aula nem HA; Indisp. (cinza) = bloqueio do professor; "indisp." embaixo do dia = turno inteiro bloqueado naquele dia; HA/HA* em amarelo; atividades fora de sala (FORM, COORD...) em cinza com o nome.
- Trocar HA ou bloqueio pela grade do professor: clique num Livre, Indisp. ou HA e escolha Marcar HA, Tirar HA, Bloquear horário ou Liberar horário. Para mudar uma HA de lugar: "Tirar HA" na antiga e "Marcar HA" na nova. Grava na Disponibilidade (HA marcada aqui é HA manual: a promoção de grade não mexe nela). HA fixa e probatório (🔒) só na tela Disponibilidade.
- Clique numa aula para ver os detalhes, editar ou excluir (a exclusão pede confirmação e não pode ser desfeita).
- "Adicionar aula manual": escolha Turma, Disciplina, Dia da semana, Número da aula e Professor (titular). Para co-docência, ligue "Aula com dois professores" e escolha o Professor de apoio. Grava direto na grade oficial; se já houver aula naquele horário para a turma, a inclusão é bloqueada.
  - Disciplina tem busca (digite parte do nome); as da turma aparecem primeiro, com o professor do vínculo. Disciplina cadastrada duas vezes aparece uma vez só; mesmo nome com código diferente mostra o SAE ao lado.
  - Depois de escolher a disciplina, o Professor mostra só os aptos (vínculo da turma ou habilitados na disciplina em Professores). "Mostrar todos" libera a lista inteira; sem nenhum apto, a lista vem completa com um aviso.
  - Aceita até a 12ª aula (turma integral).
- Com uma turma selecionada, também dá para clicar numa célula vazia para adicionar aula ali.
- Gestor de reservas vê a grade em modo consulta (sem alterar).

Aba Conflitos:
- Quadros Total, Críticos, Alta prioridade, Média e Baixa: clique num quadro para ver só aqueles conflitos; clique de novo (ou em Total) para ver todos.
- Botões por tipo (ex.: "HA Insuficiente (3)", "Janelas Excessivas (1)"): mostram só aquele tipo; dá para combinar com a gravidade.
- Cada conflito tem "Ver sugestões" e "Ver disponibilidade" (leva ao professor). "Reanalisar" recalcula.
- Para conflito de professor indisponível, o caminho mais seguro é Professores → (professor) → "Corrigir Conflitos (recomendado)".`,
  },

  reservas: {
    titulo: "Reservas de salas e espaços",
    palavras: ["reserva", "reservar", "agendar sala", "laboratório", "pendente", "confirmar reserva", "limite semanal", "prioridade", "regras de reserva"],
    texto: `Menu Reservas (agenda do dia, com "Hoje" e navegação por data). Cartões: Reservas do dia, Confirmadas, Pendentes e Salas ocupadas.

NOVA RESERVA
1. Clique em "Nova reserva".
2. Preencha: Data da reserva (segunda a sexta), Aula/horário, Espaço compartilhado, Professor responsável, Objetivo da reserva e Observações (opcional).
3. Salve. O NexGrade verifica se o espaço está livre e o limite semanal do professor antes de registrar. Se houver conflito de espaço ou limite, a reserva não é registrada.

PENDENTES
- Quando um espaço tem mais de uma solicitação na mesma aula, resolva antes de confirmar. Use "Confirmar" na reserva escolhida. Também dá para editar ou excluir (com confirmação).

REGRAS POR PROFESSOR (botão "Regras por professor" — só direção/coordenação)
- Limite semanal de reservas e Prioridade na fila (1 a 5; a 5 é atendida antes quando o mesmo espaço é disputado).
- O contador considera reservas pendentes e confirmadas da semana atual. O limite vale para todos, inclusive prioridade máxima.

QUEM FAZ O QUÊ
- Gestor de reservas: cria, confirma e exclui reservas; não altera as regras por professor nem a grade.
- Professor: pede reserva pela Minha Agenda ("Nova reserva"), vendo as aulas livres do espaço na data.
- Relatório: na própria tela Reservas, botão de relatório (PDF ou Excel, por professor, incluindo canceladas).
- PDF da semana (no quadro "Reservas da semana", botão "PDF da semana"): "Quadro da semana" = reservas e espaços livres por aula; "Por espaço" = um quadro por espaço e por equipamento reservado (laboratório, chromebooks...), com a turma, a disciplina e o professor em cada aula, em paisagem, para afixar na porta. Reserva aguardando confirmação sai em amarelo com "(aguard.)". Escolha o período (manhã, tarde ou noite).`,
  },

  licencas: {
    titulo: "Licenças e afastamentos",
    palavras: ["licença", "afastamento", "atestado", "licença médica", "falta longa"],
    texto: `Menu Licenças → "Nova Licença".
1. Escolha o Professor e informe o Tipo de licença (ex.: Licença médica), Data de início e Data de fim.
2. Observações é opcional. Salve.
- A lista tem busca por nome do professor; o botão de remover pede confirmação.
- Licenças ativas aparecem contadas na Visão Geral.
- Para achar quem pode cobrir as aulas, pergunte ao Assistente "quem está livre na Xª aula de [dia] [turno]?".`,
  },

  comunicados: {
    titulo: "Comunicados",
    palavras: ["comunicado", "aviso", "recado", "mensagem para a escola"],
    texto: `Menu Comunicados → "Novo Comunicado".
1. Informe Título (ex.: Reunião de pais) e Mensagem.
2. Envie. O comunicado aparece na lista (com busca por título) e conta em "Comunicados Não Lidos" na Visão Geral.
- Para apagar, use o botão de remover (pede confirmação).`,
  },

  importar: {
    titulo: "Importar planilhas (CSV)",
    palavras: ["importar", "csv", "planilha", "excel", "carga em lote", "subir dados"],
    texto: `Menu Configurações → Importar planilhas (Importação Inteligente) — professores, turmas e disciplinas via CSV.
1. Em "Tipo de dado", escolha Professores, Turmas ou Disciplinas.
2. Baixe o "Modelo" CSV. Colunas: Professores = nome;email;cpf;matricula;cargaHorariaTotal | Turmas = nome;serie;turno;anoLetivo | Disciplinas = nome;cargaSemanal;cor.
3. Preencha no Excel e salve como CSV (separador ponto-e-vírgula; primeira linha é o cabeçalho; UTF-8 com ou sem BOM).
4. Cole o conteúdo ou use "Carregar arquivo" e clique em "Analisar CSV".
5. Confira a pré-visualização e confirme. Dados duplicados são ignorados automaticamente.
Depois de importar professores, marque as disciplinas de cada um em Professores; depois de importar turmas, defina os professores em Turmas.`,
  },

  imprimir_grade: {
    titulo: "Imprimir Grade (PDFs da grade)",
    palavras: ["imprimir", "imprimir grade", "pdf", "grade em pdf", "quadro geral", "lado a lado", "compacto", "por disciplina", "mural", "sala dos professores"],
    texto: `Menu Relatórios → Imprimir Grade. É o único lugar dos PDFs da grade. Escolha no topo o Turno e a Semana (a data que sai no cabeçalho) e clique em "Baixar PDF" no modelo que quiser. Todos usam a grade oficial e saem em folha deitada (paisagem); nos modelos de um por quadro, saem 2 quadros por linha.
- Por turma: uma turma por quadro (sigla da disciplina e professor). Aceita "Todos os turnos" e filtro de uma turma.
- Turmas lado a lado: 5 turmas por página, em paisagem, cada aula com o nome da disciplina e o professor.
- Por professor: um professor por quadro, com turma, disciplina, HA (amarelo), HA* (contraturno ou aulas de outro turno) e horários bloqueados. Aceita "Todos os turnos" e filtro de um professor.
- Professores compacto: 6 professores por linha, com a turma em cada aula.
- Quadro geral de professores: uma linha por professor e os dias com as aulas nas colunas, em paisagem (para afixar na sala dos professores).
- Por disciplina: um quadro por disciplina, com a turma e o professor em cada aula.
- Os modelos novos (lado a lado, compacto, quadro geral e por disciplina) pedem um turno. Turno Integral: use os modelos por turma; no PDF por professor, a aula da turma integral sai na manhã/tarde dele.`,
  },

  exportar: {
    titulo: "Onde ficam os relatórios (Relatórios Pedagógicos e Exportar planilhas)",
    palavras: ["exportar", "pdf", "imprimir", "baixar grade", "relatório", "relatórios pedagógicos", "ponto", "ponto diário", "controle de ponto", "carga horária", "excel", "planilha", "csv"],
    texto: `[MENU-UNICO] Cada relatório fica num lugar só:
- PDFs da grade (por turma, por professor, lado a lado, compacto, quadro geral, por disciplina): Relatórios → Imprimir Grade (assunto "imprimir_grade").
- Relatórios → Relatórios Pedagógicos:
  - Ponto Diário: folha de ponto de UM dia. Escolha o dia e o turno (Manhã, Tarde, Noite ou Todos, um por página) e baixe em PDF ou Excel. Uma linha por professor que tem aula, hora-atividade (HA) ou atividade (FORM, COORD, ASS...) nesse dia, uma coluna por aula do turno com a TURMA, e a coluna Situação com quadradinhos P, F, AT, ATR e Observação. Se o dia for feriado ou recesso no calendário, o relatório avisa no topo.
  - Controle de Ponto (mês): planilha com a carga horária dos professores (filtro de professor, mês e ano).
  - Carga Horária por Professor: PDF com total de aulas, HA e turmas/disciplinas por turno (o resumo, não a grade do dia a dia).
  - Carga Horária Cumprida × Exigida: PDF por turma com o cumprido no ano x o exigido.
- Arquivo XML do RCO: RCO → Exportar para o RCO (assunto "rco").
- Relatório de Reservas: na tela Reservas.
- Configurações → Exportar planilhas: a grade completa ou de uma turma, em CSV (Excel) ou JSON. Configurações → Importar planilhas: professores, turmas e disciplinas por CSV.`,
  },

  rco: {
    titulo: "Gravar a grade no RCO (arquivo XML)",
    palavras: ["rco", "registro de classe", "sere", "xml", "incluir via arquivo", "script", "console", "f12", "trio", "dupla", "ifa", "lançar no rco", "exportar para o rco", "gravar no rco", "grade no rco"],
    texto: `Menu RCO → Exportar para o RCO. Só direção, coordenação e secretaria. Faça por turno (Matutino, Vespertino, Noturno, Integral). Antes: Código INEP em Escola → Dados da Escola e códigos em Códigos do RCO (o sistema avisa o que falta e leva para a tela).

COMO GRAVAR
- XML ("Baixar XML para o RCO"): um arquivo com todas as turmas do turno. No RCO: Grade de Horário → escolha o Período Letivo e o turno certo → Incluir via Arquivo. Limite do RCO: grava UMA disciplina por horário e substitui a grade inteira de cada turma.
- O aviso abaixo do botão diz, para o turno escolhido, se alguma turma tem mais de uma disciplina no mesmo horário (trio/dupla do IFA ou disciplinas diferentes com o mesmo código). Verde = só o XML basta. Amarelo = lista as turmas: importe o XML normalmente e avise o suporte NexGrade, que faz a gravação dessas turmas no RCO.
- Assíncronas ficam fora por padrão (o RCO fica igual ao PDF por turma). A caixa "Incluir aulas assíncronas" só deve ser marcada se a escola pedir.
- Nenhum passo do RCO feito pela escola usa F12 ou Console: o que precisa disso é feito só pelo suporte NexGrade.`,
  },

  arquivo_rco: {
    titulo: "Arquivo do RCO (enviar à equipe NexGrade o cadastro oficial da escola)",
    palavras: ["arquivo do rco", "enviar arquivo", "exportação do rco", "pedido", "selo pedido", "cadastro oficial", "códigos sere", "matriz oficial"],
    texto: `Menu RCO → Arquivo do RCO. Quando a equipe NexGrade pede, o item do menu aparece com o selo amarelo "Pedido" e a tela mostra a mensagem.
1. O RCO não tem um botão para baixar este arquivo: ele é baixado junto com o suporte NexGrade (atendimento remoto ou na escola), com a secretaria ou a direção logada no RCO, na tela Grade de Horário com o Período Letivo atual. É um .XML com o cadastro oficial (disciplinas com Código Externo, turmas com código SERE e a matriz de cada turma).
2. No NexGrade: "Escolher o arquivo .XML e enviar". O sistema confere se é o arquivo certo e mostra o resumo (turmas por turno, disciplinas, linhas de grade). O selo "Pedido" some.
- Enviar NÃO muda nada no cadastro nem na grade: o arquivo fica guardado para a equipe NexGrade conferir códigos e cargas. Um envio novo substitui o anterior.
- Só direção, coordenação e secretaria enviam e baixam o arquivo.`,
  },

  codigos_rco: {
    titulo: "Códigos do RCO (SERE das turmas e Código Externo das disciplinas)",
    palavras: ["códigos do rco", "codigo sere", "código externo", "sae", "parte if", "fgb", "turma no sere", "código da disciplina"],
    texto: `Menu RCO → Códigos do RCO. Só direção, coordenação e secretaria.
- Turmas: código da turma no SERE (o RCO recusa sem ele). 3º ano com duas turmas no RCO: código FGB (formação geral) e código da parte IF; cada disciplina vai para a parte certa automaticamente.
- Disciplinas: Código Externo do RCO (é o que o RCO usa; não é o SAE). Disciplina própria da turma também precisa (ex.: Prática de Formação = 1269 nas duas turmas).
- Os códigos SERE das turmas mudam todo ano: confira no começo do ano (o arquivo do RCO, em Arquivo do RCO, traz todos).`,
  },

  escola_config: {
    titulo: "Escola (dados, configurações, conformidade SEED-PR e assinatura)",
    palavras: ["escola", "dados da escola", "cnpj", "inep", "nre", "configurações", "conformidade", "resolução 7200", "hora-atividade padrão", "assinatura", "plano", "boleto", "pix", "cobrança"],
    texto: `Menu Escola. Três abas:
- Dados da Escola: Nome, CNPJ, Cidade, Estado, Modalidade, e-mail e WhatsApp de contato; Identificação oficial (Código INEP, NRE); Turnos ofertados; Resolução SEED-PR. Usados nos relatórios, na grade e na cobrança.
- Configurações: padrões de geração (Aulas por dia, Reduzir janelas automaticamente, Fator pedagógico) e formato do relatório SEED. O link "Conformidade SEED-PR → Configurar" abre os parâmetros da Resolução SEED 7.200/2025 (Art. 11): aulas de regência e horas-atividade para 20h e 40h, teto de aulas por turno (noite e demais turnos), até quantas aulas a HA fica no mesmo turno e máximo de geminadas. São regras padrão da rede, iguais em todas as escolas e travadas: a escola só consulta; mudança (por exemplo, se a SEED mudar a proporção hora-aula/hora-atividade) é feita pela administração da plataforma e vale para todas.
- Assinatura: plano atual ("Ver planos") e contato de cobrança (e-mail e WhatsApp usados para boleto/PIX), que pode ser diferente do contato geral.`,
  },

  usuarios_cargos: {
    titulo: "Usuários e cargos (quem acessa o sistema)",
    palavras: ["usuário", "acesso", "convidar", "cargo", "permissão", "direção", "coordenação", "secretaria", "secretária", "gestor de reservas", "pedagogia", "pedagogo", "login"],
    texto: `Menu Usuários — quem da equipe tem acesso nesta escola e com qual cargo. Não há limite de pessoas.
1. Clique em "Novo Usuário".
2. Informe Nome, E-mail e Cargo e clique em "Liberar acesso". Não sai e-mail de convite: avise a pessoa para entrar no endereço do sistema e criar a conta com esse mesmo e-mail (ou entrar, se já tiver conta). Até o primeiro acesso aparece "Ainda não entrou".
Cargos:
- Direção, Coordenação e Secretaria: acesso total (a secretaria costuma montar e gerar a grade).
- Gestor de reservas: só a agenda de reservas (sem regras por professor; vê a grade e o calendário só para consulta).
- Pedagogia: sem o menu completo. Abre Relatórios Pedagógicos (ponto do dia, controle de ponto, carga horária, listas de professores e disciplinas), Imprimir Grade, Licenças e Comunicados (pode alterar), e consulta o Horário, o Calendário e as Reservas (em que sala cada professor está). Não altera a grade, o cadastro, as reservas, os usuários nem o RCO.
- Professor NÃO é cadastrado aqui: o acesso dele vem do e-mail em Professores (cargo Professor, só a Minha Agenda). Quem é da equipe e também professor fica com o cargo da equipe.
- Para mudar o cargo, troque na lista (pede confirmação). Para tirar o acesso, use a lixeira (vale em até 1 minuto). Ninguém remove o próprio acesso, e a escola sempre fica com pelo menos uma pessoa de acesso total.
- Acesso "Nexus Core (suporte)": aparece quando o suporte da Nexus Core foi liberado para ajudar a escola; a escola pode remover quando quiser. Tudo o que o suporte fizer fica no Histórico.`,
  },

  entrar_acesso: {
    titulo: "Entrar no sistema, trocar de escola e sair",
    palavras: ["entrar", "login", "senha", "esqueci a senha", "criar conta", "trocar de escola", "outra escola", "seletor", "sair", "não foi liberado", "sem acesso"],
    texto: `- Entrar: com o e-mail e a senha da conta. Primeira vez: "Criar conta" com o e-mail que a escola cadastrou (o sistema envia um código para confirmar o e-mail). Esqueceu a senha: use o link de recuperar a senha na tela de entrada.
- O cargo e a escola vêm do cadastro da escola: equipe pela tela Usuários; professores pelo e-mail em Professores.
- Quem trabalha em mais de uma escola troca no seletor no topo da tela (nome da escola · cargo).
- "Seu e-mail ainda não foi liberado": o e-mail da conta não está cadastrado em nenhuma escola (ou está diferente). Peça à secretaria para conferir em Usuários ou em Professores; depois de cadastrado, vale em até 1 minuto.
- Sair: botão "Sair" no topo, em todos os cargos.`,
  },

  virada_ano: {
    titulo: "Virada do ano letivo (preparar a escola para o ano seguinte)",
    palavras: ["virada", "ano novo", "ano letivo", "próximo ano", "2027", "começo do ano", "novas turmas", "novos professores", "início do ano", "renovar"],
    texto: `Menu Configurações → Virada do ano. Só direção, coordenação e secretaria.
- Fica liberada a partir do fim do 3º trimestre do calendário da escola (antes disso, só se a Nexus Core liberar). Até lá dá para abrir a tela, conferir e planejar.
- As turmas CONTINUAM (mesma série, turno, disciplinas, cargas e professores) e passam para o ano novo: a turma é a vaga na grade, não o grupo de alunos. Ajuste só o que mudou:
  1. Baixe os PDFs da grade do ano que termina (por turma e por professor).
  2. Turmas: lixeira = a turma fecha; botão de copiar = abre mais uma turma da mesma série (mesmas disciplinas e cargas, sem professor). Dá para trocar o nome.
  3. Professores: todos continuam; desmarque quem saiu (fica inativo, não é excluído, e sai das disciplinas).
  4. Digite "VIRAR" e o ano (ex.: VIRAR 2027) e clique em Virar.
- Na virada são zerados: grade oficial, experimentos, disponibilidade (bloqueios e HA) e códigos SERE das turmas. Tudo fica guardado e as reservas já feitas continuam.
- "Desfazer virada" volta tudo como estava, enquanto não houver grade oficial do ano novo.
- Depois: calendário do ano novo, cadastrar professores novos, escolher professor nas disciplinas vazias (Turmas → Sem professor), lançar a disponibilidade, códigos do RCO e gerar a grade no Modo Experimental.

ROTEIRO DO COMEÇO DO ANO (depois que a SEED cria as turmas no SERE/RCO)
1. Virada do ano (acima).
2. Arquivo do RCO: a secretaria baixa no RCO e envia (os códigos SERE das turmas mudam todo ano).
3. Códigos do RCO: atualizar o código SERE de cada turma (e da parte IF) e o Código Externo das disciplinas novas.
4. Conferir as disciplinas e cargas de cada turma com a matriz oficial.
5. Esquemas de aula (inclusive Integral), professores, vínculos, disponibilidade e aulas fixas (trios, assíncronas, Prática).
6. Gerar no Modo Experimental, resolver Conflitos, conferir os PDFs e promover.
7. Gravar no RCO por turno: XML com todas as turmas e depois o script só das turmas com trio (assunto "rco").
8. Durante o ano: mudou aula, corrigir no NexGrade e rodar o script só das turmas que mudaram.`,
  },

  historico: {
    titulo: "Histórico de alterações (auditoria)",
    palavras: ["histórico", "auditoria", "quem alterou", "log", "registro de alterações"],
    texto: `Menu Histórico — auditoria das ações feitas no sistema: o que foi feito (criação, alteração, exclusão), em qual cadastro, por quem e quando.
- Use "Filtrar entidade" para ver só um tipo de dado (ex.: disponibilidade, horários).
- Ações confirmadas pelo Assistente de IA aparecem como "Assistente de IA (confirmado pelo usuário)".`,
  },

  portal_professor: {
    titulo: "Minha Agenda (portal do professor)",
    palavras: ["minha agenda", "portal do professor", "app do professor", "professor ver horário", "instalar app"],
    texto: `É o que o professor vê ao entrar com o e-mail cadastrado (cargo Professor).
- Grade de aulas por turno (abas Manhã, Tarde, Noite), com HA/HA* e aulas assíncronas marcadas; no celular mostra um dia por vez.
- "Baixar PDF" da própria grade; "Instalar app" para usar como aplicativo no celular.
- "Próximas datas do calendário da escola" sempre visível no topo (feriados, recessos, início/fim de trimestre; dias seguidos aparecem juntos, ex.: recesso de 13/07 a 22/07). O botão "Ocultar calendário" esconde.
- Na grade, cada dia mostra a data da semana; dia de feriado ou recesso aparece com a etiqueta "Feriado: sem aula" (ou Recesso) e as aulas do dia ficam apagadas. No celular, o dia mostra ✕ e um aviso.
- Reservas: "Nova reserva" → escolha o Espaço e a Data, clique numa aula livre, informe o objetivo e reserve. "Minhas reservas" lista as ativas.
- Se aparecer "Nenhum professor vinculado" ou "Seu e-mail ainda não foi liberado", o e-mail da conta não bate com o e-mail do cadastro em Professores — a secretaria ou a coordenação precisa conferir.`,
  },

  assistente: {
    titulo: "Assistente de IA (o que ele faz)",
    palavras: ["assistente", "ia", "inteligência artificial", "chat", "o que você faz"],
    texto: `O Assistente de IA (menu Assistente de IA) responde com os dados reais da escola:
- Grade de um professor (com HA/HA*) ou de uma turma; quem está livre num dia/aula/turno; reservas e limite semanal; janelas de professores, turmas sem horário e distribuição semanal.
- Passo a passo de qualquer tela do NexGrade.
- Pode propor marcar um professor como disponível/indisponível num horário — sempre pede confirmação antes de gravar e não altera hora-atividade.
- Não gera nem altera a grade; explica o caminho pela geração de grade (Modo Experimental).
- Disponível para direção, coordenação e secretaria.`,
  },
};

export const TOPICOS_GUIA = Object.keys(GUIA_NEXGRADE);

function semAcentoGuia(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Devolve o(s) topico(s) do guia. Aceita a chave exata ou um texto livre
 * (procura nas palavras-chave e no titulo) -- devolve no maximo 2 topicos.
 */
export function buscarNoGuia(tema: string): Array<{ topico: string; titulo: string; texto: string }> {
  const t = semAcentoGuia(tema ?? "").trim();
  const exato = GUIA_NEXGRADE[t];
  if (exato) return [{ topico: t, titulo: exato.titulo, texto: exato.texto }];
  const termos = t.split(/[^a-z0-9*]+/).filter((x) => x.length >= 3);
  const pontos = TOPICOS_GUIA.map((k) => {
    const g = GUIA_NEXGRADE[k]!;
    const alvo = semAcentoGuia(`${g.titulo} ${g.palavras.join(" ")}`);
    let p = 0;
    for (const palavra of g.palavras) if (t.includes(semAcentoGuia(palavra))) p += 3;
    for (const termo of termos) if (alvo.includes(termo)) p += 1;
    return { k, p };
  })
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, 2);
  return pontos.map(({ k }) => ({ topico: k, titulo: GUIA_NEXGRADE[k]!.titulo, texto: GUIA_NEXGRADE[k]!.texto }));
}
