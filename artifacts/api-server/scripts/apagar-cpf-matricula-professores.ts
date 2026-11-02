/**
 * [PROFESSOR-SEM-CPF] (01/11/2026) O cadastro do professor guarda so nome, e-mail institucional e telefone (decisao
 * da dona, LGPD: minimizacao). Este script apaga o CPF e a matricula ja gravados. Mostra so QUANTOS existem por
 * escola (nao imprime os numeros). --aplicar grava o backup em lib/db/_arquivo e apaga numa transacao.
 * As colunas continuam no banco (vazias); tirar do esquema fica para uma migracao depois.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx --env-file=C:\projetos\nexgrade-app\lib\db\.env scripts/apagar-cpf-matricula-professores.ts   (dry-run)
 *   ... --aplicar
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.resolve(process.cwd(), "..", "..");

async function main() {
  const { pool } = await import("@workspace/db");
  const c = await pool.connect();
  const q = async (s: string, p: unknown[] = []) => (await c.query(s, p)).rows as any[];
  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");
    const linhas = await q(`select p.id, p.escola_id, p.cpf, p.matricula from professores p
      where nullif(trim(coalesce(p.cpf,'')),'') is not null or nullif(trim(coalesce(p.matricula,'')),'') is not null`);
    const escola = new Map((await q("select id, nome_fantasia from escolas")).map((e) => [e.id, e.nome_fantasia]));
    const porEscola = new Map<string, { cpf: number; matricula: number }>();
    for (const l of linhas) {
      const s = porEscola.get(l.escola_id) ?? { cpf: 0, matricula: 0 };
      if ((l.cpf ?? "").trim()) s.cpf++;
      if ((l.matricula ?? "").trim()) s.matricula++;
      porEscola.set(l.escola_id, s);
    }
    console.log(`Professores com CPF ou matricula gravados: ${linhas.length}`);
    for (const [e, s] of porEscola) console.log(`  ${escola.get(e) ?? e}: ${s.cpf} com CPF, ${s.matricula} com matricula`);
    if (!APLICAR) { console.log("\nDRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (!linhas.length) { console.log("\nNada a apagar."); return; }
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-cpf-matricula-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(linhas, null, 1));
    console.log(`\nBackup: ${arqBk}  (tem os CPFs: apague o arquivo depois de conferir)`);
    await c.query("BEGIN");
    try {
      await c.query("update professores set cpf=null, matricula=null, updated_at=now() where id = any($1)", [linhas.map((l) => l.id)]);
      await c.query("COMMIT");
      console.log("GRAVADO.");
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
