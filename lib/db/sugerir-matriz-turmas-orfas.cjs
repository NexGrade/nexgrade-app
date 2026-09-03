/**
 * sugerir-matriz-turmas-orfas.cjs
 * SO LEITURA -- para cada turma SEM matriz vinculada (matriz_curricular_id
 * IS NULL), compara as disciplinas que ela ja tem contra todas as
 * matrizes curriculares cadastradas da mesma escola, e sugere a que
 * mais bate (por similaridade de Jaccard no conjunto de disciplinas).
 * NAO aplica nada sozinho -- so mostra as sugestoes pra confirmacao
 * manual (via tela Editar Turma, selecionando Curso/Serie certo).
 *
 * Uso:
 *   node sugerir-matriz-turmas-orfas.cjs --escola=mario-braga
 *   node sugerir-matriz-turmas-orfas.cjs --escola=arlinda
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLAS = {
  "mario-braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "arlinda": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, ".env");
  const envPathAlt = path.join("lib", "db", ".env");
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, "utf8");
  const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL não encontrada no .env");
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return { escola: args.escola ?? "mario-braga" };
}

function jaccard(setA, setB) {
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const uniao = new Set([...setA, ...setB]).size;
  return uniao === 0 ? 0 : inter / uniao;
}

async function main() {
  const { escola } = parseArgs();
  const escolaId = ESCOLAS[escola];
  if (!escolaId) {
    console.error(`Escola "${escola}" não reconhecida. Opções: ${Object.keys(ESCOLAS).join(", ")}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const turmasOrfas = (await client.query(
      `SELECT id, nome, turno FROM turmas WHERE escola_id = $1 AND matriz_curricular_id IS NULL ORDER BY nome`,
      [escolaId]
    )).rows;

    if (turmasOrfas.length === 0) {
      console.log("Nenhuma turma sem matriz vinculada -- nada a sugerir.");
      return;
    }

    const turmaDiscsTodos = (await client.query(
      `SELECT td.turma_id, td.disciplina_id FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id WHERE t.escola_id = $1`,
      [escolaId]
    )).rows;
    const discsPorTurma = new Map();
    for (const r of turmaDiscsTodos) {
      if (!discsPorTurma.has(r.turma_id)) discsPorTurma.set(r.turma_id, new Set());
      discsPorTurma.get(r.turma_id).add(r.disciplina_id);
    }

    const matrizes = (await client.query(
      `SELECT mc.id, mc.serie_ano, mc.curso_id, c.nome AS curso_nome, c.nivel
       FROM matrizes_curriculares mc
       JOIN cursos c ON c.id = mc.curso_id
       WHERE mc.escola_id = $1`,
      [escolaId]
    )).rows;

    const itensTodos = (await client.query(
      `SELECT im.matriz_curricular_id, im.disciplina_id FROM itens_matriz im
       JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id
       WHERE mc.escola_id = $1`,
      [escolaId]
    )).rows;
    const discsPorMatriz = new Map();
    for (const r of itensTodos) {
      if (!discsPorMatriz.has(r.matriz_curricular_id)) discsPorMatriz.set(r.matriz_curricular_id, new Set());
      discsPorMatriz.get(r.matriz_curricular_id).add(r.disciplina_id);
    }

    console.log(`=== ${escola} — ${turmasOrfas.length} turma(s) sem matriz vinculada ===\n`);

    for (const turma of turmasOrfas) {
      const discsTurma = discsPorTurma.get(turma.id) ?? new Set();
      if (discsTurma.size === 0) {
        console.log(`${turma.nome} (${turma.turno}): SEM disciplinas cadastradas -- nada pra comparar\n`);
        continue;
      }
      const candidatos = matrizes
        .map((m) => ({
          matriz: m,
          score: jaccard(discsTurma, discsPorMatriz.get(m.id) ?? new Set()),
        }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      console.log(`${turma.nome} (${turma.turno}) — ${discsTurma.size} disciplina(s) atual(is):`);
      if (candidatos.length === 0) {
        console.log(`  Nenhuma matriz com disciplinas em comum -- não deu pra sugerir nada.\n`);
        continue;
      }
      for (const c of candidatos) {
        const pct = (c.score * 100).toFixed(0);
        const exato = c.score === 1 ? " <<< MATCH EXATO" : "";
        console.log(`  [${pct}%] ${c.matriz.curso_nome} — ${c.matriz.serie_ano} (nível ${c.matriz.nivel}, matriz id=${c.matriz.id})${exato}`);
      }
      console.log("");
    }

    console.log("Nada foi alterado no banco -- isso é só sugestão. Pra religar de verdade,");
    console.log("usar a tela Editar Turma e selecionar Curso/Série manualmente (a correção");
    console.log("de hoje já evita que isso se perca de novo depois).");
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
