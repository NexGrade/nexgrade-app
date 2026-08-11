// Corrige 2 vínculos de professor errados no vespertino da Arlinda,
// causa raiz do INFEASIBLE na geração do turno inteiro (Sharon C S
// com 15h de carga em só 12h de disponibilidade).
//
// Confirmado contra a grade oficial (PDF Urânia - CE ARLINDA TARDE):
//   - 7A / Redação e Leitura (2h): Sharon C S -> Camila F.
//   - 7D / Língua Portuguesa (3h): Sharon C S -> Taisson
//
// DRY-RUN por padrão (mostra o que faria e dá ROLLBACK).
// Só aplica de verdade com a flag --aplicar.
//
// Uso:
//   node lib/db/corrigir-sobrecarga-sharon-vespertino.cjs             (dry-run)
//   node lib/db/corrigir-sobrecarga-sharon-vespertino.cjs --aplicar   (aplica)

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
if (!match) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

// turma_id ainda não sabemos (7A e 7D) — busca por nome + turno dentro do script.
const CORRECOES = [
  { turmaNome: "7A", turno: "vespertino", disciplina: "Redação e Leitura", professorAtual: "Sharon C S", professorCorreto: "Camila F." },
  { turmaNome: "7D", turno: "vespertino", disciplina: "Língua Portuguesa", professorAtual: "Sharon C S", professorCorreto: "Taisson" },
];

async function buscarId(client, tabela, campoNome, valorNome, filtroEscola = true) {
  const where = filtroEscola ? `WHERE escola_id = $1 AND nome = $2` : `WHERE nome = $1`;
  const params = filtroEscola ? [ESCOLA_ARLINDA, valorNome] : [valorNome];
  const res = await client.query(`SELECT id FROM ${tabela} ${where} LIMIT 1`, params);
  return res.rows[0]?.id ?? null;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    for (const c of CORRECOES) {
      const turmaRes = await client.query(
        `SELECT id FROM turmas WHERE escola_id = $1 AND nome = $2 AND turno = $3 LIMIT 1`,
        [ESCOLA_ARLINDA, c.turmaNome, c.turno]
      );
      const turmaId = turmaRes.rows[0]?.id;
      if (!turmaId) {
        console.log(`❌ Turma não encontrada: ${c.turmaNome}/${c.turno} — pulando`);
        continue;
      }

      const disciplinaId = await buscarId(client, "disciplinas", "nome", c.disciplina);
      if (!disciplinaId) {
        console.log(`❌ Disciplina não encontrada: "${c.disciplina}" — pulando`);
        continue;
      }

      const professorAtualId = await buscarId(client, "professores", "nome", c.professorAtual);
      const professorCorretoId = await buscarId(client, "professores", "nome", c.professorCorreto);
      if (!professorCorretoId) {
        console.log(`❌ Professor correto não encontrado: "${c.professorCorreto}" — pulando`);
        continue;
      }

      const vinculo = await client.query(
        `SELECT id, professor_id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [turmaId, disciplinaId]
      );
      if (vinculo.rows.length === 0) {
        console.log(`❌ Vínculo não encontrado: ${c.turmaNome}/${c.disciplina} — pulando`);
        continue;
      }
      const professorAtualNoBanco = vinculo.rows[0].professor_id;
      const estadoEsperado = professorAtualNoBanco === professorAtualId || professorAtualNoBanco === null;
      if (!estadoEsperado) {
        console.log(
          `⚠ ${c.turmaNome}/${c.disciplina} tem professor_id=${professorAtualNoBanco}, esperava ${professorAtualId} (${c.professorAtual}) ou NULL — pulando por segurança`
        );
        continue;
      }
      if (professorAtualNoBanco === null) {
        console.log(`  (nota: vínculo estava com professor_id NULL, não "${c.professorAtual}" — provável fallback no payload do CP-SAT)`);
      }

      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [professorCorretoId, vinculo.rows[0].id]);
      console.log(`✅ ${c.turmaNome} / ${c.disciplina}: "${c.professorAtual}" → "${c.professorCorreto}" (id=${professorCorretoId})`);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ COMMIT realizado — mudanças salvas.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🟡 ROLLBACK (dry-run) — nada foi salvo. Rode com --aplicar para confirmar.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro — ROLLBACK forçado:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
