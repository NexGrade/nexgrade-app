// Substitui TODA a grade do NOTURNO pelos dados extraidos do PDF
// "por turma" do Urania -- PERIODO 31/08 A 04/09. Mesmo padrao do
// ressincronizar-matutino-completo.cjs.
//
// Uso:
//   node ressincronizar-noturno-completo.cjs            -> dry-run (ROLLBACK)
//   node ressincronizar-noturno-completo.cjs --aplicar   -> aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURNO = "noturno";

const DADOS = [{"turma": "1NB", "disciplina": "Educação Física", "dia": 0, "numeroAula": 2, "professor_pdf": "ELISANGELA"}, {"turma": "1NB", "disciplina": "Matemática", "dia": 1, "numeroAula": 2, "professor_pdf": "ANDERSON"}, {"turma": "1NB", "disciplina": "Biologia", "dia": 2, "numeroAula": 2, "professor_pdf": "RODRIGO"}, {"turma": "1NB", "disciplina": "Química", "dia": 3, "numeroAula": 2, "professor_pdf": "VIVIANE"}, {"turma": "1NB", "disciplina": "Educação Financeira", "dia": 4, "numeroAula": 2, "professor_pdf": "ARNALDO"}, {"turma": "1NB", "disciplina": "Matemática", "dia": 0, "numeroAula": 3, "professor_pdf": "ANDERSON"}, {"turma": "1NB", "disciplina": "Educação Física", "dia": 1, "numeroAula": 3, "professor_pdf": "ELISANGELA"}, {"turma": "1NB", "disciplina": "Hibrida", "dia": 2, "numeroAula": 3, "professor_pdf": "HIBRIDA-1NB"}, {"turma": "1NB", "disciplina": "Língua Inglesa", "dia": 3, "numeroAula": 3, "professor_pdf": "ELIANE"}, {"turma": "1NB", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 3, "professor_pdf": "IVETE"}, {"turma": "1NB", "disciplina": "Geografia", "dia": 0, "numeroAula": 4, "professor_pdf": "DORIVAL"}, {"turma": "1NB", "disciplina": "Língua Portuguesa", "dia": 1, "numeroAula": 4, "professor_pdf": "IVETE"}, {"turma": "1NB", "disciplina": "Geografia", "dia": 2, "numeroAula": 4, "professor_pdf": "DORIVAL"}, {"turma": "1NB", "disciplina": "Língua Inglesa", "dia": 3, "numeroAula": 4, "professor_pdf": "ELIANE"}, {"turma": "1NB", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 4, "professor_pdf": "IVETE"}, {"turma": "1NB", "disciplina": "Educação Digital", "dia": 0, "numeroAula": 5, "professor_pdf": "VIVIANE"}, {"turma": "1NB", "disciplina": "Matemática", "dia": 1, "numeroAula": 5, "professor_pdf": "ANDERSON"}, {"turma": "1NB", "disciplina": "Matemática", "dia": 2, "numeroAula": 5, "professor_pdf": "ANDERSON"}, {"turma": "1NB", "disciplina": "Educação Digital", "dia": 3, "numeroAula": 5, "professor_pdf": "VIVIANE"}, {"turma": "1NB", "disciplina": "Arte", "dia": 4, "numeroAula": 5, "professor_pdf": "ROBERVAL"}, {"turma": "1NB", "disciplina": "Língua Portuguesa", "dia": 0, "numeroAula": 6, "professor_pdf": "IVETE"}, {"turma": "1NB", "disciplina": "Química", "dia": 1, "numeroAula": 6, "professor_pdf": "VIVIANE"}, {"turma": "1NB", "disciplina": "Biologia", "dia": 2, "numeroAula": 6, "professor_pdf": "RODRIGO"}, {"turma": "1NB", "disciplina": "Educação Financeira", "dia": 3, "numeroAula": 6, "professor_pdf": "ARNALDO"}, {"turma": "1NB", "disciplina": "Arte", "dia": 4, "numeroAula": 6, "professor_pdf": "ROBERVAL"}, {"turma": "2NB", "disciplina": "Sociologia", "dia": 0, "numeroAula": 2, "professor_pdf": "WILLIAN"}, {"turma": "2NB", "disciplina": "Filosofia", "dia": 1, "numeroAula": 2, "professor_pdf": "SYPRIANO"}, {"turma": "2NB", "disciplina": "Língua Portuguesa", "dia": 2, "numeroAula": 2, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NB", "disciplina": "Educação Financeira", "dia": 3, "numeroAula": 2, "professor_pdf": "ARNALDO"}, {"turma": "2NB", "disciplina": "Arte", "dia": 4, "numeroAula": 2, "professor_pdf": "ROBERVAL"}, {"turma": "2NB", "disciplina": "Hibrida", "dia": 0, "numeroAula": 3, "professor_pdf": "HIBRIDA-2NB"}, {"turma": "2NB", "disciplina": "Matemática", "dia": 1, "numeroAula": 3, "professor_pdf": "ANDERSON"}, {"turma": "2NB", "disciplina": "Matemática", "dia": 2, "numeroAula": 3, "professor_pdf": "ANDERSON"}, {"turma": "2NB", "disciplina": "Sociologia", "dia": 3, "numeroAula": 3, "professor_pdf": "WILLIAN"}, {"turma": "2NB", "disciplina": "História", "dia": 4, "numeroAula": 3, "professor_pdf": "DAIANE"}, {"turma": "2NB", "disciplina": "Filosofia", "dia": 0, "numeroAula": 4, "professor_pdf": "SYPRIANO"}, {"turma": "2NB", "disciplina": "Língua Inglesa", "dia": 1, "numeroAula": 4, "professor_pdf": "ELIANE"}, {"turma": "2NB", "disciplina": "Língua Portuguesa", "dia": 2, "numeroAula": 4, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NB", "disciplina": "Arte", "dia": 3, "numeroAula": 4, "professor_pdf": "ROBERVAL"}, {"turma": "2NB", "disciplina": "Educação Financeira", "dia": 4, "numeroAula": 4, "professor_pdf": "ARNALDO"}, {"turma": "2NB", "disciplina": "Matemática", "dia": 0, "numeroAula": 5, "professor_pdf": "ANDERSON"}, {"turma": "2NB", "disciplina": "Física", "dia": 1, "numeroAula": 5, "professor_pdf": "JOÃO LUCAS"}, {"turma": "2NB", "disciplina": "Educação Física", "dia": 2, "numeroAula": 5, "professor_pdf": "ELISANGELA"}, {"turma": "2NB", "disciplina": "Língua Inglesa", "dia": 3, "numeroAula": 5, "professor_pdf": "ELIANE"}, {"turma": "2NB", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 5, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NB", "disciplina": "Educação Física", "dia": 0, "numeroAula": 6, "professor_pdf": "ELISANGELA"}, {"turma": "2NB", "disciplina": "Física", "dia": 1, "numeroAula": 6, "professor_pdf": "JOÃO LUCAS"}, {"turma": "2NB", "disciplina": "Matemática", "dia": 2, "numeroAula": 6, "professor_pdf": "ANDERSON"}, {"turma": "2NB", "disciplina": "Língua Portuguesa", "dia": 3, "numeroAula": 6, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NB", "disciplina": "História", "dia": 4, "numeroAula": 6, "professor_pdf": "DAIANE"}, {"turma": "2NC", "disciplina": "Filosofia", "dia": 0, "numeroAula": 2, "professor_pdf": "SYPRIANO"}, {"turma": "2NC", "disciplina": "Língua Portuguesa", "dia": 1, "numeroAula": 2, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NC", "disciplina": "Educação Física", "dia": 2, "numeroAula": 2, "professor_pdf": "ELISANGELA"}, {"turma": "2NC", "disciplina": "Língua Portuguesa", "dia": 3, "numeroAula": 2, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NC", "disciplina": "História", "dia": 4, "numeroAula": 2, "professor_pdf": "DAIANE"}, {"turma": "2NC", "disciplina": "Hibrida", "dia": 0, "numeroAula": 3, "professor_pdf": "HIBRIDA-2NC"}, {"turma": "2NC", "disciplina": "Filosofia", "dia": 1, "numeroAula": 3, "professor_pdf": "SYPRIANO"}, {"turma": "2NC", "disciplina": "Língua Portuguesa", "dia": 2, "numeroAula": 3, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NC", "disciplina": "Educação Financeira", "dia": 3, "numeroAula": 3, "professor_pdf": "ARNALDO"}, {"turma": "2NC", "disciplina": "Arte", "dia": 4, "numeroAula": 3, "professor_pdf": "ROBERVAL"}, {"turma": "2NC", "disciplina": "Sociologia", "dia": 0, "numeroAula": 4, "professor_pdf": "WILLIAN"}, {"turma": "2NC", "disciplina": "Matemática", "dia": 1, "numeroAula": 4, "professor_pdf": "CARLOS"}, {"turma": "2NC", "disciplina": "Matemática", "dia": 2, "numeroAula": 4, "professor_pdf": "CARLOS"}, {"turma": "2NC", "disciplina": "Matemática", "dia": 3, "numeroAula": 4, "professor_pdf": "CARLOS"}, {"turma": "2NC", "disciplina": "Arte", "dia": 4, "numeroAula": 4, "professor_pdf": "ROBERVAL"}, {"turma": "2NC", "disciplina": "Física", "dia": 0, "numeroAula": 5, "professor_pdf": "JOÃO LUCAS"}, {"turma": "2NC", "disciplina": "Língua Inglesa", "dia": 1, "numeroAula": 5, "professor_pdf": "ELIANE"}, {"turma": "2NC", "disciplina": "Matemática", "dia": 2, "numeroAula": 5, "professor_pdf": "CARLOS"}, {"turma": "2NC", "disciplina": "Sociologia", "dia": 3, "numeroAula": 5, "professor_pdf": "WILLIAN"}, {"turma": "2NC", "disciplina": "História", "dia": 4, "numeroAula": 5, "professor_pdf": "DAIANE"}, {"turma": "2NC", "disciplina": "Física", "dia": 0, "numeroAula": 6, "professor_pdf": "JOÃO LUCAS"}, {"turma": "2NC", "disciplina": "Língua Portuguesa", "dia": 1, "numeroAula": 6, "professor_pdf": "ANTONIO SILVA"}, {"turma": "2NC", "disciplina": "Educação Física", "dia": 2, "numeroAula": 6, "professor_pdf": "ELISANGELA"}, {"turma": "2NC", "disciplina": "Língua Inglesa", "dia": 3, "numeroAula": 6, "professor_pdf": "ELIANE"}, {"turma": "2NC", "disciplina": "Educação Financeira", "dia": 4, "numeroAula": 6, "professor_pdf": "ARNALDO"}, {"turma": "3NB", "disciplina": "Química I", "dia": 0, "numeroAula": 2, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Educação Física", "dia": 1, "numeroAula": 2, "professor_pdf": "ELISANGELA"}, {"turma": "3NB", "disciplina": "Matemática", "dia": 2, "numeroAula": 2, "professor_pdf": "CARLOS"}, {"turma": "3NB", "disciplina": "Rec. Aprend. Matemática", "dia": 3, "numeroAula": 2, "professor_pdf": "CARLOS"}, {"turma": "3NB", "disciplina": "Rec. Aprend. L. Port", "dia": 4, "numeroAula": 2, "professor_pdf": "IVETE"}, {"turma": "3NB", "disciplina": "Física", "dia": 0, "numeroAula": 3, "professor_pdf": "JOÃO LUCAS"}, {"turma": "3NB", "disciplina": "Biologia II", "dia": 1, "numeroAula": 3, "professor_pdf": "CLEIDE"}, {"turma": "3NB", "disciplina": "Educação Física", "dia": 2, "numeroAula": 3, "professor_pdf": "ELISANGELA"}, {"turma": "3NB", "disciplina": "Educação Financeira", "dia": 3, "numeroAula": 3, "professor_pdf": "GEVERSON"}, {"turma": "3NB", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 3, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NB", "disciplina": "Física III", "dia": 0, "numeroAula": 4, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Biologia II", "dia": 1, "numeroAula": 4, "professor_pdf": "CLEIDE"}, {"turma": "3NB", "disciplina": "Química I", "dia": 2, "numeroAula": 4, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Projeto de Vida", "dia": 3, "numeroAula": 4, "professor_pdf": "FELIPE"}, {"turma": "3NB", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 4, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NB", "disciplina": "Matemática", "dia": 0, "numeroAula": 5, "professor_pdf": "CARLOS"}, {"turma": "3NB", "disciplina": "Física II", "dia": 1, "numeroAula": 5, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Física III", "dia": 2, "numeroAula": 5, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Língua Portuguesa", "dia": 3, "numeroAula": 5, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NB", "disciplina": "Rec. Aprend. L. Port", "dia": 4, "numeroAula": 5, "professor_pdf": "IVETE"}, {"turma": "3NB", "disciplina": "Matemática", "dia": 0, "numeroAula": 6, "professor_pdf": "CARLOS"}, {"turma": "3NB", "disciplina": "Rec. Aprend. Matemática", "dia": 1, "numeroAula": 6, "professor_pdf": "CARLOS"}, {"turma": "3NB", "disciplina": "Língua Portuguesa", "dia": 2, "numeroAula": 6, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NB", "disciplina": "Física II", "dia": 3, "numeroAula": 6, "professor_pdf": "VIVIANE"}, {"turma": "3NB", "disciplina": "Matemática II", "dia": 4, "numeroAula": 6, "professor_pdf": "TIAGO"}, {"turma": "3NC", "disciplina": "Física", "dia": 0, "numeroAula": 2, "professor_pdf": "JOÃO LUCAS"}, {"turma": "3NC", "disciplina": "Língua Inglesa", "dia": 1, "numeroAula": 2, "professor_pdf": "ELIANE"}, {"turma": "3NC", "disciplina": "Geografia I", "dia": 2, "numeroAula": 2, "professor_pdf": "DORIVAL"}, {"turma": "3NC", "disciplina": "Sociologia I", "dia": 3, "numeroAula": 2, "professor_pdf": "WILLIAN"}, {"turma": "3NC", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 2, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NC", "disciplina": "Educação Física", "dia": 0, "numeroAula": 3, "professor_pdf": "ELISANGELA"}, {"turma": "3NC", "disciplina": "Língua Portuguesa", "dia": 1, "numeroAula": 3, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NC", "disciplina": "Matemática", "dia": 2, "numeroAula": 3, "professor_pdf": "CARLOS"}, {"turma": "3NC", "disciplina": "Matemática", "dia": 3, "numeroAula": 3, "professor_pdf": "CARLOS"}, {"turma": "3NC", "disciplina": "Rec. Aprend. L. Port", "dia": 4, "numeroAula": 3, "professor_pdf": "GLEICIANE"}, {"turma": "3NC", "disciplina": "Projeto de Vida", "dia": 0, "numeroAula": 4, "professor_pdf": "FELIPE"}, {"turma": "3NC", "disciplina": "Física", "dia": 1, "numeroAula": 4, "professor_pdf": "JOÃO LUCAS"}, {"turma": "3NC", "disciplina": "Educação Física", "dia": 2, "numeroAula": 4, "professor_pdf": "ELISANGELA"}, {"turma": "3NC", "disciplina": "Educação Financeira", "dia": 3, "numeroAula": 4, "professor_pdf": "GEVERSON"}, {"turma": "3NC", "disciplina": "História I", "dia": 4, "numeroAula": 4, "professor_pdf": "DAIANE"}, {"turma": "3NC", "disciplina": "Arte II", "dia": 0, "numeroAula": 5, "professor_pdf": "ROBERVAL"}, {"turma": "3NC", "disciplina": "Matemática", "dia": 1, "numeroAula": 5, "professor_pdf": "CARLOS"}, {"turma": "3NC", "disciplina": "Língua Portuguesa", "dia": 2, "numeroAula": 5, "professor_pdf": "ANTONIO SILVA"}, {"turma": "3NC", "disciplina": "Rec. Aprend. Matemática", "dia": 3, "numeroAula": 5, "professor_pdf": "CARLOS"}, {"turma": "3NC", "disciplina": "Rec. Aprend. L. Port", "dia": 4, "numeroAula": 5, "professor_pdf": "GLEICIANE"}, {"turma": "3NC", "disciplina": "Arte II", "dia": 0, "numeroAula": 6, "professor_pdf": "ROBERVAL"}, {"turma": "3NC", "disciplina": "Língua Inglesa", "dia": 1, "numeroAula": 6, "professor_pdf": "ELIANE"}, {"turma": "3NC", "disciplina": "Rec. Aprend. Matemática", "dia": 2, "numeroAula": 6, "professor_pdf": "CARLOS"}, {"turma": "3NC", "disciplina": "Sociologia I", "dia": 3, "numeroAula": 6, "professor_pdf": "WILLIAN"}, {"turma": "3NC", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 6, "professor_pdf": "ANTONIO SILVA"}, {"turma": "1NF ADM", "disciplina": "Informática Empresarial", "dia": 0, "numeroAula": 2, "professor_pdf": "TIAGO"}, {"turma": "1NF ADM", "disciplina": "Língua Portuguesa", "dia": 1, "numeroAula": 2, "professor_pdf": "IVETE"}, {"turma": "1NF ADM", "disciplina": "Matemática", "dia": 2, "numeroAula": 2, "professor_pdf": "ANDERSON"}, {"turma": "1NF ADM", "disciplina": "Língua Inglesa", "dia": 3, "numeroAula": 2, "professor_pdf": "ELIANE"}, {"turma": "1NF ADM", "disciplina": "Princípios Econômicos", "dia": 4, "numeroAula": 2, "professor_pdf": "GLEICIANE"}, {"turma": "1NF ADM", "disciplina": "Arte", "dia": 0, "numeroAula": 3, "professor_pdf": "ROBERVAL"}, {"turma": "1NF ADM", "disciplina": "Língua Inglesa", "dia": 1, "numeroAula": 3, "professor_pdf": "ELIANE"}, {"turma": "1NF ADM", "disciplina": "Biologia", "dia": 2, "numeroAula": 3, "professor_pdf": "RODRIGO"}, {"turma": "1NF ADM", "disciplina": "Recursos Humanos", "dia": 3, "numeroAula": 3, "professor_pdf": "FELIPE"}, {"turma": "1NF ADM", "disciplina": "Educação Digital", "dia": 4, "numeroAula": 3, "professor_pdf": "ARNALDO"}, {"turma": "1NF ADM", "disciplina": "Matemática", "dia": 0, "numeroAula": 4, "professor_pdf": "ANDERSON"}, {"turma": "1NF ADM", "disciplina": "Química", "dia": 1, "numeroAula": 4, "professor_pdf": "VIVIANE"}, {"turma": "1NF ADM", "disciplina": "Biologia", "dia": 2, "numeroAula": 4, "professor_pdf": "RODRIGO"}, {"turma": "1NF ADM", "disciplina": "Química", "dia": 3, "numeroAula": 4, "professor_pdf": "VIVIANE"}, {"turma": "1NF ADM", "disciplina": "Princípios de Administração", "dia": 4, "numeroAula": 4, "professor_pdf": "TIAGO"}, {"turma": "1NF ADM", "disciplina": "Finanças Empresariais", "dia": 0, "numeroAula": 5, "professor_pdf": "FELIPE"}, {"turma": "1NF ADM", "disciplina": "Educação Física", "dia": 1, "numeroAula": 5, "professor_pdf": "ELISANGELA"}, {"turma": "1NF ADM", "disciplina": "Geografia", "dia": 2, "numeroAula": 5, "professor_pdf": "DORIVAL"}, {"turma": "1NF ADM", "disciplina": "Estratégia de Marketing", "dia": 3, "numeroAula": 5, "professor_pdf": "FELIPE"}, {"turma": "1NF ADM", "disciplina": "Técnicas Integradas", "dia": 4, "numeroAula": 5, "professor_pdf": "ARNALDO"}, {"turma": "1NF ADM", "disciplina": "Matemática", "dia": 0, "numeroAula": 6, "professor_pdf": "ANDERSON"}, {"turma": "1NF ADM", "disciplina": "Educação Física", "dia": 1, "numeroAula": 6, "professor_pdf": "ELISANGELA"}, {"turma": "1NF ADM", "disciplina": "Geografia", "dia": 2, "numeroAula": 6, "professor_pdf": "DORIVAL"}, {"turma": "1NF ADM", "disciplina": "Arte", "dia": 3, "numeroAula": 6, "professor_pdf": "ROBERVAL"}, {"turma": "1NF ADM", "disciplina": "Língua Portuguesa", "dia": 4, "numeroAula": 6, "professor_pdf": "IVETE"}];

