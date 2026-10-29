const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log("Instalando barreira de segurança no banco de dados contra sobreposições...");

    // 1. Criar a função que verifica os conflitos (incluindo Integral vs Matutino/Vespertino)
    await c.query(`
      CREATE OR REPLACE FUNCTION checar_conflito_sobreposicao_professor() 
      RETURNS TRIGGER AS $$
      DECLARE
          conflito_id INT;
          conflito_turma VARCHAR;
          conflito_turno VARCHAR;
      BEGIN
          -- Verifica se existe outra aula no mesmo dia e número de aula para o mesmo professor
          SELECT h.id, t.nome, t.turno INTO conflito_id, conflito_turma, conflito_turno
          FROM horarios h
          JOIN turmas t ON t.id = h.turma_id
          WHERE h.professor_id = NEW.professor_id
            AND h.dia_semana = NEW.dia_semana
            AND h.numero_aula = NEW.numero_aula
            AND h.id <> COALESCE(NEW.id, -1) -- Ignora o próprio registro na atualização
            AND (
                -- Caso A: Mesmo turno (ex: Matutino e Matutino)
                t.turno = (SELECT turno FROM turmas WHERE id = NEW.turma_id)
                -- Caso B: Um é Integral e o outro é Matutino (sobreposição de manhã)
                OR (t.turno = 'integral' AND (SELECT turno FROM turmas WHERE id = NEW.turma_id) = 'matutino')
                OR (t.turno = 'matutino' AND (SELECT turno FROM turmas WHERE id = NEW.turma_id) = 'integral')
                -- Caso C: Um é Integral e o outro é Vespertino (sobreposição de tarde)
                OR (t.turno = 'integral' AND (SELECT turno FROM turmas WHERE id = NEW.turma_id) = 'vespertino')
                OR (t.turno = 'vespertino' AND (SELECT turno FROM turmas WHERE id = NEW.turma_id) = 'integral')
            )
          LIMIT 1;

          IF conflito_id IS NOT NULL THEN
              RAISE EXCEPTION 'IMPOSSÍVEL SALVAR: O professor selecionado já possui aula alocada na turma % (% ) neste mesmo horário!', 
                  conflito_turma, conflito_turno;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Apagar trigger antigo se existir (para evitar duplicidade)
    await c.query(`
      DROP TRIGGER IF EXISTS tgr_checar_conflito_sobreposicao ON horarios;
    `);

    // 3. Vincular a trigger à tabela de horários
    await c.query(`
      CREATE TRIGGER tgr_checar_conflito_sobreposicao
      BEFORE INSERT OR UPDATE ON horarios
      FOR EACH ROW
      EXECUTE FUNCTION checar_conflito_sobreposicao_professor();
    `);

    console.log("\n?? TRAVA DE SEGURANÇA INSTALADA COM SUCESSO!");
    console.log("O banco de dados agora impedirá ativamente qualquer sobreposição envolvendo turmas Integrais, Matutinas ou Vespertinas.");

  } catch (err) {
    console.error("? Erro ao instalar a trava de segurança:", err);
  } finally {
    await c.end();
  }
})();
