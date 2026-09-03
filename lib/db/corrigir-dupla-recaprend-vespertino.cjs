// Corrige outro caso de dupla docencia mal extraida: no PDF por turma
// do vespertino, celulas de "Rec. Aprend." mostram os dois professores
// da dupla colados sem "E" no meio (ex: "PEDRO LISIANE"), diferente do
// padrao "X E JULIO" do matutino. O parser usado no
// ressincronizar-vespertino-31-08-a-04-09 pegou so o primeiro nome de
// cada par via fallback de match por primeiro token, perdendo o
// segundo professor em 36 slots.
//
// Uso:
//   node corrigir-dupla-recaprend-vespertino.cjs            -> dry-run
//   node corrigir-dupla-recaprend-vespertino.cjs --aplicar   -> aplica

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURNO = "vespertino";

// {turma, disciplina, dia, numeroAula, par: [nomeCurto1, nomeCurto2]}
const CASOS = [
  {turma:"6TA",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:3,par:["ANDRE","PEDRO"]},
  {turma:"6TA",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:4,par:["ANDRE","PEDRO"]},
  {turma:"6TB",disciplina:"Rec. Aprend. Matemática",dia:1,numeroAula:3,par:["ANDRE","LISIANE"]},
  {turma:"6TB",disciplina:"Rec. Aprend. Matemática",dia:0,numeroAula:4,par:["ANDRE","LISIANE"]},
  {turma:"6TC",disciplina:"Rec. Aprend. Matemática",dia:2,numeroAula:2,par:["PEDRO","LISIANE"]},
  {turma:"6TC",disciplina:"Rec. Aprend. Matemática",dia:0,numeroAula:5,par:["PEDRO","LISIANE"]},
  {turma:"6TD",disciplina:"Rec. Aprend. L. Port",dia:4,numeroAula:1,par:["IVANIR","SILMARA"]},
  {turma:"6TD",disciplina:"Rec. Aprend. L. Port",dia:3,numeroAula:2,par:["IVANIR","SILMARA"]},
  {turma:"6TD",disciplina:"Rec. Aprend. Matemática",dia:1,numeroAula:4,par:["PEDRO","LISIANE"]},
  {turma:"6TD",disciplina:"Rec. Aprend. Matemática",dia:1,numeroAula:5,par:["PEDRO","LISIANE"]},
  {turma:"6TE",disciplina:"Rec. Aprend. L. Port",dia:1,numeroAula:1,par:["IVANIR","SILMARA"]},
  {turma:"6TE",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:1,par:["PEDRO","LISIANE"]},
  {turma:"6TE",disciplina:"Rec. Aprend. Matemática",dia:1,numeroAula:2,par:["PEDRO","LISIANE"]},
  {turma:"6TE",disciplina:"Rec. Aprend. L. Port",dia:3,numeroAula:4,par:["IVANIR","SILMARA"]},
  {turma:"6TF",disciplina:"Rec. Aprend. Matemática",dia:1,numeroAula:1,par:["PEDRO","LISIANE"]},
  {turma:"6TF",disciplina:"Rec. Aprend. Matemática",dia:0,numeroAula:3,par:["PEDRO","LISIANE"]},
  {turma:"6TF",disciplina:"Rec. Aprend. L. Port",dia:3,numeroAula:3,par:["IVANIR","SILMARA"]},
  {turma:"6TF",disciplina:"Rec. Aprend. L. Port",dia:4,numeroAula:3,par:["IVANIR","SILMARA"]},
  {turma:"6TG",disciplina:"Rec. Aprend. Matemática",dia:0,numeroAula:1,par:["PEDRO","LISIANE"]},
  {turma:"6TG",disciplina:"Rec. Aprend. L. Port",dia:3,numeroAula:1,par:["IVANIR","SILMARA"]},
  {turma:"6TG",disciplina:"Rec. Aprend. Matemática",dia:0,numeroAula:2,par:["PEDRO","LISIANE"]},
  {turma:"6TG",disciplina:"Rec. Aprend. L. Port",dia:4,numeroAula:5,par:["IVANIR","SILMARA"]},
  {turma:"6TH",disciplina:"Rec. Aprend. L. Port",dia:2,numeroAula:1,par:["IVANIR","SILMARA"]},
  {turma:"6TH",disciplina:"Rec. Aprend. Matemática",dia:4,numeroAula:3,par:["GILBERTO","LISIANE"]},
  {turma:"6TH",disciplina:"Rec. Aprend. Matemática",dia:4,numeroAula:4,par:["GILBERTO","LISIANE"]},
  {turma:"6TH",disciplina:"Rec. Aprend. L. Port",dia:3,numeroAula:5,par:["IVANIR","SILMARA"]},
  {turma:"6TI",disciplina:"Rec. Aprend. L. Port",dia:1,numeroAula:2,par:["IVANIR","SILMARA"]},
  {turma:"6TI",disciplina:"Rec. Aprend. L. Port",dia:2,numeroAula:2,par:["IVANIR","SILMARA"]},
  {turma:"6TI",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:3,par:["GILBERTO","LISIANE"]},
  {turma:"6TI",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:4,par:["GILBERTO","LISIANE"]},
  {turma:"9TG",disciplina:"Rec. Aprend. Matemática",dia:2,numeroAula:1,par:["GILBERTO","LISIANE"]},
  {turma:"9TG",disciplina:"Rec. Aprend. Matemática",dia:4,numeroAula:5,par:["GILBERTO","LISIANE"]},
  {turma:"9TH",disciplina:"Rec. Aprend. Matemática",dia:4,numeroAula:1,par:["GILBERTO","LISIANE"]},
  {turma:"9TH",disciplina:"Rec. Aprend. Matemática",dia:4,numeroAula:2,par:["GILBERTO","LISIANE"]},
  {turma:"9TI",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:2,par:["GILBERTO","LISIANE"]},
  {turma:"9TI",disciplina:"Rec. Aprend. Matemática",dia:3,numeroAula:5,par:["GILBERTO","LISIANE"]},
];

