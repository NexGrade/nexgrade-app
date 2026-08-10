const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\cpsat-service\\app\\solver.py';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  '@dataclass',
  'class DisciplinaTurma:',
  '    turma: str',
  '    codigo_sae: str',
  '    nome: str',
  '    aulas_semana: int',
  '    professor: str',
  '    max_aulas_dia: int',
].join("\n");
const PATCH1_NOVO = [
  '@dataclass',
  'class DisciplinaTurma:',
  '    turma: str',
  '    codigo_sae: str',
  '    nome: str',
  '    aulas_semana: int',
  '    professor: str',
  '    max_aulas_dia: int',
  '    # [FIX] Limite de aula pra turmas de nivel de ensino diferente',
  '    # dentro do mesmo turno (ex.: Fundamental=5 aulas/dia,',
  '    # Medio/Tecnico=6 aulas/dia no mesmo matutino). None = usa',
  '    # aulas_por_dia do turno inteiro (comportamento antigo).',
  '    ultima_aula_turma: int | None = None',
].join("\n");

const PATCH2_ANTIGO = [
  '            aulas_semana=d["aulasSemana"],',
  '            professor=d["professor"],',
  '            max_aulas_dia=d["maxAulasDia"],',
  '        )',
].join("\n");
const PATCH2_NOVO = [
  '            aulas_semana=d["aulasSemana"],',
  '            professor=d["professor"],',
  '            max_aulas_dia=d["maxAulasDia"],',
  '            ultima_aula_turma=d.get("ultimaAulaTurma"),',
  '        )',
].join("\n");

const PATCH3_ANTIGO = [
  '    for dt_idx, dt in enumerate(disciplinas_turma):',
  '        for (prof, dia, aula) in bloqueios:',
  '            if dt.professor == prof and 1 <= aula <= aulas_por_dia:',
  '                model.Add(aula_var[(dt_idx, dia, aula)] == 0)',
].join("\n");
const PATCH3_NOVO = [
  '    for dt_idx, dt in enumerate(disciplinas_turma):',
  '        for (prof, dia, aula) in bloqueios:',
  '            if dt.professor == prof and 1 <= aula <= aulas_por_dia:',
  '                model.Add(aula_var[(dt_idx, dia, aula)] == 0)',
  '',
  '    # limite de aula por nivel de ensino da turma (ex.: Fundamental com',
  '    # menos aulas por dia que Medio/Tecnico no mesmo turno)',
  '    for dt_idx, dt in enumerate(disciplinas_turma):',
  '        if dt.ultima_aula_turma is None or dt.ultima_aula_turma >= aulas_por_dia:',
  '            continue',
  '        for dia in range(len(DIAS)):',
  '            for aula in range(dt.ultima_aula_turma + 1, aulas_por_dia + 1):',
  '                model.Add(aula_var[(dt_idx, dia, aula)] == 0)',
].join("\n");

const PATCHES = [
  { nome: 'Campo ultima_aula_turma no dataclass', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Mapeia ultimaAulaTurma do JSON', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
  { nome: 'Nova restricao 7 -- limite por nivel de ensino', antigo: PATCH3_ANTIGO, novo: PATCH3_NOVO },
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
    fs.writeFileSync(`${ARQUIVO}.bak-nivelensino`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-nivelensino`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
