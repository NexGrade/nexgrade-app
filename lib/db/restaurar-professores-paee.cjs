/**
 * restaurar-professores-paee.cjs
 *
 * Restaura os 9 professores PAEE (Atendimento Educacional
 * Especializado) que foram excluidos do sistema sem deixar rastro
 * no log de auditoria. Nomes resgatados do PDF de grade do sistema
 * Urania (unica fonte disponivel -- so tem primeiro nome, sem
 * e-mail real).
 *
 * Cria (se ainda nao existir):
 *   1. Disciplina "PAEE"
 *   2. Os 9 professores, com e-mail PROVISORIO (marcado como
 *      "pendente" -- precisa ser corrigido manualmente depois com o
 *      e-mail real de cada um, antes de convidar pro portal)
 *   3. Vinculo professor_disciplinas ligando cada um a PAEE
 *
 * Uso:
 *   node restaurar-professores-paee.cjs             (dry-run)
 *   node restaurar-professores-paee.cjs --aplicar    (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const PROFESSORES_PAEE = [
  "Camila", "Clair", "Doraci", "Hericleia", "Kauana",
  "Noeli", "Rosinei", "Silvana", "Sueli",
];

function emailProvisorio(primeiroNome) {
  const slug = primeiroNome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return `${slug}.paee.pendente@corrigir.nexgrade`;
}

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    let disciplinaId;
    const existente = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    if (existente.rows.length > 0) {
      disciplinaId = existente.rows[0].id;
      console.log(`Disciplina PAEE ja existe (id=${disciplinaId}), reaproveitando.`);
    } else {
      console.log(`Disciplina PAEE sera criada.`);
      if (aplicar) {
        const criada = await client.query(
          `INSERT INTO disciplinas (escola_id, nome, carga_semanal, cor, sigla)
           VALUES ($1, 'PAEE', 25, '#00897B', 'PAEE')
           RETURNING id`,
          [ESCOLA_ID],
        );
        disciplinaId = criada.rows[0].id;
        console.log(`  -> criada com id=${disciplinaId}`);
      }
    }

    console.log(`\n${PROFESSORES_PAEE.length} professor(es) PAEE a restaurar:`);
    for (const nome of PROFESSORES_PAEE) {
      const email = emailProvisorio(nome);
      const jaExiste = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`,
        [ESCOLA_ID, nome],
      );
      if (jaExiste.rows.length > 0) {
        console.log(`  [JA EXISTE] ${nome} (id=${jaExiste.rows[0].id}) -- pulando`);
        continue;
      }
      console.log(`  [CRIAR] ${nome}  ->  email provisorio: ${email}`);
      if (aplicar) {
        const criado = await client.query(
          `INSERT INTO professores (escola_id, nome, email, carga_horaria_total, ativo)
           VALUES ($1, $2, $3, 25, true)
           RETURNING id`,
          [ESCOLA_ID, nome, email],
        );
        const professorId = criado.rows[0].id;
        await client.query(
          `INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2)`,
          [professorId, disciplinaId],
        );
        console.log(`    -> criado id=${professorId}, vinculado a PAEE`);
      }
    }

    if (aplicar) {
      await client.query("COMMIT");
      console.log("\nOK: restauracao aplicada de verdade (--aplicar usado).");
      console.log("LEMBRETE: os e-mails sao PROVISORIOS -- corrija cada um na tela de Professores antes de convidar pro portal.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- nada foi alterado. Rode com --aplicar para confirmar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
