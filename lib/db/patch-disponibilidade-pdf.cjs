const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\lib\\pdf-carga-professor.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  'export type PeriodoCargaProfessor = {',
  '  turno: string;',
  '  totalAulas: number;',
  '  haInstitucional: number;',
  '  itens: ItemCargaProfessor[];',
  '};',
].join("\n");
const PATCH1_NOVO = [
  'export type PeriodoCargaProfessor = {',
  '  turno: string;',
  '  totalAulas: number;',
  '  haInstitucional: number;',
  '  itens: ItemCargaProfessor[];',
  '  // [FEATURE] Resumo compacto dos horarios bloqueados do professor',
  '  // nesse turno -- ex.: "Bloqueado: Seg (3,4) - Qua (todas)".',
  '  bloqueiosResumo?: string;',
  '};',
].join("\n");

const PATCH2_ANTIGO = [
  '    altura += periodo.itens.length * 13; // linhas',
].join("\n");
const PATCH2_NOVO = [
  '    altura += periodo.itens.length * 13; // linhas',
  '    if (periodo.bloqueiosResumo) altura += 12; // [FEATURE] linha de disponibilidade',
].join("\n");

const PATCH3_ANTIGO = [
  '      y -= 13;',
  '    }',
  '',
  '    y -= 18;',
  '  }',
  '',
  '  return y - 14;',
].join("\n");
const PATCH3_NOVO = [
  '      y -= 13;',
  '    }',
  '    if (periodo.bloqueiosResumo) {',
  '      y -= 10;',
  '      page.drawText(sanitizarTextoPdf(periodo.bloqueiosResumo), { x: MARGEM + 8, y, size: 7.5, font, color: CINZA_ESCURO });',
  '      y -= 2;',
  '    }',
  '',
  '    y -= 18;',
  '  }',
  '',
  '  return y - 14;',
].join("\n");

const PATCHES = [
  { nome: 'Adiciona bloqueiosResumo ao tipo PeriodoCargaProfessor', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Reserva altura extra pra linha de disponibilidade', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
  { nome: 'Desenha a linha de disponibilidade apos a tabela', antigo: PATCH3_ANTIGO, novo: PATCH3_NOVO },
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
    fs.writeFileSync(`${ARQUIVO}.bak-disponibilidade`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-disponibilidade`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
