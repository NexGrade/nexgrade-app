const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\lib\\api-spec\\openapi.yaml';
const APLICAR = process.argv.includes('--aplicar');

const ANTIGO = [
  '    ProfessorCarga:',
  '      type: object',
  '      required: [professorId, totalAulas, porDia]',
  '      properties:',
  '        professorId: { type: integer }',
  '        totalAulas: { type: integer }',
  '        porDia:',
  '          type: object',
  '          additionalProperties: { type: integer }',
].join("\n");
const NOVO = [
  '    ProfessorCarga:',
  '      type: object',
  '      required: [professorId, totalAulas, porDia]',
  '      properties:',
  '        professorId: { type: integer }',
  '        totalAulas: { type: integer }',
  '        porDia:',
  '          type: object',
  '          additionalProperties: { type: integer }',
  '        porTurno:',
  '          type: object',
  '          additionalProperties: { type: integer }',
  '        haInstitucionalPorTurno:',
  '          type: object',
  '          additionalProperties: { type: integer }',
  '        haInstitucionalTotal: { type: integer }',
  '        haAlocadaPorTurno:',
  '          type: object',
  '          additionalProperties: { type: integer }',
  '        bloqueiosResumoPorTurno:',
  '          type: object',
  '          additionalProperties: { type: string }',
  '          description: "Resumo legivel dos horarios bloqueados do professor por turno, ex: Bloqueado Seg (3,4) e Qua (todas)."',
].join("\n");

function main() {
  const bruto = fs.readFileSync(ARQUIVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  const conteudo = bruto.replace(/\r\n/g, '\n');
  const antigoNorm = ANTIGO.replace(/\r\n/g, '\n');

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');
  const ocorrencias = conteudo.split(antigoNorm).length - 1;
  console.log(`Ocorrências: ${ocorrencias}`);
  if (ocorrencias !== 1) {
    console.error(`ERRO: esperava exatamente 1 ocorrência, achei ${ocorrencias}.`);
    process.exit(1);
  }

  let novoConteudo = conteudo.replace(antigoNorm, NOVO.replace(/\r\n/g, '\n'));
  if (usaCRLF) novoConteudo = novoConteudo.replace(/\n/g, '\r\n');

  if (APLICAR) {
    fs.writeFileSync(`${ARQUIVO}.bak-professorcarga`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, novoConteudo, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-professorcarga`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
