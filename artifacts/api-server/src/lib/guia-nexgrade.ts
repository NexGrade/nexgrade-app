// [GUIA-IA] Passo a passo de cada tela do NexGrade, consultado pelo
// Assistente de IA (funcao consultar_guia_sistema em routes/ai.ts).
//
// Fica fora do prompt principal de proposito: o assistente so busca o
// trecho do assunto perguntado, entao o guia pode ser detalhado sem deixar
// cada conversa mais lenta ou mais cara.
//
// MANUTENCAO: escrito a partir das telas reais em 04/10/2026. Ao mudar um
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
2. Calendário e Turnos → aba Esquema de aulas por turno: configure os horários das aulas de cada turno (sem isso a Disponibilidade e a geração não funcionam para aquele turno).
3. Cursos e Disciplinas → aba Catálogo SEED-PR: importe o catálogo oficial e marque os cursos que a escola oferece. Confira as disciplinas na aba Disciplinas.
4. Professores: cadastre cada professor com as disciplinas que ele pode lecionar (ou use Importar Dados).
5. Turmas: crie as turmas escolhendo curso e série/matriz; depois, na edição da turma, escolha o professor de cada disciplina.
6. Disponibilidade: marque bloqueios e hora-atividade (HA) de cada professor, por turno.
7. Salas: cadastre os espaços (salas, laboratórios, quadra).
8. Horário → Modo Experimental: gere a grade com o motor CP-SAT, confira e clique em "Promover para oficial".
9. Usuários: convide direção, coordenação, gestor de reservas e professores.`,
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
- Use as setas para trocar de mês. Esta aba é de consulta.

ABA ESQUEMA DE AULAS POR TURNO (é aqui que se define o horário de cada aula)
1. Escolha o turno (matutino, vespertino ou noturno). No matutino, escolha também o nível: Fundamental (6º–9º ano) ou Médio/Técnico (1ª–3ª série), porque podem ter quantidades de aulas diferentes.
2. Preencha: Horário de início, Quantidade de aulas, Duração de cada aula (min), Intervalo após a aula nº e Duração do intervalo (min).
3. Clique em Continuar e confira a Pré-visualização dos horários.
4. Clique em "Salvar esquema". Repita para cada turno/nível.
Observação: aulas fixas não ficam mais aqui — ficam na Disponibilidade de cada professor (botão "Modo fixar aula").`,
  },

  cursos_disciplinas: {
    titulo: "Cursos e Disciplinas (catálogo SEED-PR, cursos, matrizes e disciplinas)",
    palavras: ["curso", "matriz", "matriz curricular", "disciplina", "catálogo", "seed", "carga horária", "série", "sigla", "cor", "sae", "técnico"],
    texto: `Menu Cursos e Disciplinas. Tem três abas:

ABA CATÁLOGO SEED-PR
1. Clique em "Importar catálogo oficial SEED-PR" — traz todos os cursos, matrizes e disciplinas oficiais.
2. Marque os cursos que a escola oferece (use "Buscar curso..." e o filtro "Só ofertados"). Só os cursos ofertados aparecem em Cursos e nas Turmas.

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
    palavras: ["professor", "professora", "docente", "cadastrar professor", "editar professor", "inativo", "carga horária", "convite", "portal"],
    texto: `CADASTRAR
1. Menu Professores → "Novo Professor".
2. Preencha Nome Completo e Email (obrigatório — é o e-mail que o professor usa para entrar na Minha Agenda). Telefone é opcional.
3. Em Disciplinas, marque todas que ele pode lecionar (isso diz em quais disciplinas ele é habilitado; a ligação com as turmas é feita em Turmas).
4. Clique em "Salvar Professor(a)".
Muitos professores de uma vez: use Importar Dados (tipo Professores).

EDITAR / CONSULTAR (clique no professor na lista)
- Status do Professor: professores inativos não recebem aulas no horário automático.
- Carga Horária: total semanal, por turno, HA obrigatória x necessária (institucional), HA* (contraturno) e distribuição por dia.
- "Gerenciar disponibilidade": abre a Disponibilidade já com esse professor.
- "Corrigir Conflitos (recomendado)": depois de mudar a disponibilidade, move só as aulas dele que ficaram em conflito, sem refazer a turma inteira. Mostra o que foi movido e o que precisa de ajuste manual.
- "Regenerar Horário (prévia)": gera uma prévia só das turmas desse professor; ela fica em Horário → Modo Experimental até alguém promover.

LISTA
- Busca por nome, filtro por disciplina e visualização em grade ou lista.
- O ícone "Convidar para o portal do professor" envia o convite por e-mail para ele acessar a Minha Agenda.
- Remover professor tira o cadastro (confirmação obrigatória).`,
  },

  turmas: {
    titulo: "Turmas (cadastro, professores por disciplina, co-docência, trio e assíncronas)",
    palavras: ["turma", "classe", "série", "cadastrar turma", "professor da turma", "co-docência", "dupla docência", "trio", "assíncrona", "matriz da turma"],
    texto: `CRIAR TURMA
1. Menu Turmas → "Nova Turma".
2. Em "Curso e Matriz Curricular (recomendado)": escolha Nível, Curso e Série/Matriz — as disciplinas e cargas da matriz entram automaticamente. (Sem matriz, marque as disciplinas à mão em "Disciplinas da Turma (manual)".)
3. Informe Nome da Turma (ex.: 1º Ano A), Turno e Ano Letivo e salve.

DEFINIR OS PROFESSORES (abrir a turma para editar)
- Na seção "Professores, co-docência e trio", escolha o professor de cada disciplina. Os "Habilitados nesta disciplina" aparecem primeiro. Tudo grava na hora.
- Co-docência (dois professores dando a mesma aula juntos): botão "+ co-docência" na disciplina.
- Trio (3 disciplinas, cada uma com seu professor, sempre no mesmo dia e horário): "+ Criar trio" e marque as 3 disciplinas. Elas precisam ter a mesma carga semanal e já ter professor definido. Para desfazer, use "desfazer" no trio.
- Assíncronas/sem.: quantas aulas semanais da disciplina são assíncronas (a aula assíncrona ocupa o professor, não a turma).

HORÁRIO DA TURMA
- Na lista, o botão "Horário" abre a grade da turma, com "Professores por Disciplina", aplicação de matriz e o botão "Gerar via CP-SAT" (gera uma prévia no Modo Experimental; a grade oficial só muda depois de promover).
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

FIXAR UMA AULA (o CP-SAT mantém a aula naquele horário)
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
- "Máximo de aulas geminadas (padrão da escola)": vale para toda disciplina/turma sem limite próprio. Ajuste e clique em Salvar.
- Por turma/disciplina: defina o "máx. geminadas/dia" de cada disciplina.
- Por professor: "Adicionar regra" → Professor, Turma (opcional — vazio vale para qualquer turma) e Máx./dia.
- Trio, co-docência e aulas assíncronas não ficam aqui: configure em Turmas → editar a turma.
- Os parâmetros da Resolução SEED 7.200/2025 (regência, HA, tetos por turno) ficam em Escola → Configurações → Conformidade SEED-PR.`,
  },

  gerar_grade: {
    titulo: "Gerar a grade horária (CP-SAT, Modo Experimental e promover para oficial)",
    palavras: ["gerar", "gerar horário", "gerar grade", "cp-sat", "experimental", "promover", "oficial", "prévia", "melhorar grade", "janelas", "refazer horário"],
    texto: `A grade é gerada no menu Horário → aba Modo Experimental. Nada muda na grade oficial até você clicar em "Promover para oficial".

GERAR COM O MOTOR CP-SAT (preciso, recomendado)
1. Em "Motor CP-SAT", escolha o alcance:
   - Turma: uma turma só.
   - Turno Parcial: escolha o turno e marque só algumas turmas (útil para dividir turnos grandes; as turmas de fora não mudam).
   - Turno inteiro: todas as turmas do turno.
2. Dê um nome ao experimento (ex.: CPSAT-Turno-2026-10-04). No turno inteiro dá para ajustar o "Tempo limite (segundos)" — padrão 120s; turnos grandes podem precisar de 300–600s.
3. Aguarde. Se a página recarregar no meio, a geração continua de onde parou.
4. Confira o resultado: turmas com aviso (disciplina não alocada por completo) aparecem listadas.
- "Melhorar grade oficial": parte da grade oficial do turno e tenta reduzir janelas trocando aulas de lugar — nunca fica pior que a oficial. O resultado também vira um experimento.

CONFERIR E PROMOVER
- Em cada experimento: veja a grade por turma, baixe "PDF por turma" ou "PDF por professor".
- "Promover para oficial" substitui o horário atual das turmas envolvidas (pede confirmação).
- Remova experimentos que não for usar.

OUTROS CAMINHOS
- Turmas → botão Horário da turma → "Gerar via CP-SAT" (mesmo motor, uma turma, vai para o Modo Experimental).
- Professores → (professor) → "Regenerar Horário (prévia)" (só as turmas daquele professor).
- Gerador simples / motor heurístico: só para emergência, se o CP-SAT estiver fora do ar. Ele NÃO respeita aulas fixas, HA fixa, trio, aulas assíncronas nem a reserva de HA, e o "Gerar Grade (simples)" da aba Grade substitui a grade OFICIAL da turma direto.

O Assistente de IA não gera grade — ele só explica o caminho.`,
  },

  grade_conflitos: {
    titulo: "Grade oficial e Conflitos (ver, filtrar, aula manual)",
    palavras: ["grade", "ver horário", "filtrar", "aula manual", "adicionar aula", "excluir aula", "conflito", "conflitos", "vago"],
    texto: `Menu Horário → aba Grade.
- Filtre por Turno, por Turma ou por Professor (botão "Limpar" volta ao início). Selecione uma turma, um professor ou um turno para ver a grade.
- Clique numa aula para ver os detalhes, editar ou excluir (a exclusão pede confirmação e não pode ser desfeita).
- "Adicionar aula manual": escolha Turma, Disciplina, Dia da semana, Número da aula e Professor (titular). Para co-docência, ligue "Aula com dois professores" e escolha o Professor de apoio. Grava direto na grade oficial; se já houver aula naquele horário para a turma, a inclusão é bloqueada.
- Com uma turma selecionada, também dá para clicar numa célula vazia para adicionar aula ali.
- Gestor de reservas vê a grade em modo consulta (sem alterar).

Aba Conflitos:
- Mostra Total de conflitos, Críticos e Alta prioridade, com gravidade (Crítico, Alto, Médio, Baixo) e "Sugestões de resolução".
- "Reanalisar" recalcula; "Ver disponibilidade" leva ao professor envolvido.
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
- Relatório: Exportar Dados → Relatório de Reservas (PDF ou Excel, por professor, incluindo canceladas).`,
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
    titulo: "Importar Dados (CSV)",
    palavras: ["importar", "csv", "planilha", "excel", "carga em lote", "subir dados"],
    texto: `Menu Importar Dados (Importação Inteligente) — professores, turmas e disciplinas via CSV.
1. Em "Tipo de dado", escolha Professores, Turmas ou Disciplinas.
2. Baixe o "Modelo" CSV. Colunas: Professores = nome;email;cpf;matricula;cargaHorariaTotal | Turmas = nome;serie;turno;anoLetivo | Disciplinas = nome;cargaSemanal;cor.
3. Preencha no Excel e salve como CSV (separador ponto-e-vírgula; primeira linha é o cabeçalho; UTF-8 com ou sem BOM).
4. Cole o conteúdo ou use "Carregar arquivo" e clique em "Analisar CSV".
5. Confira a pré-visualização e confirme. Dados duplicados são ignorados automaticamente.
Depois de importar professores, marque as disciplinas de cada um em Professores; depois de importar turmas, defina os professores em Turmas.`,
  },

  exportar: {
    titulo: "Exportar Dados (PDFs, planilhas e relatórios)",
    palavras: ["exportar", "pdf", "imprimir", "baixar grade", "relatório", "ponto", "controle de ponto", "carga horária", "excel"],
    texto: `Menu Exportar Dados. Opções:
- Grade Horária: grade completa ou de uma turma, em CSV (Excel) ou JSON.
- Controle de Ponto: planilha com a carga horária dos professores (filtro de professor, mês e ano).
- Grade em PDF: pronta para impressão. Escolha Visão (Por Turma ou Por Professor), Turno e Semana (atual ou que vem). HA em contraturno aparece como HA*.
- Relatório de Reservas: por professor, num período, com confirmadas, pendentes e canceladas — PDF ou Excel.
- Relatório de Carga Horária: PDF por professor com total de aulas, HA institucional e turmas/disciplinas por período (é o resumo, não a grade dia a dia).
- Carga Horária Cumprida × Exigida: PDF por turma com o cumprido no ano x o total exigido, para ver antes se alguma disciplina vai fechar o ano devendo aula.
- Relatório SEED: arquivo exportado pelo sistema. Atenção: ainda NÃO é integração com o RCO — o lançamento no RCO continua manual.`,
  },

  escola_config: {
    titulo: "Escola (dados, configurações, conformidade SEED-PR e assinatura)",
    palavras: ["escola", "dados da escola", "cnpj", "inep", "nre", "configurações", "conformidade", "resolução 7200", "hora-atividade padrão", "assinatura", "plano", "boleto", "pix", "cobrança"],
    texto: `Menu Escola. Três abas:
- Dados da Escola: Nome, CNPJ, Cidade, Estado, Modalidade, e-mail e WhatsApp de contato; Identificação oficial (Código INEP, NRE); Turnos ofertados; Resolução SEED-PR. Usados nos relatórios, na grade e na cobrança.
- Configurações: padrões de geração (Aulas por dia, Reduzir janelas automaticamente, Fator pedagógico) e formato do relatório SEED. O link "Conformidade SEED-PR → Configurar" abre os parâmetros da Resolução SEED 7.200/2025 (Art. 11): aulas de regência e horas-atividade para 20h e 40h, teto de aulas por turno (noite e demais turnos), até quantas aulas a HA fica no mesmo turno e máximo de geminadas. Ficam editáveis porque a proporção hora-aula/hora-atividade pode mudar.
- Assinatura: plano atual ("Ver planos") e contato de cobrança (e-mail e WhatsApp usados para boleto/PIX), que pode ser diferente do contato geral.`,
  },

  usuarios_cargos: {
    titulo: "Usuários e cargos (quem acessa o sistema)",
    palavras: ["usuário", "acesso", "convidar", "cargo", "permissão", "direção", "coordenação", "gestor de reservas", "login"],
    texto: `Menu Usuários — quem tem acesso nesta escola e com qual cargo.
1. Clique em "Novo Usuário".
2. Informe Nome, E-mail e Cargo e envie. A pessoa recebe um convite por e-mail e entra já com o cargo escolhido. Enquanto não aceitar, aparece "Convite pendente".
Cargos:
- Direção e Coordenação: acesso total.
- Gestor de reservas: só a agenda de reservas (sem regras por professor; vê a grade só para consulta).
- Professor: só a Minha Agenda.
- Para mudar o cargo, troque na lista (pede confirmação). O professor também pode ser convidado pela tela Professores ("Convidar para o portal do professor").`,
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
- Calendário escolar com os próximos eventos.
- Reservas: "Nova reserva" → escolha o Espaço e a Data, clique numa aula livre, informe o objetivo e reserve. "Minhas reservas" lista as ativas.
- Se aparecer "Nenhum professor vinculado", o e-mail da conta não bate com o e-mail do cadastro em Professores — a coordenação precisa conferir.`,
  },

  assistente: {
    titulo: "Assistente de IA (o que ele faz)",
    palavras: ["assistente", "ia", "inteligência artificial", "chat", "o que você faz"],
    texto: `O Assistente de IA (menu Assistente de IA) responde com os dados reais da escola:
- Grade de um professor (com HA/HA*) ou de uma turma; quem está livre num dia/aula/turno; reservas e limite semanal; janelas de professores, turmas sem horário e distribuição semanal.
- Passo a passo de qualquer tela do NexGrade.
- Pode propor marcar um professor como disponível/indisponível num horário — sempre pede confirmação antes de gravar e não altera hora-atividade.
- Não gera nem altera a grade; explica o caminho pelo CP-SAT.
- Disponível para direção e coordenação.`,
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