function normaliza(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const professores = (await client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const turmas = (await client.query(`SELECT id, nome FROM turmas WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID, TURNO])).rows;
    const disciplinas = (await client.query(`SELECT id, nome FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;

    function acharProfessor(nomeCurto) {
      const chave = normaliza(nomeCurto);
      const cands = professores.filter(p => normaliza(p.nome.split(" ")[0]) === chave);
      return cands.length === 1 ? cands[0] : null;
    }

    let inseridos = 0, jaCompletos = 0;
    for (const c of CASOS) {
      const turma = turmas.find(t => t.nome === c.turma);
      const disc = disciplinas.find(d => d.nome === c.disciplina);
      if (!turma || !disc) { console.log(`  [AVISO] turma/disciplina nao encontrada: ${c.turma} / ${c.disciplina}`); continue; }

      const profsResolvidos = c.par.map(acharProfessor);
      if (profsResolvidos.some(p => !p)) {
        console.log(`  [AVISO] nao resolvi algum nome do par [${c.par.join(", ")}] em ${c.turma}/${c.disciplina} dia=${c.dia} aula=${c.numeroAula}`);
        continue;
      }

      const existentes = await client.query(
        `SELECT professor_id FROM horarios WHERE turma_id=$1 AND disciplina_id=$2 AND dia_semana=$3 AND numero_aula=$4`,
        [turma.id, disc.id, c.dia, c.numeroAula]
      );
      const idsExistentes = new Set(existentes.rows.map(r => r.professor_id));

      for (const prof of profsResolvidos) {
        if (idsExistentes.has(prof.id)) continue;
        console.log(`  [INSERE] ${c.turma}/${c.disciplina} dia=${c.dia} aula=${c.numeroAula} -> ${prof.nome}`);
        await client.query(
          `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ESCOLA_ID, turma.id, disc.id, prof.id, c.dia, c.numeroAula]
        );
        inseridos++;
      }
      if (profsResolvidos.every(p => idsExistentes.has(p.id))) jaCompletos++;
    }

    console.log(`\nTotal inserido: ${inseridos} | Ja completos antes: ${jaCompletos}`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\nAPLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
