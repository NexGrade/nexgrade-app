// achar-todos-duplicados-codigo-sae.cjs
// LEITURA APENAS — nenhuma escrita no banco.
//
// Usa os JSONs já gerados por refinar-classificacao-uso-mario-braga.cjs
// (disciplinas-EM-USO-REAL.json, disciplinas-SO-ITENS-MATRIZ-ORFAO.json,
//  disciplinas-NUNCA-REFERENCIADA.json) e cruza com codigo_sae para achar
// TODOS os pares/grupos duplicados dentro das 248 disciplinas do Mário Braga,
// não só os 3 já conhecidos.
//
// Isso serve para identificar casos em que uma variante está "em uso real"
// e outra variante do MESMO codigo_sae está classificada como órfã/nunca
// referenciada — sinal de que a órfã é só uma cópia mal ligada da mesma
// disciplina, e não deveria simplesmente sumir para o catálogo sem
// registrar essa relação.

const fs = require('fs');
const path = require('path');

function carregar(nome) {
  const p = path.join(__dirname, nome);
  if (!fs.existsSync(p)) {
    console.error(`ERRO: não encontrei ${p}. Rode antes o refinar-classificacao-uso-mario-braga.cjs`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const emUso = carregar('disciplinas-EM-USO-REAL.json').map(d => ({ ...d, grupo: 'EM_USO_REAL' }));
const orfao = carregar('disciplinas-SO-ITENS-MATRIZ-ORFAO.json').map(d => ({ ...d, grupo: 'ORFAO' }));
const nuncaRef = carregar('disciplinas-NUNCA-REFERENCIADA.json').map(d => ({ ...d, grupo: 'NUNCA_REFERENCIADA' }));

const todas = [...emUso, ...orfao, ...nuncaRef];

// Agrupar por codigo_sae (ignorando vazios/null)
const porCodigo = new Map();
for (const d of todas) {
  const cod = d.codigo_sae;
  if (!cod) continue;
  if (!porCodigo.has(cod)) porCodigo.set(cod, []);
  porCodigo.get(cod).push(d);
}

// Filtrar só os codigo_sae com mais de 1 disciplina
const duplicados = [...porCodigo.entries()].filter(([_, arr]) => arr.length > 1);

console.log(`Total de codigo_sae distintos com duplicidade: ${duplicados.length}\n`);

// Casos interessantes: grupos mistos (uma em uso, outra não)
const casosMistos = [];
const casosMesmoGrupo = [];

for (const [codigo, arr] of duplicados) {
  const grupos = new Set(arr.map(d => d.grupo));
  if (grupos.size > 1) {
    casosMistos.push([codigo, arr]);
  } else {
    casosMesmoGrupo.push([codigo, arr]);
  }
}

console.log(`=== CASOS MISTOS (uma variante em uso, outra não) — ${casosMistos.length} ===`);
console.log('Estes são os mais importantes: candidatos a fusão, igual aos 3 pares já achados.\n');
for (const [codigo, arr] of casosMistos) {
  console.log(`codigo_sae ${codigo}:`);
  for (const d of arr) {
    console.log(`  id=${d.id}\t[${d.grupo}]\t${d.nome}`);
  }
  console.log('');
}

console.log(`\n=== CASOS MESMO GRUPO (duplicidade dentro do mesmo status) — ${casosMesmoGrupo.length} ===`);
for (const [codigo, arr] of casosMesmoGrupo) {
  console.log(`codigo_sae ${codigo}: [${arr[0].grupo}]`);
  for (const d of arr) {
    console.log(`  id=${d.id}\t${d.nome}`);
  }
  console.log('');
}

const outPath = path.join(__dirname, 'duplicados-codigo-sae-mario-braga.json');
fs.writeFileSync(outPath, JSON.stringify({ casosMistos, casosMesmoGrupo }, null, 2));
console.log(`\nSalvo em: ${outPath}`);
