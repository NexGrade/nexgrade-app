// Migracao manual (31/10/2026): [TRAVA-HORARIO-REAL] corrige a trava do banco contra professor em
// duas aulas ao mesmo tempo (funcao checar_conflito_sobreposicao_professor, trigger
// tgr_checar_conflito_sobreposicao em horarios), instalada em 29/10 por lib/db/criar-trava-conflitos.cjs.
//
// Por que: a trava antiga compara o NUMERO da aula. Com a turma integral isso erra nos dois sentidos:
//   - 1ME 2a aula (08:20) x 7TB 2a aula (13:55): bloqueava, mas sao horarios diferentes;
//   - 1ME 7a aula (13:05) x 7TB 1a aula (13:05): deixava passar, mas e choque de verdade.
// Barrou a atualizacao do Mario Braga pelo Urania (31/10) e barra aula manual legitima da 1ME.
//
// Agora: cada aula vira o seu HORARIO REAL (inicio e duracao em horario_slots, do turno da turma; no
// matutino, do nivel de ensino da turma) e so ha choque se os horarios se sobrepoem no mesmo dia.
// Continua permitido: a mesma turma (trio com o mesmo professor), aula assincrona, outra versao_grade.
// Turma/aula sem esquema de horario: vale a regra antiga (mesmo turno e mesmo numero).
//
// Dry-run: instala a trava nova DENTRO de uma transacao, confere toda a grade oficial do Mario Braga com
// a nova e com a antiga (regrava cada aula sem mudar nada) e desfaz tudo (ROLLBACK).
// Uso (na pasta lib\db):  node migracoes-manuais\20261031-trava-conflitos-horario-real.cjs            (dry-run)
//                         node migracoes-manuais\20261031-trava-conflitos-horario-real.cjs --aplicar  (grava)
// Para voltar a trava antiga: node criar-trava-conflitos.cjs (nao recomendado: tem o erro acima).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_TESTE = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // Mario Braga (tem turma integral)

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem em lib\\db\\.env)");
  return m[1];
}

