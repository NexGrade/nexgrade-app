const { Client } = require("pg");
const fs = require("fs");

const MARIO_BRAGA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // 1) Lista todas as tabelas que tem coluna escola_id
    const tabelasComEscolaId = await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE column_name = 'escola_id' AND table_schema = 'public'
       ORDER BY table_name`,
    );
    console.log(`Tabelas com escola_id encontradas: ${tabelasComEscolaId.rows.length}\n`);

    console.log("=== Contagem por escola em cada tabela ===");
    for (const { table_name } of tabelasComEscolaId.rows) {
      const r = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE escola_id = $1) as mario_braga,
           COUNT(*) FILTER (WHERE escola_id = $2) as arlinda,
           COUNT(*) FILTER (WHERE escola_id NOT IN ($1, $2)) as outro_ou_orfao
         FROM "${table_name}"`,
        [MARIO_BRAGA, ARLINDA],
      );
      const { mario_braga, arlinda, outro_ou_orfao } = r.rows[0];
      const suspeito = Number(outro_ou_orfao) > 0 ? "  <-- CONFERIR" : "";
      console.log(`  ${table_name.padEnd(35)} MB=${mario_braga}  Arlinda=${arlinda}  Outro/orfao=${outro_ou_orfao}${suspeito}`);
    }

    // 2) Verifica se algum professor_disciplinas ou turma_disciplinas
    // cruza um professor/disciplina de uma escola com dado de outra
    // (checagem de integridade referencial cross-tenant)
    console.log("\n=== Checagem de integridade cross-tenant (mais importante) ===");

    const profDiscCruzado = await client.query(
      `SELECT pd.id, p.escola_id as escola_professor, d.escola_id as escola_disciplina
       FROM professor_disciplinas pd
       JOIN professores p ON p.id = pd.professor_id
       JOIN disciplinas d ON d.id = pd.disciplina_id
       WHERE p.escola_id != d.escola_id`,
    );
    console.log(`professor_disciplinas com professor/disciplina de escolas diferentes: ${profDiscCruzado.rows.length}`);
    if (profDiscCruzado.rows.length > 0) console.log(JSON.stringify(profDiscCruzado.rows, null, 2));

    const horarioCruzado = await client.query(
      `SELECT h.id, h.escola_id as escola_horario, p.escola_id as escola_professor, t.escola_id as escola_turma, d.escola_id as escola_disciplina
       FROM horarios h
       JOIN professores p ON p.id = h.professor_id
       JOIN turmas t ON t.id = h.turma_id
       JOIN disciplinas d ON d.id = h.disciplina_id
       WHERE h.escola_id != p.escola_id OR h.escola_id != t.escola_id OR h.escola_id != d.escola_id`,
    );
    console.log(`horarios com professor/turma/disciplina de escola diferente da propria linha: ${horarioCruzado.rows.length}`);
    if (horarioCruzado.rows.length > 0) console.log(JSON.stringify(horarioCruzado.rows.slice(0, 10), null, 2));

    const reservaCruzada = await client.query(
      `SELECT r.id, r.escola_id as escola_reserva, p.escola_id as escola_professor, s.escola_id as escola_sala
       FROM reservas r
       JOIN professores p ON p.id = r.professor_id
       JOIN salas s ON s.id = r.sala_id
       WHERE r.escola_id != p.escola_id OR r.escola_id != s.escola_id`,
    );
    console.log(`reservas com professor/sala de escola diferente da propria linha: ${reservaCruzada.rows.length}`);
    if (reservaCruzada.rows.length > 0) console.log(JSON.stringify(reservaCruzada.rows, null, 2));

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
