const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\lib\\pdf-carga-professor.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = 'function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, intervaloData: string) {';
const PATCH1_NOVO = [
  '// [FIX] Blindagem contra caractere corrompido em qualquer texto do',
  '// PDF -- ver explicacao completa em pdf-grade.ts (mesmo padrao,',
  '// achado via caso real: nome_fantasia com U+FFFD quebrando os 4',
  '// geradores de PDF que usam buscarNomeEscola).',
  'function sanitizarTextoPdf(texto: string): string {',
  '  return texto.replace(/[\\uFFFD]/g, "").replace(/[^\\x20-\\x7E\\xA0-\\xFF]/g, "?");',
  '}',
  'function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, intervaloData: string) {',
].join("\n");

const PATCH2_ANTIGO = '  page.drawText(nomeEscola, { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });';
const PATCH2_NOVO = '  page.drawText(sanitizarTextoPdf(nomeEscola), { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });';

const PATCHES = [
  { nome: 'Adiciona funcao sanitizarTextoPdf', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Aplica sanitizacao no nomeEscola', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
    fs.writeFileSync(`${ARQUIVO}.bak-sanitizar`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-sanitizar`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
