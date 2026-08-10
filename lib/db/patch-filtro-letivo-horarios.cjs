const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\horarios.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCHES = [
  {
    nome: 'Filtro 1 (gerarAlgoritmo, linha ~103)',
    antigo: 'const AULAS_VALIDAS_TURMA = new Set(slotsDoTurno.map(s => s.numeroAula).filter(n => n >= 1));',
    novo: 'const AULAS_VALIDAS_TURMA = new Set(slotsDoTurno.filter(s => s.letivo).map(s => s.numeroAula));',
  },
  {
    nome: 'Filtro 2 (helper de validacao, linha ~562)',
    antigo: 'return new Set(slots.map(s => s.numeroAula).filter(n => n >= 1));',
    novo: 'return new Set(slots.filter(s => s.letivo).map(s => s.numeroAula));',
  },
  {
    nome: 'Filtro 3 (rota /gerar-cpsat, linha ~1112-1114)',
    antigo: [
      '      .filter((hs) => hs.turno === turno && (turno !== "matutino" || hs.nivelEnsino === nivel))',
      '      .map((hs) => hs.numeroAula)',
      '      .filter((n) => n >= 1);',
    ].join("\n"),
    novo: [
      '      .filter((hs) => hs.turno === turno && (turno !== "matutino" || hs.nivelEnsino === nivel) && hs.letivo)',
      '      .map((hs) => hs.numeroAula);',
    ].join("\n"),
  },
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
    fs.writeFileSync(`${ARQUIVO}.bak-letivo`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-letivo`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
