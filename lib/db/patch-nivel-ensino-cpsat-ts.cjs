const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\horarios.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  '  const maxGeminadasPadraoCpsat = typeof configGeminadasCpsat?.valor === "number" ? configGeminadasCpsat.valor : 2;',
  '',
  '  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];',
].join("\n");
const PATCH1_NOVO = [
  '  const maxGeminadasPadraoCpsat = typeof configGeminadasCpsat?.valor === "number" ? configGeminadasCpsat.valor : 2;',
  '',
  '  // [FIX] Escolas que misturam Fundamental e Medio/Tecnico no mesmo',
  '  // turno (ex.: matutino com 9o ano de 5 aulas/dia e Ensino Medio de 6',
  '  // aulas/dia) tem horario_slots com nivelEnsino diferentes por turma.',
  '  // Sem isso, o CP-SAT recebia um unico aulasPorDia pro turno inteiro',
  '  // (o maior dos dois) e usava o periodo extra tambem pras turmas do',
  '  // nivel menor -- gerando aula de verdade num horario que nao deveria',
  '  // nem existir pra elas (constatado na 9C, Arlinda: aula real gerada',
  '  // na 6a aula de quarta/quinta/sexta, quando o 9o ano so tem 5 aulas',
  '  // configuradas em horario_slots).',
  '  const maxAulaPorNivelEnsino = new Map<string, number>();',
  '  for (const slot of horarioSlotsTurno) {',
  '    if (!slot.letivo) continue;',
  '    const chave = slot.nivelEnsino ?? "__sem_nivel__";',
  '    const atual = maxAulaPorNivelEnsino.get(chave) ?? 0;',
  '    if (slot.numeroAula > atual) maxAulaPorNivelEnsino.set(chave, slot.numeroAula);',
  '  }',
  '  let maxAulaGlobalFallback = 0;',
  '  for (const v of maxAulaPorNivelEnsino.values()) if (v > maxAulaGlobalFallback) maxAulaGlobalFallback = v;',
  '  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];',
].join("\n");

const PATCH2_ANTIGO = [
  '        professor: prof.nome,',
  '        maxAulasDia: td.maxAulasConsecutivasDia ?? maxGeminadasPadraoCpsat,',
  '      };',
].join("\n");
const PATCH2_NOVO = [
  '        professor: prof.nome,',
  '        maxAulasDia: td.maxAulasConsecutivasDia ?? maxGeminadasPadraoCpsat,',
  '        ultimaAulaTurma: maxAulaPorNivelEnsino.get(turma.nivelEnsino ?? "__sem_nivel__") ?? maxAulaGlobalFallback,',
  '      };',
].join("\n");

const PATCHES = [
  { nome: 'Calcula o maximo de aula por nivel de ensino', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Adiciona ultimaAulaTurma em cada disciplina do payload', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
