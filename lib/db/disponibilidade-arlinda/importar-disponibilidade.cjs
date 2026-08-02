const fs = require("fs");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCLFryOr48pfutN7ChZIip3IWL"; // C.E. Arlinda Ferreira Creplive
const DRY_RUN = process.argv[2] !== "--confirmar";
const ARQUIVO_DADOS = require("path").join(__dirname, "disponibilidade_dados.json");

const DIA_INDEX = { Segunda: 0, Terca: 1, Quarta: 2, Quinta: 3, Sexta: 4 };
const SLOTS_POR_TURNO = { matutino: 6, vespertino: 5 };

async function main() {
  const dados = JSON.parse(fs.readFileSync(ARQUIVO_DADOS, "utf8"));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: professoresDb } = await client.query(
      "SELECT id, nome FROM professores WHERE escola_id = $1",
      [ESCOLA_ID]
    );
    const mapaNomeParaId = new Map(professoresDb.map((p) => [p.nome.trim().toLowerCase(), p.id]));

    const naoEncontrados = [];
    const linhasParaInserir = [];

    for (const turno of ["matutino", "vespertino"]) {
      const slotsNoTurno = SLOTS_POR_TURNO[turno];
      for (const [nome, info] of Object.entries(dados[turno])) {
        const professorId = mapaNomeParaId.get(nome.trim().toLowerCase());
        if (!professorId) {
          naoEncontrados.push({ nome, turno });
          continue;
        }

        // dias sem nenhuma atividade -> bloqueia todos os slots do dia
        for (const dia of info.dias_bloqueados) {
          const diaSemana = DIA_INDEX[dia];
          for (let slot = 1; slot <= slotsNoTurno; slot++) {
            linhasParaInserir.push({
              professorId, diaSemana, horarioSlot: slot, turno,
              disponivel: false, horaAtividadeObrigatoria: false,
              motivo: "Importado do relatorio Uranio (dia sem atividade)",
            });
          }
        }

        // slots de HA -> disponivel=true, horaAtividadeObrigatoria=true
        for (const [dia, periodo] of info.ha_slots) {
          const diaSemana = DIA_INDEX[dia];
          linhasParaInserir.push({
            professorId, diaSemana, horarioSlot: periodo, turno,
            disponivel: true, horaAtividadeObrigatoria: true,
            motivo: "Importado do relatorio Uranio (HA)",
          });
        }
      }
    }

    console.log("=== PROFESSORES NAO ENCONTRADOS NO BANCO (nome nao bateu) ===");
    if (naoEncontrados.length === 0) {
      console.log("  (nenhum -- todos os nomes bateram)");
    } else {
      naoEncontrados.forEach((n) => console.log(`  ${n.nome} (${n.turno})`));
    }
    console.log();
    console.log("Total de linhas a inserir:", linhasParaInserir.length);

    if (DRY_RUN) {
      console.log("\n>>> DRY-RUN: nada foi salvo. Revise os nomes nao encontrados acima antes de rodar com --confirmar. <<<");
      await client.end();
      return;
    }

    if (naoEncontrados.length > 0) {
      console.log("\n>>> ABORTADO: existem professores nao encontrados. Corrija os nomes ou remova-os do JSON antes de confirmar. <<<");
      await client.end();
      return;
    }

    await client.query("BEGIN");
    for (const linha of linhasParaInserir) {
      await client.query(
        `INSERT INTO disponibilidade_professores
          (professor_id, dia_semana, horario_slot, disponivel, motivo, turno, hora_atividade_obrigatoria)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [linha.professorId, linha.diaSemana, linha.horarioSlot, linha.disponivel, linha.motivo, linha.turno, linha.horaAtividadeObrigatoria]
      );
    }
    await client.query("COMMIT");
    console.log("\n>>> DISPONIBILIDADE IMPORTADA COM SUCESSO. <<<");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO -- nada foi salvo:", err.message);
  } finally {
    await client.end();
  }
}

main();
