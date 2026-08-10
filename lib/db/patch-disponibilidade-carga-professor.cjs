const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\professores.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  '  res.json({',
  '    professorId: parsed.data.id,',
  '    totalAulas: slots.length,',
  '    porDia,',
].join("\n");
const PATCH1_NOVO = [
  '  // [FEATURE] Disponibilidade geral (nao so HA) por turno, resumida --',
  '  // pedido pra mostrar carga horaria e disponibilidade juntas na tela',
  '  // de edicao do professor, mesmo padrao usado no relatorio de PDF em',
  '  // routes/export.ts.',
  '  const bloqueiosGerais = await db',
  '    .select()',
  '    .from(disponibilidadeTable)',
  '    .where(and(eq(disponibilidadeTable.professorId, parsed.data.id), eq(disponibilidadeTable.disponivel, false)));',
  '  const bloqueiosPorTurnoMapa = new Map<string, Array<{ dia: number; aula: number }>>();',
  '  bloqueiosGerais.forEach((d) => {',
  '    const turno = d.turno ?? "indefinido";',
  '    if (!bloqueiosPorTurnoMapa.has(turno)) bloqueiosPorTurnoMapa.set(turno, []);',
  '    bloqueiosPorTurnoMapa.get(turno)!.push({ dia: d.diaSemana, aula: d.horarioSlot });',
  '  });',
  '  const bloqueiosResumoPorTurno: Record<string, string> = {};',
  '  for (const [turno, bloqueios] of bloqueiosPorTurnoMapa) {',
  '    bloqueiosResumoPorTurno[turno] = resumoBloqueiosProfessor(bloqueios);',
  '  }',
  '  res.json({',
  '    professorId: parsed.data.id,',
  '    totalAulas: slots.length,',
  '    porDia,',
  '    bloqueiosResumoPorTurno,',
].join("\n");

const PATCH2_ANTIGO = 'router.get("/:id/carga", async (req, res) => {';
const PATCH2_NOVO = [
  '// [FEATURE] Mesma logica de routes/export.ts -- resumo compacto dos',
  '// horarios bloqueados de um professor num turno, agrupado por dia.',
  'const DIAS_ABREV_CARGA = ["Seg", "Ter", "Qua", "Qui", "Sex"];',
  'function resumoBloqueiosProfessor(bloqueios: Array<{ dia: number; aula: number }>): string {',
  '  if (bloqueios.length === 0) return "Sem restricoes registradas";',
  '  const porDia = new Map<number, number[]>();',
  '  for (const b of bloqueios) {',
  '    if (!porDia.has(b.dia)) porDia.set(b.dia, []);',
  '    porDia.get(b.dia)!.push(b.aula);',
  '  }',
  '  const partes = [...porDia.entries()]',
  '    .sort((a, b) => a[0] - b[0])',
  '    .map(([dia, aulas]) => `${DIAS_ABREV_CARGA[dia] ?? dia}a (${aulas.sort((x, y) => x - y).join(",")}a)`);',
  '  return `Bloqueado: ${partes.join(" - ")}`;',
  '}',
  'router.get("/:id/carga", async (req, res) => {',
].join("\n");

const PATCHES = [
  { nome: 'Busca bloqueios gerais e monta resumo por turno', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Adiciona funcao resumoBloqueiosProfessor', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
