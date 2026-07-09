// Script de seed — popula o banco com dados de TESTE para você
// conseguir navegar por todas as telas do NexGrade sem precisar
// cadastrar tudo manualmente.
//
// Os "codigo_sae" abaixo são os CÓDIGOS REAIS fornecidos pela escola
// (planilha Codigo/Nome_Disciplina/Carga_Horaria_Padrao), cobrindo o
// Ensino Médio regular + trilhas de aprofundamento + cursos técnicos
// (Administração, Desenvolvimento de Sistemas, Logística, Agronegócio,
// Enfermagem, Mecânica, Elétrica, RH, Marketing, Finanças).
//
// Como rodar (na raiz do monorepo):
//   pnpm --filter @workspace/scripts run seed
//
// É seguro rodar mais de uma vez: o script primeiro apaga os dados de
// teste da escola "escola_default" antes de inserir de novo.

import { db, pool } from "@workspace/db";
import {
  planosTable,
  disciplinasTable,
  professoresTable,
  professorDisciplinasTable,
  turmasTable,
  turmaDisciplinasTable,
  salasTable,
  horariosTable,
  disponibilidadeTable,
  cursosTable,
  matrizesCurricularesTable,
  itensMatrizTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ESCOLA_ID = "escola_default";

// Paleta de cores da marca + tons auxiliares para diferenciar disciplinas
const PALETA_CORES = [
  "#1565C0", "#0D47A1", "#42A5F5", "#607D8B", "#43A047",
  "#FB8C00", "#8E24AA", "#00897B", "#6D4C41", "#3949AB",
  "#D81B60", "#5D4037", "#00ACC1", "#7CB342", "#F4511E",
];

// Fonte: planilha oficial fornecida pela escola (Codigo, Nome, Carga
// Horária Padrão semanal). Ordem preservada conforme recebida.
const DISCIPLINAS_SAE: Array<[codigo: string, nome: string, carga: number]> = [
  ["1100", "Língua Portuguesa e Literatura", 5],
  ["2700", "Matemática", 5],
  ["2500", "Biologia", 2],
  ["2600", "Física", 2],
  ["2300", "Química", 2],
  ["2200", "História", 2],
  ["2100", "Geografia", 2],
  ["3100", "Filosofia", 2],
  ["3300", "Sociologia", 2],
  ["4100", "Arte", 2],
  ["3200", "Educação Física", 2],
  ["1400", "Língua Estrangeira Moderna - Inglês", 2],
  ["1200", "Língua Estrangeira Moderna - Espanhol", 2],
  ["2400", "Ciências (Fundamental)", 3],
  ["6400", "Ensino Religioso", 1],
  ["PV01", "Projeto de Vida", 2],
  ["PC01", "Pensamento Computacional", 1],
  ["EDFIN", "Educação Financeira", 1],
  ["CC01", "Cidadania e Civismo", 1],
  ["RED01", "Redação e Leitura", 2],
  ["LGG01", "Aprofundamento Linguagens e suas Tecnologias", 4],
  ["MAT01", "Aprofundamento Matemática e suas Tecnologias", 4],
  ["CNT01", "Aprofundamento Ciências da Natureza", 4],
  ["CHS01", "Aprofundamento Ciências Humanas e Sociais", 4],
  ["ADM01", "Introdução à Administração", 2],
  ["ADM02", "Contabilidade Geral", 3],
  ["ADM03", "Marketing e Gestão de Clientes", 2],
  ["ADM04", "Gestão de Pessoas e Recursos Humanos", 3],
  ["ADM05", "Administração Financeira e Orçamentária", 3],
  ["DS01", "Lógica de Programação", 3],
  ["DS02", "Modelagem e Banco de Dados", 3],
  ["DS03", "Desenvolvimento de Sistemas Web", 4],
  ["DS04", "Programação para Dispositivos Móveis", 4],
  ["DS05", "Análise e Projeto de Sistemas", 2],
  ["LOG01", "Introdução à Logística", 2],
  ["LOG02", "Gestão de Armazenamento e Estoques", 3],
  ["LOG03", "Logística de Suprimentos e Distribuição", 3],
  ["LOG04", "Planejamento de Transportes e Modais", 3],
  ["LOG05", "Custos Logísticos", 2],
  ["AGRO01", "Introdução ao Agronegócio", 2],
  ["AGRO02", "Cadeias Produtivas Agropecuárias", 3],
  ["AGRO03", "Gestão de Propriedades Rurais", 3],
  ["AGRO04", "Economia e Políticas Agrícolas", 2],
  ["AGRO05", "Tecnologias Aplicadas ao Campo", 2],
  ["ENF01", "Fundamentos de Enfermagem", 4],
  ["ENF02", "Anatomia e Fisiologia Humana", 3],
  ["ENF03", "Enfermagem em Saúde Pública", 3],
  ["ENF04", "Biossegurança e Vigilância Sanitária", 2],
  ["ENF05", "Farmacologia Aplicada", 2],
  ["MEC01", "Desenho Técnico Mecânico", 3],
  ["MEC02", "Tecnologia dos Materiais", 2],
  ["MEC03", "Processos de Fabricação e Usinagem", 4],
  ["MEC04", "Manutenção Mecânica Preventiva", 3],
  ["MEC05", "Sistemas Hidráulicos e Pneumáticos", 2],
  ["ELET01", "Eletricidade Geral e Circuitos", 3],
  ["ELET02", "Instalações Elétricas Residenciais", 3],
  ["ELET03", "Instalações Elétricas Industriais", 4],
  ["ELET04", "Máquinas Elétricas e Transformadores", 3],
  ["ELET05", "Sistemas de Automação e CLPs", 3],
  ["RH01", "Rotinas de Departamento de Pessoal", 3],
  ["RH02", "Legislação Trabalhista e Previdenciária", 3],
  ["RH03", "Recrutamento, Seleção e Treinamento", 2],
  ["RH04", "Cargos, Salários e Benefícios", 2],
  ["RH05", "Saúde e Segurança no Trabalho", 2],
  ["DEV01", "Arquitetura de Computadores e Redes", 2],
  ["DEV02", "Segurança da Informação", 2],
  ["DEV03", "Programação Orientada a Objetos", 4],
  ["DEV04", "Estruturas de Dados", 3],
  ["DEV05", "Qualidade e Testes de Software", 2],
  ["MKT01", "Fundamentos do Marketing", 2],
  ["MKT02", "Comportamento do Consumidor", 2],
  ["MKT03", "Marketing Digital e Mídias Sociais", 4],
  ["MKT04", "Gestão de Marcas e Branding", 2],
  ["MKT05", "Pesquisa de Mercado e Planejamento", 3],
  ["FIN01", "Contabilidade Básica e Custos", 3],
  ["FIN02", "Matemática Financeira Aplicada", 3],
  ["FIN03", "Mercado Financeiro e de Capitais", 2],
  ["FIN04", "Planejamento e Controle Orçamentário", 3],
  ["FIN05", "Análise de Investimentos", 2],
];

// ⚠️ ATENÇÃO — GAP DE SCHEMA: a planilha real da escola tem uma coluna
// "Max_Aulas_Dia" (limite de aulas da mesma disciplina por dia para uma
// turma). Hoje NENHUMA tabela do banco guarda essa regra — nem
// `turma_disciplinas`, nem `horarios`. Este seed usa o valor só para
// DISTRIBUIR as aulas de forma realista aqui na hora de gerar dado de
// teste, mas o motor de geração de horário do app (RF-SOLV) e o
// detector de conflitos (RF-ALOC) HOJE NÃO conhecem nem aplicam essa
// regra ao gerar/validar uma grade de verdade. Se isso for uma regra de
// negócio real (não só um teto informal), vale abrir isso como tarefa:
// adicionar um campo tipo `maxAulasDia` em `turma_disciplinas` e fazer
// o gerador/o detector de conflito respeitarem.

// Mapa turma → (etapa, série/ano) da matriz curricular real (seção
// abaixo). Nomes de turma exatamente como veio da planilha da escola.
const TURMA_MATRIZ_CHAVE: Record<string, string> = {
  "6 Ano A": "Ensino Fundamental II::6º Ano",
  "1 Serie A": "Ensino Médio Regular::1ª Série",
  "1 Serie Tec ADM": "Ensino Médio Técnico::1ª Série ADM",
};

const TURMA_TURNO: Record<string, string> = {
  "6 Ano A": "matutino",
  "1 Serie A": "matutino",
  "1 Serie Tec ADM": "noturno",
};

type LinhaMatriz = { etapa: string; serieAno: string; codigoSae: string; aulas: number };

// Fonte: planilha oficial da escola (Ano_Letivo, Etapa_Ensino,
// Serie_Ano, Codigo_Disciplina, Aulas_Semanais). Define O QUE e QUANTO
// cada série estuda — independente de qual professor específico dá
// aquela aula (isso vem em TURMA_PROFESSOR_REAL, mais abaixo).
const MATRIZ_REAL: LinhaMatriz[] = [
  { etapa: "Ensino Fundamental II", serieAno: "6º Ano", codigoSae: "1100", aulas: 5 },
  { etapa: "Ensino Fundamental II", serieAno: "6º Ano", codigoSae: "2700", aulas: 5 },
  { etapa: "Ensino Fundamental II", serieAno: "6º Ano", codigoSae: "2100", aulas: 3 },
  { etapa: "Ensino Fundamental II", serieAno: "6º Ano", codigoSae: "PC01", aulas: 1 },
  { etapa: "Ensino Médio Regular", serieAno: "1ª Série", codigoSae: "1100", aulas: 5 },
  { etapa: "Ensino Médio Regular", serieAno: "1ª Série", codigoSae: "2700", aulas: 5 },
  { etapa: "Ensino Médio Regular", serieAno: "1ª Série", codigoSae: "PV01", aulas: 2 },
  { etapa: "Ensino Médio Regular", serieAno: "1ª Série", codigoSae: "EDFIN", aulas: 1 },
  { etapa: "Ensino Médio Técnico", serieAno: "1ª Série ADM", codigoSae: "1100", aulas: 4 },
  { etapa: "Ensino Médio Técnico", serieAno: "1ª Série ADM", codigoSae: "ADM01", aulas: 3 },
  { etapa: "Ensino Médio Técnico", serieAno: "1ª Série ADM", codigoSae: "ADM02", aulas: 3 },
];

type AtribuicaoReal = { turma: string; codigoSae: string; professor: string; maxAulasDia: number };

// Fonte: planilha oficial da escola (Ano_Letivo, Nome_Turma, Turno,
// Codigo_Disciplina, Nome_Professor, Max_Aulas_Dia). Define QUEM dá
// aula de quê, em qual turma. Nomes exatamente como vieram da escola —
// sem completar sobrenome nem inventar disciplina/professor extra.
//
// Disciplinas da matriz SEM linha aqui ainda (2700 e EDFIN em
// "1 Serie A") não têm professor confirmado — o seed não gera aula
// pra elas até você mandar essa confirmação.
const TURMA_PROFESSOR_REAL: AtribuicaoReal[] = [
  { turma: "6 Ano A", codigoSae: "1100", professor: "Maria Silva", maxAulasDia: 2 },
  { turma: "6 Ano A", codigoSae: "2700", professor: "Carlos Souza", maxAulasDia: 2 },
  { turma: "6 Ano A", codigoSae: "PC01", professor: "Roberto Lima", maxAulasDia: 1 },
  { turma: "1 Serie A", codigoSae: "1100", professor: "Maria Silva", maxAulasDia: 2 },
  { turma: "1 Serie A", codigoSae: "PV01", professor: "Ana Paula", maxAulasDia: 2 },
  { turma: "1 Serie Tec ADM", codigoSae: "ADM01", professor: "Joao Santos", maxAulasDia: 2 },
  { turma: "1 Serie Tec ADM", codigoSae: "ADM02", professor: "Fernanda Costa", maxAulasDia: 3 },
];

function cargaHorariaMatriz(turma: string, codigoSae: string): number {
  const chave = TURMA_MATRIZ_CHAVE[turma];
  const linha = MATRIZ_REAL.find((l) => `${l.etapa}::${l.serieAno}` === chave && l.codigoSae === codigoSae);
  return linha?.aulas ?? 0;
}

function emailFromNome(nome: string): string {
  const semAcento = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${semAcento}@escola.exemplo.br`;
}

async function main() {
  console.log("🌱 Iniciando seed do NexGrade...\n");

  // ------------------------------------------------------------------
  // 1. PLANOS — a tabela que estava vazia e quebrando o onboarding
  // ------------------------------------------------------------------
  const planosExistentes = await db.select().from(planosTable);
  if (planosExistentes.length === 0) {
    await db.insert(planosTable).values([
      {
        nome: "Gratuito",
        preco: 0,
        maxProfessores: 5,
        maxTurmas: 3,
        temIA: true,
        temExport: false,
        temImport: false,
        ativo: true,
      },
      {
        nome: "Pro",
        preco: 150,
        maxProfessores: 30,
        maxTurmas: 20,
        temIA: true,
        temExport: true,
        temImport: true,
        ativo: true,
      },
      {
        nome: "Master",
        preco: 400,
        maxProfessores: 9999,
        maxTurmas: 9999,
        temIA: true,
        temExport: true,
        temImport: true,
        ativo: true,
      },
    ]);
    console.log("✅ Planos criados: Gratuito, Pro, Master");
  } else {
    console.log("⏭️  Planos já existiam — pulado");
  }

  // ------------------------------------------------------------------
  // Limpa dados de teste anteriores da escola_default (idempotente)
  // ------------------------------------------------------------------
  await db.delete(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID));
  await db.delete(disponibilidadeTable);
  const turmasAntigas = await db.select({ id: turmasTable.id }).from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID));
  for (const t of turmasAntigas) {
    await db.delete(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, t.id));
  }
  await db.delete(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID));
  const profsAntigos = await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  for (const p of profsAntigos) {
    await db.delete(professorDisciplinasTable).where(eq(professorDisciplinasTable.professorId, p.id));
  }
  await db.delete(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const matrizesAntigas = await db.select({ id: matrizesCurricularesTable.id }).from(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.escolaId, ESCOLA_ID));
  for (const m of matrizesAntigas) {
    await db.delete(itensMatrizTable).where(eq(itensMatrizTable.matrizCurricularId, m.id));
  }
  await db.delete(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.escolaId, ESCOLA_ID));
  await db.delete(cursosTable).where(eq(cursosTable.escolaId, ESCOLA_ID));
  await db.delete(salasTable).where(eq(salasTable.escolaId, ESCOLA_ID));
  await db.delete(disciplinasTable).where(eq(disciplinasTable.escolaId, ESCOLA_ID));
  console.log("🧹 Dados de teste anteriores removidos");

  // ------------------------------------------------------------------
  // 2. DISCIPLINAS — dataset real completo (76 disciplinas), cobrindo
  // Ensino Médio regular + aprofundamentos + todos os cursos técnicos
  // ------------------------------------------------------------------
  const disciplinasSeed = DISCIPLINAS_SAE.map(([codigoSae, nome, cargaSemanal], i) => ({
    escolaId: ESCOLA_ID,
    nome,
    cargaSemanal,
    cor: PALETA_CORES[i % PALETA_CORES.length],
    codigoSae,
  }));

  const disciplinas = await db.insert(disciplinasTable).values(disciplinasSeed).returning();
  console.log(`✅ ${disciplinas.length} disciplinas criadas (Código SAE real, Ensino Médio + cursos técnicos)`);

  // ------------------------------------------------------------------
  // 3. PROFESSORES — apenas os REALMENTE confirmados pela escola
  // (ver TURMA_PROFESSOR_REAL no topo do arquivo). Carga horária total
  // calculada automaticamente a partir da matriz real de cada turma
  // onde o professor está confirmado.
  // ------------------------------------------------------------------
  const disciplinaPorCodigoInicial = Object.fromEntries(disciplinas.map((d) => [d.codigoSae, d]));

  const infoPorProfessor = new Map<string, { codigos: Set<string>; cargaTotal: number }>();
  for (const a of TURMA_PROFESSOR_REAL) {
    if (!infoPorProfessor.has(a.professor)) infoPorProfessor.set(a.professor, { codigos: new Set(), cargaTotal: 0 });
    const info = infoPorProfessor.get(a.professor)!;
    info.codigos.add(a.codigoSae);
    info.cargaTotal += cargaHorariaMatriz(a.turma, a.codigoSae);
  }

  const professoresSeed = [...infoPorProfessor.entries()].map(([nome, info]) => ({
    nome,
    email: emailFromNome(nome),
    cargaHorariaTotal: info.cargaTotal,
    codigos: [...info.codigos],
  }));

  const professores: Record<string, typeof professoresTable.$inferSelect> = {};
  for (const p of professoresSeed) {
    const [prof] = await db
      .insert(professoresTable)
      .values({
        escolaId: ESCOLA_ID,
        nome: p.nome,
        email: p.email,
        cargaHorariaTotal: p.cargaHorariaTotal,
        ativo: true,
      })
      .returning();
    professores[p.nome] = prof;
    for (const codigoSae of p.codigos) {
      await db.insert(professorDisciplinasTable).values({
        professorId: prof.id,
        disciplinaId: disciplinaPorCodigoInicial[codigoSae].id,
      });
    }
  }
  console.log(`✅ ${professoresSeed.length} professores criados (apenas os confirmados pela escola: ${professoresSeed.map((p) => p.nome).join(", ")})`);

  // ------------------------------------------------------------------
  // 4. SALAS
  // ------------------------------------------------------------------
  const salasSeed = [
    { nome: "Sala 01", tipo: "sala_aula", capacidade: 35 },
    { nome: "Sala 02", tipo: "sala_aula", capacidade: 35 },
    { nome: "Sala 03", tipo: "sala_aula", capacidade: 30 },
    { nome: "Laboratório de Informática", tipo: "laboratorio", capacidade: 25 },
    { nome: "Quadra Poliesportiva", tipo: "quadra", capacidade: 40 },
  ].map((s) => ({ ...s, escolaId: ESCOLA_ID }));
  await db.insert(salasTable).values(salasSeed);
  console.log(`✅ ${salasSeed.length} salas criadas`);

  // ------------------------------------------------------------------
  // 5. CURSOS + MATRIZES CURRICULARES — dados REAIS fornecidos pela
  // escola (ver MATRIZ_REAL no topo do arquivo). Seed exatamente o que
  // foi informado — sem completar com disciplinas que a escola não
  // confirmou. Se a planilha real tiver mais linhas, é só estender
  // MATRIZ_REAL (e TURMA_MATRIZ_CHAVE, se for série/etapa nova).
  // ------------------------------------------------------------------

  // Categoria curricular por etapa (nomenclatura do NexGrade — ver
  // lib/db/src/schema/cursos.ts). Disciplinas comuns da BNCC/Formação
  // Geral Básica entram como base_nacional_comum / formacao_geral_basica;
  // as específicas de itinerário/curso técnico como itinerario_*.
  function categoriaPor(etapa: string, codigoSae: string): string {
    if (etapa === "Ensino Fundamental II") {
      return codigoSae === "PC01" ? "parte_diversificada" : "base_nacional_comum";
    }
    if (etapa === "Ensino Médio Regular") {
      return codigoSae === "1100" || codigoSae === "2700" ? "formacao_geral_basica" : "itinerario_formativo";
    }
    // Ensino Médio Técnico
    return codigoSae === "1100" ? "formacao_geral_basica" : "itinerario_profissionalizante";
  }

  const cursosPorEtapa: Record<string, { nome: string; codigoCurso: string; nivel: string }> = {
    "Ensino Fundamental II": { nome: "Ensino Fundamental II", codigoCurso: "EF2", nivel: "fundamental" },
    "Ensino Médio Regular": { nome: "Ensino Médio Regular", codigoCurso: "EM-REG", nivel: "medio" },
    "Ensino Médio Técnico": { nome: "Ensino Médio Técnico em Administração", codigoCurso: "EM-TEC-ADM", nivel: "tecnico" },
  };

  const cursos: Record<string, typeof cursosTable.$inferSelect> = {};
  for (const [etapa, dadosCurso] of Object.entries(cursosPorEtapa)) {
    const [curso] = await db.insert(cursosTable).values({ escolaId: ESCOLA_ID, ...dadosCurso }).returning();
    cursos[etapa] = curso;
  }

  // Agrupa linhas da matriz por (etapa, série/ano) para criar uma
  // matrizCurricular por combinação, com seus itens.
  const matrizes: Record<string, typeof matrizesCurricularesTable.$inferSelect> = {};
  const gruposMatriz = new Map<string, LinhaMatriz[]>();
  for (const linha of MATRIZ_REAL) {
    const chave = `${linha.etapa}::${linha.serieAno}`;
    if (!gruposMatriz.has(chave)) gruposMatriz.set(chave, []);
    gruposMatriz.get(chave)!.push(linha);
  }

  for (const [chave, linhas] of gruposMatriz) {
    const [etapa, serieAno] = chave.split("::");
    const cargaTotal = linhas.reduce((soma, l) => soma + l.aulas, 0);
    const [matriz] = await db
      .insert(matrizesCurricularesTable)
      .values({ escolaId: ESCOLA_ID, cursoId: cursos[etapa].id, serieAno, cargaHorariaSemanalTotal: cargaTotal })
      .returning();
    matrizes[chave] = matriz;

    const disciplinaPorCodigo = Object.fromEntries(disciplinas.map((d) => [d.codigoSae, d]));
    await db.insert(itensMatrizTable).values(
      linhas.map((l) => ({
        matrizCurricularId: matriz.id,
        disciplinaId: disciplinaPorCodigo[l.codigoSae].id,
        categoriaCurricular: categoriaPor(etapa, l.codigoSae),
        cargaHorariaSemanal: l.aulas,
        obrigatoria: true,
      })),
    );
  }
  console.log(`✅ ${Object.keys(cursos).length} cursos + ${gruposMatriz.size} matrizes curriculares criadas (dados reais, ${MATRIZ_REAL.length} vínculos disciplina↔série)`);

  // ------------------------------------------------------------------
  // 6. TURMAS (nomenclatura real informada pela secretaria escolar,
  // vinculadas à matriz curricular real correspondente)
  // ------------------------------------------------------------------
  const turmasSeed = [
    { nome: "6 Ano A", serie: "6º Ano", turno: TURMA_TURNO["6 Ano A"], matrizChave: TURMA_MATRIZ_CHAVE["6 Ano A"] },
    { nome: "1 Serie A", serie: "1ª Série", turno: TURMA_TURNO["1 Serie A"], matrizChave: TURMA_MATRIZ_CHAVE["1 Serie A"] },
    { nome: "1 Serie Tec ADM", serie: "1ª Série ADM", turno: TURMA_TURNO["1 Serie Tec ADM"], matrizChave: TURMA_MATRIZ_CHAVE["1 Serie Tec ADM"] },
  ];

  const turmas: Record<string, typeof turmasTable.$inferSelect> = {};
  for (const t of turmasSeed) {
    const [turma] = await db
      .insert(turmasTable)
      .values({
        escolaId: ESCOLA_ID,
        nome: t.nome,
        serie: t.serie,
        turno: t.turno,
        anoLetivo: 2026,
        matrizCurricularId: matrizes[t.matrizChave].id,
      })
      .returning();
    turmas[t.nome] = turma;
  }
  console.log(`✅ ${turmasSeed.length} turmas criadas (6 Ano A, 1 Serie A, 1 Serie Tec ADM), cada uma vinculada à sua matriz real`);

  // Vincula disciplinas às turmas conforme a composição real da matriz de cada uma
  const disciplinaPorCodigo = Object.fromEntries(disciplinas.map((d) => [d.codigoSae, d]));
  for (const t of turmasSeed) {
    const linhas = gruposMatriz.get(t.matrizChave)!;
    for (const l of linhas) {
      await db.insert(turmaDisciplinasTable).values({
        turmaId: turmas[t.nome].id,
        disciplinaId: disciplinaPorCodigo[l.codigoSae].id,
        cargaHorariaSemanalOverride: l.aulas,
      });
    }
  }
  console.log("✅ Disciplinas vinculadas a cada turma conforme a matriz real");

  // ------------------------------------------------------------------
  // 7. HORÁRIOS — gerados SOMENTE para os pares turma+disciplina com
  // professor confirmado (TURMA_PROFESSOR_REAL), respeitando o limite
  // real de Max_Aulas_Dia (ver aviso de schema no topo do arquivo) e
  // sem conflito de professor entre turmas.
  // diaSemana: 1=segunda .. 5=sexta | numeroAula: 1 a 6 (manhã, 07:30–11:55)
  // ------------------------------------------------------------------
  const slotsOcupadosTurma = new Set<string>();
  const slotsOcupadosProf = new Set<string>();
  let totalAulasGeradas = 0;

  for (const atrib of TURMA_PROFESSOR_REAL) {
    const turma = turmas[atrib.turma];
    const prof = professores[atrib.professor];
    const totalAulasSemana = cargaHorariaMatriz(atrib.turma, atrib.codigoSae);
    const aulasPorDia: Record<number, number> = {};
    let colocados = 0;

    for (let dia = 1; dia <= 5 && colocados < totalAulasSemana; dia++) {
      aulasPorDia[dia] = 0;
      for (let aula = 1; aula <= 6 && colocados < totalAulasSemana; aula++) {
        if (aulasPorDia[dia] >= atrib.maxAulasDia) break;
        const chaveTurma = `${turma.id}-${dia}-${aula}`;
        const chaveProf = `${prof.id}-${dia}-${aula}`;
        if (slotsOcupadosTurma.has(chaveTurma) || slotsOcupadosProf.has(chaveProf)) continue;
        slotsOcupadosTurma.add(chaveTurma);
        slotsOcupadosProf.add(chaveProf);
        await db.insert(horariosTable).values({
          escolaId: ESCOLA_ID,
          turmaId: turma.id,
          disciplinaId: disciplinaPorCodigo[atrib.codigoSae].id,
          professorId: prof.id,
          diaSemana: dia,
          numeroAula: aula,
          sala: atrib.turma === "1 Serie Tec ADM" ? "Sala 02" : "Sala 01",
          versaoGrade: "oficial",
        });
        aulasPorDia[dia]++;
        colocados++;
        totalAulasGeradas++;
      }
    }
    if (colocados < totalAulasSemana) {
      console.log(`⚠️  ${atrib.turma}: só coube ${colocados}/${totalAulasSemana} aula(s) de ${atrib.codigoSae} respeitando o limite de ${atrib.maxAulasDia}/dia em 5 dias — considere abrir mais horários (tarde/mais dias) para essa disciplina.`);
    }
  }
  console.log(`✅ ${totalAulasGeradas} aulas geradas para 6 Ano A, 1 Serie A e 1 Serie Tec ADM (sem conflito de professor, respeitando Max_Aulas_Dia)`);

  // Avisa quais itens da matriz real ainda não têm professor confirmado
  for (const [turmaNome, matrizChave] of Object.entries(TURMA_MATRIZ_CHAVE)) {
    const linhas = gruposMatriz.get(matrizChave) ?? [];
    for (const l of linhas) {
      const confirmado = TURMA_PROFESSOR_REAL.some((a) => a.turma === turmaNome && a.codigoSae === l.codigoSae);
      if (!confirmado) {
        console.log(`⚠️  Sem professor confirmado para o código ${l.codigoSae} em "${turmaNome}" — disciplina está na matriz e vinculada à turma, mas sem aula gerada ainda.`);
      }
    }
  }

  // ------------------------------------------------------------------
  // 8. DISPONIBILIDADE — exemplo: professor indisponível na sexta à tarde
  // ------------------------------------------------------------------
  await db.insert(disponibilidadeTable).values({
    professorId: professores["Carlos Souza"].id,
    diaSemana: 5,
    horarioSlot: 6,
    disponivel: false,
    motivo: "Curso de formação continuada",
  });
  console.log("✅ Exemplo de indisponibilidade docente criado");

  console.log("\n🎉 Seed concluído! O NexGrade já tem dados suficientes para testar:");
  console.log("   - 3 planos (Gratuito, Pro, Master)");
  console.log("   - 79 disciplinas com Código SAE real (Ensino Médio + cursos técnicos)");
  console.log(`   - ${professoresSeed.length} professores (só os confirmados pela escola, sem invenção)`);
  console.log("   - 5 salas");
  console.log("   - 3 cursos + 3 matrizes curriculares reais:");
  console.log("       Ensino Fundamental II · 6º Ano");
  console.log("       Ensino Médio Regular · 1ª Série");
  console.log("       Ensino Médio Técnico em Administração · 1ª Série ADM");
  console.log("   - 3 turmas reais (6 Ano A, 1 Serie A, 1 Serie Tec ADM)");
  console.log("   - grade de horário gerada só para as combinações turma+disciplina com professor confirmado");
  console.log("\n⚠️  Reveja os avisos acima: disciplinas da matriz sem professor confirmado ainda, e");
  console.log("   o gap de schema do Max_Aulas_Dia (não é validado pelo motor de horário/conflitos hoje).\n");

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro ao rodar o seed:", err);
  process.exit(1);
});
