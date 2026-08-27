const fs = require('fs');
const path = require('path');
const ALVO = path.join('artifacts', 'api-server', 'src', 'routes', 'horarios.ts');
const APLICAR = process.argv.includes('--aplicar');

const EDITS = [
  {
    nome: '1) Heuristico (gerarAlgoritmo): HA agora bloqueia',
    antigo: `  disponibilidades
    .filter(d => !d.disponivel)
    .forEach(d => {`,
    novo: `  disponibilidades
    .filter(d => !d.disponivel || d.horaAtividadeObrigatoria)
    .forEach(d => {`,
  },
  {
    nome: '2) CP-SAT (runCpsatGeneration): HA agora bloqueia',
    antigo: `  const bloqueiosDisponibilidade = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professorId) && !d.disponivel && (d.turno === turno || d.turno == null))`,
    novo: `  const bloqueiosDisponibilidade = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professorId) && (!d.disponivel || d.horaAtividadeObrigatoria) && (d.turno === turno || d.turno == null))`,
  },
  {
    nome: '3) corrigir-professor: HA agora bloqueia na busca de destino',
    antigo: `  const indisponivelSet = new Set(
    disponibilidades.filter((d) => !d.disponivel).map((d) => \`\${d.turno ?? "null"}-\${d.diaSemana}-\${d.horarioSlot}\`),
  );`,
    novo: `  const indisponivelSet = new Set(
    disponibilidades.filter((d) => !d.disponivel || d.horaAtividadeObrigatoria).map((d) => \`\${d.turno ?? "null"}-\${d.diaSemana}-\${d.horarioSlot}\`),
  );`,
  },
];

function main() {
  if (!fs.existsSync(ALVO)) throw new Error(`Arquivo nao encontrado: ${ALVO}`);
  const bruto = fs.readFileSync(ALVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`);
  for (const edit of EDITS) {
    const antigoNorm = edit.antigo.replace(/\r\n/g, '\n');
    const novoNorm = edit.novo.replace(/\r\n/g, '\n');
    const ocorrencias = conteudo.split(antigoNorm).length - 1;
    if (ocorrencias === 0) throw new Error(`[FALHA] "${edit.nome}": trecho nao encontrado.`);
    if (ocorrencias > 1) throw new Error(`[FALHA] "${edit.nome}": aparece ${ocorrencias}x, esperava 1.`);
    conteudo = conteudo.split(antigoNorm).join(novoNorm);
    console.log(`OK ${edit.nome}`);
  }
  const conteudoFinal = usaCRLF ? conteudo.replace(/\n/g, '\r\n') : conteudo;
  if (APLICAR) {
    const backupPath = ALVO + `.backup-${Date.now()}`;
    fs.copyFileSync(ALVO, backupPath);
    fs.writeFileSync(ALVO, conteudoFinal, { encoding: 'utf8' });
    console.log(`\nAplicado. Backup: ${backupPath}`);
  } else {
    fs.writeFileSync(ALVO + '.preview-ha2.ts', conteudoFinal, { encoding: 'utf8' });
    console.log('\nDRY-RUN OK. Preview salvo.');
  }
}
main();
