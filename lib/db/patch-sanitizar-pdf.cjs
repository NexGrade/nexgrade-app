const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\lib\\pdf-grade.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  'function truncar(texto: string, max: number): string {',
  '  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;',
  '}',
].join("\n");
const PATCH1_NOVO = [
  '// [FIX] Blindagem contra caractere corrompido em qualquer texto que',
  '// vai pro PDF (nome de escola, titulo do documento, etc). A fonte',
  '// padrao do pdf-lib (WinAnsiEncoding) so desenha um conjunto limitado',
  '// de caracteres -- se um campo no banco tiver sofrido corrupcao de',
  '// encoding em algum momento (ex.: import antigo com charset errado),',
  '// ele guarda um caractere de substituicao (U+FFFD) que faz o pdf-lib',
  '// lancar excecao na hora de desenhar, derrubando a exportacao inteira',
  '// com erro 500 -- mesmo que o resto dos dados esteja perfeito. Achado',
  '// via caso real: nome_fantasia do Mario Braga tinha um U+FFFD no lugar',
  '// do "a" de "Mario", quebrando os 4 geradores de PDF que usam',
  '// buscarNomeEscola. Aplica em qualquer escola, nao so nesse caso.',
  'export function sanitizarTextoPdf(texto: string): string {',
  '  return texto.replace(/[\\uFFFD]/g, "").replace(/[^\\x20-\\x7E\\xA0-\\xFF]/g, "?");',
  '}',
  'function truncar(texto: string, max: number): string {',
  '  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;',
  '}',
].join("\n");

const PATCH2_ANTIGO = [
  'function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, tituloDocumento: string, intervaloData: string) {',
  '  page.drawRectangle({ x: 0, y: ALTURA - ALTURA_CABECALHO_PAGINA, width: LARGURA, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });',
  '  page.drawText(nomeEscola, { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });',
  '  page.drawText(tituloDocumento, { x: MARGEM, y: ALTURA - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });',
].join("\n");
const PATCH2_NOVO = [
  'function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, tituloDocumento: string, intervaloData: string) {',
  '  page.drawRectangle({ x: 0, y: ALTURA - ALTURA_CABECALHO_PAGINA, width: LARGURA, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });',
  '  page.drawText(sanitizarTextoPdf(nomeEscola), { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });',
  '  page.drawText(sanitizarTextoPdf(tituloDocumento), { x: MARGEM, y: ALTURA - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });',
].join("\n");

const PATCHES = [
  { nome: 'Adiciona funcao sanitizarTextoPdf', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Aplica sanitizacao no cabecalho (nomeEscola + titulo)', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