const ALIASES = {
  "sypriano": "luiz antonio sypriano",
  "franciele de assis": "franciele de assis",
};

function normaliza(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL nao definida nesta sessao.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const turmas = (await client.query(`SELECT id, nome, turno FROM turmas WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID, TURNO])).rows;
    const disciplinas = (await client.query(`SELECT id, nome FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const professores = (await client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID])).rows;

    const turmaId = (nome) => turmas.find(t => t.nome === nome)?.id;
    const discId = (nome) => disciplinas.find(d => d.nome === nome)?.id;

    function acharProfessor(nomePdfBruto) {
      const nomePdf = nomePdfBruto.replace(/\*$/, "").trim();
      const chave = normaliza(nomePdf);
      const chaveAlias = ALIASES[chave] ?? chave;
      let candidatos = professores.filter(p => normaliza(p.nome).startsWith(chaveAlias));
      if (candidatos.length === 1) return candidatos[0];
      if (candidatos.length > 1) {
        const exatos = candidatos.filter(c => normaliza(c.nome) === chaveAlias);
        if (exatos.length === 1) return exatos[0];
      }
      const primeiroPdf = chaveAlias.split(" ")[0];
      candidatos = professores.filter(p => normaliza(p.nome.split(" ")[0]) === primeiroPdf);
      if (candidatos.length === 1) return candidatos[0];
      if (candidatos.length > 1) {
        const exatos = candidatos.filter(c => normaliza(c.nome) === chaveAlias);
        if (exatos.length === 1) return exatos[0];
      }
      return null;
    }

    const antes = await client.query(`
      SELECT COUNT(*)::int AS total FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = $2
    `, [ESCOLA_ID, TURNO]);
    console.log(`Linhas atuais do noturno: ${antes.rows[0].total}`);

    const apagado = await client.query(`
      DELETE FROM horarios h USING turmas t
      WHERE h.turma_id = t.id AND h.escola_id = $1 AND t.turno = $2
      RETURNING h.id
    `, [ESCOLA_ID, TURNO]);
    console.log(`Linhas apagadas: ${apagado.rowCount}`);

    let inseridos = 0;
    const semMatchTurmaDisc = [];
    const semMatchProfessor = new Set();
    for (const d of DADOS) {
      const tId = turmaId(d.turma);
      const dId = discId(d.disciplina);
      if (!tId || !dId) {
        semMatchTurmaDisc.push({ ...d, tId, dId });
        continue;
      }
      const prof = acharProfessor(d.professor_pdf);
      if (!prof) {
        semMatchProfessor.add(d.professor_pdf);
        continue;
      }
      // evita duplicar exatamente a mesma linha (pode acontecer com o
      // split de dupla docencia se o nome psado nao desambiguar)
      const jaTem = await client.query(
        `SELECT id FROM horarios WHERE turma_id=$1 AND disciplina_id=$2 AND professor_id=$3 AND dia_semana=$4 AND numero_aula=$5`,
        [tId, dId, prof.id, d.dia, d.numeroAula]
      );
      if (jaTem.rowCount > 0) continue;
      await client.query(
        `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ESCOLA_ID, tId, dId, prof.id, d.dia, d.numeroAula]
      );
      inseridos++;
    }
    console.log(`Linhas inseridas: ${inseridos} de ${DADOS.length}`);

    if (semMatchTurmaDisc.length > 0) {
      console.log(`\n[AVISO] ${semMatchTurmaDisc.length} linha(s) sem match de turma/disciplina:`);
      semMatchTurmaDisc.slice(0, 30).forEach(s => console.log("  ", JSON.stringify(s)));
    }
    if (semMatchProfessor.size > 0) {
      console.log(`\n[AVISO] ${semMatchProfessor.size} nome(s) de professor sem match:`, [...semMatchProfessor]);
    }

    const duplicados = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula, COUNT(DISTINCT h.professor_id)::int AS qtd
      FROM horarios h JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = $2
      GROUP BY t.nome, h.dia_semana, h.numero_aula
      HAVING COUNT(DISTINCT h.professor_id) > 2
    `, [ESCOLA_ID, TURNO]);
    console.log(`\nSlots com MAIS de 2 professores (nao deveria existir): ${duplicados.rows.length}`);
    duplicados.rows.forEach(r => console.log(`  ${r.turma} dia=${r.dia_semana} aula=${r.numero_aula}: ${r.qtd} professores`));

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
