// [QUEM-MEXEU-ROMARIO] (24/10/2026) SOMENTE LEITURA. Mostra o que foi gravado
// no Romario desde 23/10: historico (audit_logs) e aulas da manha criadas.
// Uso (na pasta lib\db): node quem-mexeu-romario.cjs
const fs = require("fs");
const { Client } = require("pg");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const DESDE = "2026-10-23T00:00:00-03:00";
function url() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)[1];
}
(async () => {
  const c = new Client({ connectionString: url(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const log = (await c.query(
    `select coalesce(usuario_nome, usuario_id, '?') quem, entidade, acao, count(*)::int n,
            to_char(min(created_at at time zone 'America/Sao_Paulo'),'DD/MM HH24:MI') primeiro, to_char(max(created_at at time zone 'America/Sao_Paulo'),'DD/MM HH24:MI') ultimo
       from audit_logs where escola_id=$1 and created_at >= $2
      group by 1,2,3 order by primeiro`, [ESCOLA, DESDE])).rows;
  console.log(`== Historico desde 23/10 (${log.length} grupos)`);
  for (const r of log) console.log(`  ${String(r.quem).padEnd(28)} ${r.entidade.padEnd(14)} ${r.acao.padEnd(10)} ${String(r.n).padStart(4)}x  ${r.primeiro} -> ${r.ultimo}`);
  const h = (await c.query(
    `select to_char(h.created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY') dia, count(*)::int n
       from horarios h join turmas t on t.id=h.turma_id
      where h.escola_id=$1 and t.turno='matutino' and coalesce(h.versao_grade,'oficial')='oficial'
      group by 1 order by min(h.created_at)`, [ESCOLA])).rows;
  console.log("\n== Aulas da manha (grade oficial) por dia em que foram gravadas");
  for (const r of h) console.log(`  ${r.dia}  ${r.n}`);
  console.log("\nSOMENTE LEITURA: nada foi alterado.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
