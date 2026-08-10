const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\horarios.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  'import {',
  '  horariosTable,',
  '  horariosExperimentaisTable,',
  '  disciplinasTable,',
  '  professoresTable,',
  '  turmaDisciplinasTable,',
  '  professorDisciplinasTable,',
  '  turmasTable,',
  '  disponibilidadeTable,',
  '  limitesDiariosProfessorTable,',
  '  configuracoesTable,',
  '  horarioSlotsTable,',
  '} from "@workspace/db";',
].join("\n");
const PATCH1_NOVO = [
  'import {',
  '  horariosTable,',
  '  horariosExperimentaisTable,',
  '  disciplinasTable,',
  '  professoresTable,',
  '  turmaDisciplinasTable,',
  '  professorDisciplinasTable,',
  '  turmasTable,',
  '  disponibilidadeTable,',
  '  limitesDiariosProfessorTable,',
  '  configuracoesTable,',
  '  horarioSlotsTable,',
  '  itensMatrizTable,',
  '} from "@workspace/db";',
].join("\n");

const PATCH2_ANTIGO = [
  '  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos] = await Promise.all([',
  '    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),',
  '    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),',
  '    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),',
  '    db.select().from(disponibilidadeTable),',
  '    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),',
  '    db.select().from(professorDisciplinasTable),',
  '  ]);',
].join("\n");
const PATCH2_NOVO = [
  '  const matrizIdsAlvo = [...new Set(turmasDoTurno.map((t) => t.matrizCurricularId).filter((id): id is number => id != null))];',
  '  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos, itensMatrizTodos] = await Promise.all([',
  '    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),',
  '    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),',
  '    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),',
  '    db.select().from(disponibilidadeTable),',
  '    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),',
  '    db.select().from(professorDisciplinasTable),',
  '    matrizIdsAlvo.length > 0 ? db.select().from(itensMatrizTable).where(inArray(itensMatrizTable.matrizCurricularId, matrizIdsAlvo)) : Promise.resolve([]),',
  '  ]);',
].join("\n");

const PATCH3_ANTIGO = '  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));';
const PATCH3_NOVO = [
  '  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));',
  '  // [FIX] Fonte da verdade pra carga horaria semanal de uma disciplina',
  '  // NUMA TURMA especifica e itens_matriz (a matriz curricular daquela',
  '  // turma), nao disciplinas.cargaSemanal -- que e so um valor generico',
  '  // da disciplina, sem relacao com a matriz de nenhuma turma em',
  '  // particular. Usar o generico direto fazia o CP-SAT tentar encaixar',
  '  // uma carga totalmente errada sempre que o generico da disciplina',
  '  // nao batia com a matriz real da turma (ex.: Lingua Portuguesa',
  '  // generico=2h vs real da 3D TEC=4h -- confirmado no payload real',
  '  // enviado ao solver, que causava INFEASIBLE sem relacao com',
  '  // disponibilidade nenhuma).',
  '  const itensMatrizMap = new Map(itensMatrizTodos.map((im) => [`${im.matrizCurricularId}-${im.disciplinaId}`, im]));',
].join("\n");

const PATCH4_ANTIGO = '        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,';
const PATCH4_NOVO = '        aulasSemana: td.cargaHorariaSemanalOverride ?? itensMatrizMap.get(`${turma.matrizCurricularId}-${td.disciplinaId}`)?.cargaHorariaSemanal ?? disc?.cargaSemanal ?? 0,';

const PATCHES = [
  { nome: 'Import de itensMatrizTable', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Busca itens_matriz junto com o resto dos dados', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
  { nome: 'Monta o mapa de lookup da matriz real', antigo: PATCH3_ANTIGO, novo: PATCH3_NOVO },
  { nome: 'Usa a matriz real em vez do generico da disciplina', antigo: PATCH4_ANTIGO, novo: PATCH4_NOVO },
];

function main() {
  const bruto = fs.readFileSync(ARQUIVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');
  console.log(`Arquivo usa CRLF: ${usaCRLF}\n`);

  let tudoOk = true;
  for (const p of PATCHES) {
    const antigoNorm = p.antigo.replace(/\r\n/g, '\n');
    const ocorrencias = conteudo.split(antigoNorm).length - 1;
    console.log(`--- ${p.nome} ---`);
    console.log(`Ocorrências: ${ocorrencias}`);
    if (ocorrencias !== 1) {
      console.error(`ERRO: esperava exatamente 1 ocorrência, achei ${ocorrencias}.`);
      tudoOk = false;
      continue;
    }
    conteudo = conteudo.replace(antigoNorm, p.novo.replace(/\r\n/g, '\n'));
    console.log('OK.\n');
  }

  if (!tudoOk) {
    console.error('Algum patch não pôde ser aplicado com segurança. NADA foi gravado.');
    process.exit(1);
  }

  console.log('Todos os patches bateram exatamente 1 ocorrência cada.');

  if (APLICAR) {
    let final = conteudo;
    if (usaCRLF) final = final.replace(/\n/g, '\r\n');
    fs.writeFileSync(`${ARQUIVO}.bak-cargasemanal`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-cargasemanal`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
