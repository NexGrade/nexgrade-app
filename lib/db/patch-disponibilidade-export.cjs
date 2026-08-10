const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\export.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = [
  '      const itens = [...grupos.values()].sort((a, b) => a.turma.localeCompare(b.turma, "pt-BR"));',
  '',
  '      return { turno, totalAulas: slotsTurno.length, haInstitucional: haTurno, itens };',
  '    });',
].join("\n");
const PATCH1_NOVO = [
  '      const itens = [...grupos.values()].sort((a, b) => a.turma.localeCompare(b.turma, "pt-BR"));',
  '',
  '      // [FEATURE] Resumo de disponibilidade por turno -- pedido pra',
  '      // acompanhar carga horaria e disponibilidade juntas no mesmo',
  '      // relatorio, sem precisar abrir a tela de Disponibilidade separada',
  '      // pra cada professor.',
  '      const bloqueiosTurno = disponibilidades',
  '        .filter((d) => d.professorId === prof.id && d.turno === turno && !d.disponivel)',
  '        .map((d) => ({ dia: d.diaSemana, aula: d.horarioSlot }));',
  '      const bloqueiosResumo = resumoBloqueios(bloqueiosTurno);',
  '      return { turno, totalAulas: slotsTurno.length, haInstitucional: haTurno, itens, bloqueiosResumo };',
  '    });',
].join("\n");

const PATCH2_ANTIGO = 'async function buscarNomeEscola(escolaId: string): Promise<string> {';
const PATCH2_NOVO = [
  '// [FEATURE] Monta um resumo compacto dos horarios bloqueados de um',
  '// professor num turno, agrupado por dia -- ex.: "Seg (3,4) e Qua',
  '// (todas)". Usado no relatorio de carga horaria por professor pra',
  '// mostrar carga E disponibilidade juntas.',
  'const DIAS_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex"];',
  'function resumoBloqueios(bloqueios: Array<{ dia: number; aula: number }>): string {',
  '  if (bloqueios.length === 0) return "Sem restricoes registradas";',
  '  const porDia = new Map<number, number[]>();',
  '  for (const b of bloqueios) {',
  '    if (!porDia.has(b.dia)) porDia.set(b.dia, []);',
  '    porDia.get(b.dia)!.push(b.aula);',
  '  }',
  '  const partes = [...porDia.entries()]',
  '    .sort((a, b) => a[0] - b[0])',
  '    .map(([dia, aulas]) => `${DIAS_ABREV[dia] ?? dia}a (${aulas.sort((x, y) => x - y).join(",")}a)`);',
  '  return `Bloqueado: ${partes.join(" - ")}`;',
  '}',
  'async function buscarNomeEscola(escolaId: string): Promise<string> {',
].join("\n");

const PATCHES = [
  { nome: 'Adiciona bloqueiosResumo ao objeto do periodo', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Adiciona funcao resumoBloqueios', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
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
