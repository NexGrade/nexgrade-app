const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\horarios.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = '  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];';
const PATCH1_NOVO = [
  '  // [FIX] Antes usava um numero fixo (2) como fallback quando a',
  '  // disciplina nao tinha maxAulasConsecutivasDia proprio -- ignorava a',
  '  // configuracao real da escola (seed_pr.max_aulas_geminadas_padrao),',
  '  // que pode ser diferente (ex.: Arlinda usa 3). Isso travava o CP-SAT',
  '  // como "INVIAVEL" sempre que uma disciplina precisava de mais aulas',
  '  // seguidas num dia do que o fallback fixo permitia, mesmo dentro do',
  '  // limite real configurado pela escola.',
  '  const configGeminadasCpsat = await db.select().from(configuracoesTable)',
  '    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_GEMINADAS_PADRAO)))',
  '    .then((r) => r[0]);',
  '  const maxGeminadasPadraoCpsat = typeof configGeminadasCpsat?.valor === "number" ? configGeminadasCpsat.valor : 2;',
  '',
  '  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];',
].join("\n");

const PATCH2_ANTIGO = '        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,';
const PATCH2_NOVO = '        maxAulasDia: td.maxAulasConsecutivasDia ?? maxGeminadasPadraoCpsat,';

const PATCHES = [
  { nome: 'Busca configuracao real de geminadas antes de montar payload', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Usa a configuracao real em vez do numero fixo 2', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
    fs.writeFileSync(`${ARQUIVO}.bak-maxaulasdia`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-maxaulasdia`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