const FUNCAO_NOVA = `
CREATE OR REPLACE FUNCTION checar_conflito_sobreposicao_professor()
RETURNS TRIGGER AS $$
DECLARE
  novo_turno text;
  novo_nivel text;
  novo_ini time;
  novo_dur int;
  conflito record;
BEGIN
  -- [TRAVA-HORARIO-REAL] (31/10/2026) choque pelo horario real, nao pelo numero da aula
  IF NEW.assincrona THEN RETURN NEW; END IF;
  SELECT t.turno, t.nivel_ensino::text INTO novo_turno, novo_nivel FROM turmas t WHERE t.id = NEW.turma_id;
  SELECT hs.hora_inicio, hs.duracao_minutos INTO novo_ini, novo_dur
    FROM horario_slots hs
   WHERE hs.escola_id = NEW.escola_id AND hs.turno = novo_turno AND hs.numero_aula = NEW.numero_aula
   ORDER BY (hs.nivel_ensino::text IS NOT DISTINCT FROM novo_nivel) DESC, hs.nivel_ensino::text = 'medio_tecnico' DESC
   LIMIT 1;

  SELECT h.id, t.nome, t.turno INTO conflito
    FROM horarios h
    JOIN turmas t ON t.id = h.turma_id
    LEFT JOIN LATERAL (
      SELECT hs.hora_inicio, hs.duracao_minutos FROM horario_slots hs
       WHERE hs.escola_id = h.escola_id AND hs.turno = t.turno AND hs.numero_aula = h.numero_aula
       ORDER BY (hs.nivel_ensino::text IS NOT DISTINCT FROM t.nivel_ensino::text) DESC, hs.nivel_ensino::text = 'medio_tecnico' DESC
       LIMIT 1
    ) s ON true
   WHERE h.professor_id = NEW.professor_id
     AND h.dia_semana = NEW.dia_semana
     AND h.id <> COALESCE(NEW.id, -1)
     AND h.turma_id <> NEW.turma_id
     AND NOT h.assincrona
     AND COALESCE(h.versao_grade, 'oficial') = COALESCE(NEW.versao_grade, 'oficial')
     AND CASE
           WHEN novo_ini IS NULL OR s.hora_inicio IS NULL
             THEN t.turno = novo_turno AND h.numero_aula = NEW.numero_aula
           ELSE s.hora_inicio < novo_ini + make_interval(mins => novo_dur)
            AND novo_ini < s.hora_inicio + make_interval(mins => s.duracao_minutos)
         END
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'IMPOSSÍVEL SALVAR: O professor selecionado já possui aula alocada na turma % (%) neste mesmo horário!',
      conflito.nome, conflito.turno;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;

const TRIGGER = `
DROP TRIGGER IF EXISTS tgr_checar_conflito_sobreposicao ON horarios;
CREATE TRIGGER tgr_checar_conflito_sobreposicao
  BEFORE INSERT OR UPDATE ON horarios
  FOR EACH ROW EXECUTE FUNCTION checar_conflito_sobreposicao_professor();`;

// "regrava" cada aula oficial da escola (sem mudar nada) para a trava conferir linha a linha
async function conferirGrade(c, rotulo) {
  const ids = (await c.query(
    "select id from horarios where escola_id=$1 and coalesce(versao_grade,'oficial')='oficial' order by id", [ESCOLA_TESTE])).rows.map((r) => r.id);
  const erros = [];
  for (const id of ids) {
    await c.query("SAVEPOINT linha");
    try { await c.query("update horarios set numero_aula = numero_aula where id=$1", [id]); await c.query("RELEASE SAVEPOINT linha"); }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT linha"); erros.push({ id, msg: e.message }); }
  }
  console.log(`${rotulo}: ${ids.length} aulas conferidas, ${erros.length} barradas`);
  for (const e of erros.slice(0, 8)) console.log(`   aula #${e.id}: ${e.msg}`);
  if (erros.length > 8) console.log(`   ... mais ${erros.length - 8}`);
  return erros.length;
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (testa dentro de uma transacao e desfaz)\n");
  try {
    const trig = (await c.query(
      "select tgname from pg_trigger where tgrelid = 'horarios'::regclass and tgname = 'tgr_checar_conflito_sobreposicao' and not tgisinternal")).rowCount;
    const fn = (await c.query("select pg_get_functiondef(p.oid) def from pg_proc p where p.proname = 'checar_conflito_sobreposicao_professor'")).rows[0];
    console.log(`Trava hoje: trigger ${trig ? "INSTALADO" : "nao existe"}; funcao ${fn ? (fn.def.includes("TRAVA-HORARIO-REAL") ? "ja e a NOVA" : "e a ANTIGA (numero da aula)") : "nao existe"}\n`);

    await c.query("BEGIN");
    let barradasAntiga = null;
    if (fn && !fn.def.includes("TRAVA-HORARIO-REAL") && trig) barradasAntiga = await conferirGrade(c, "Com a trava ANTIGA");
    await c.query(FUNCAO_NOVA);
    await c.query(TRIGGER);
    const barradasNova = await conferirGrade(c, "Com a trava NOVA  ");

    if (!APLICAR) {
      await c.query("ROLLBACK");
      console.log("\nDRY-RUN: nada foi alterado (ROLLBACK). Rode com --aplicar.");
      if (barradasNova) console.log("ATENCAO: a trava nova barrou aulas da grade de hoje - conferir antes de aplicar.");
      return;
    }
    if (barradasNova) {
      await c.query("ROLLBACK");
      console.log("\nNAO GRAVADO: a trava nova barrou aulas da grade de hoje.");
      process.exitCode = 1; return;
    }
    // desfaz as "regravacoes" de teste (nao mudaram nada, mas ficam fora da transacao final) e grava so a trava
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    await c.query(FUNCAO_NOVA);
    await c.query(TRIGGER);
    await c.query("COMMIT");
    console.log(`\nGRAVADO: trava nova instalada${barradasAntiga != null ? ` (a antiga barrava ${barradasAntiga} aulas da grade de hoje)` : ""}.`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ja desfeito */ }
    console.error("ERRO:", e.message); process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
