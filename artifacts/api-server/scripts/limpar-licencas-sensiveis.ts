/**
 * [LICENCA-SEM-DADO-SENSIVEL] (01/11/2026) Tira das licencas ja gravadas o que pode ser dado de saude (LGPD):
 *  - licencas: tipo antigo (medica, maternidade, paternidade ou desconhecido) vira "afastamento"; o motivo e apagado;
 *  - comunicados automaticos de licenca (tipo "licenca", autor "Sistema"): o texto passa a dizer so o periodo.
 * O periodo e o substituto nao mudam. Mostra tudo antes; --aplicar grava o backup em lib/db/_arquivo e regrava
 * numa transacao.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx --env-file=C:\projetos\nexgrade-app\lib\db\.env scripts/limpar-licencas-sensiveis.ts   (dry-run)
 *   ... --aplicar
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.resolve(process.cwd(), "..", "..");

async function main() {
  const { pool } = await import("@workspace/db");
  const { TIPOS_LICENCA, tipoNeutro, comunicadoDaLicenca } = await import("../src/lib/licenca-neutra");
  const c = await pool.connect();
  const q = async (s: string, p: unknown[] = []) => (await c.query(s, p)).rows as any[];
  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");
    const escola = new Map((await q("select id, nome_fantasia from escolas")).map((e) => [e.id, e.nome_fantasia]));
    const lic = await q(`select l.id, l.escola_id, l.tipo, l.motivo, l.data_inicio::text di, l.data_fim::text df, p.nome
      from licencas_professores l left join professores p on p.id=l.professor_id order by l.escola_id, l.data_inicio`);
    const licMudar = lic.filter((l) => !(TIPOS_LICENCA as readonly string[]).includes(l.tipo) || l.motivo != null);
    console.log(`Licencas: ${lic.length}; a limpar: ${licMudar.length}`);
    for (const l of licMudar) {
      console.log(`  #${l.id} ${escola.get(l.escola_id) ?? l.escola_id} | ${l.nome ?? "?"} | ${l.di} a ${l.df} | tipo "${l.tipo}" -> "${tipoNeutro(l.tipo)}"${l.motivo != null ? ` | motivo apagado (${String(l.motivo).length} letras)` : ""}`);
    }

    const com = await q(`select id, escola_id, titulo, mensagem from comunicados where tipo='licenca' and autor_nome='Sistema' order by id`);
    // so os do formato antigo ("Licença registrada — ..."); os novos ja dizem so o periodo e o substituto
    const novoCom = com.filter((x) => String(x.titulo ?? "").startsWith("Licença registrada")).map((x) => {
      const m = /^Professor\(a\) (.+?) terá licença de (\d{4}-\d\d-\d\d) a (\d{4}-\d\d-\d\d)/.exec(x.mensagem ?? "");
      const nome = m?.[1] ?? String(x.titulo ?? "").replace(/^Licença registrada — /, "");
      const novo = m ? comunicadoDaLicenca(nome, m[2]!, m[3]!, null) : { titulo: `Afastamento registrado — ${nome}`, mensagem: `Professor(a) ${nome} estará afastado(a).` };
      return { ...x, novo };
    }).filter((x) => x.novo.titulo !== x.titulo || x.novo.mensagem !== x.mensagem);
    console.log(`\nComunicados automaticos de licenca: ${com.length}; a reescrever: ${novoCom.length}`);
    for (const x of novoCom) console.log(`  #${x.id} ${escola.get(x.escola_id) ?? x.escola_id} | agora: "${x.novo.mensagem}"`);

    if (!APLICAR) { console.log("\nDRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (!licMudar.length && !novoCom.length) { console.log("\nNada a gravar."); return; }
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-licencas-sensiveis-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify({ licencas: licMudar, comunicados: novoCom.map(({ novo: _n, ...r }) => r) }, null, 1));
    console.log(`\nBackup: ${arqBk}  (tem os motivos antigos: apague o arquivo depois de conferir)`);
    await c.query("BEGIN");
    try {
      for (const l of licMudar) await c.query("update licencas_professores set tipo=$1, motivo=null, updated_at=now() where id=$2", [tipoNeutro(l.tipo), l.id]);
      for (const x of novoCom) await c.query("update comunicados set titulo=$1, mensagem=$2 where id=$3", [x.novo.titulo, x.novo.mensagem, x.id]);
      await c.query("COMMIT");
      console.log("GRAVADO.");
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
