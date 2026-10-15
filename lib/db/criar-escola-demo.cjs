// [ESCOLA-DEMO] (15/10/2026) Preenche uma escola de DEMONSTRACAO com a estrutura de uma
// escola real, trocando os professores por nomes e e-mails ficticios.
// Copia: horarios dos turnos, disciplinas usadas, turmas, disciplinas e cargas de cada turma
// (com trio, co-docencia e assincronas), professores (FICTICIOS), disciplinas de cada
// professor, disponibilidade/HA e aulas fixas, e as configuracoes da escola.
// NAO copia: grade (horarios), reservas, licencas, comunicados, usuarios, codigos do RCO,
// CPF/matricula/telefone. A escola demo comeca sem grade, pronta para gerar.
// So roda numa escola DESTINO vazia (sem turmas e sem professores). Nao altera a origem.
// Antes: criar a escola pelo Painel Master > Nova escola (isenta, com o seu acesso).
// Uso (na pasta lib\db):
//   node criar-escola-demo.cjs --destino=esc_xxx                      (dry-run, origem = Arlinda)
//   node criar-escola-demo.cjs --destino=esc_xxx --origem=org_xxx     (outra origem)
//   node criar-escola-demo.cjs --destino=esc_xxx --aplicar
const fs = require("fs");
const { Client } = require("pg");

const arg = (n) => (process.argv.find((a) => a.startsWith("--" + n + "=")) || "").split("=").slice(1).join("=") || null;
const APLICAR = process.argv.includes("--aplicar");
const ORIGEM = arg("origem") || "org_3HCLFry0r48pfutN7ChZIip3IWL"; // C.E. Arlinda Ferreira Creplive
const DESTINO = arg("destino");

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}

const NOMES = ["Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Heitor", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Paulo", "Rafaela", "Samuel", "Tatiane", "Vinícius", "Beatriz", "Caio", "Débora", "Enzo", "Fernanda", "Gustavo", "Helena", "Igor", "Júlia", "Leonardo"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Dias", "Esteves", "Ferraz", "Gomes", "Hoffmann", "Ibrahim", "Jardim", "Kowalski", "Lima", "Moreira", "Nogueira", "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Souza", "Teixeira", "Uchoa", "Vieira", "Wolff", "Xavier", "Yamamoto", "Zanetti", "Batista", "Castro", "Duarte", "Freitas"];
function nomesFicticios(n) {
  const out = [];
  const usados = new Set();
  for (let i = 0; out.length < n; i++) {
    const nome = NOMES[i % NOMES.length] + " " + SOBRENOMES[(i + Math.floor(i / NOMES.length) * 7) % SOBRENOMES.length];
    if (usados.has(nome)) continue;
    usados.add(nome);
    out.push(nome);
  }
  return out;
}

const cacheCols = new Map();
async function colunas(c, tabela) {
  if (!cacheCols.has(tabela)) {
    const r = await c.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [tabela]);
    cacheCols.set(tabela, new Map(r.rows.map((x) => [x.column_name, x.data_type])));
  }
  return cacheCols.get(tabela);
}
async function existeTabela(c, tabela) {
  return (await colunas(c, tabela)).size > 0;
}
/** insere uma copia da linha (sem id/created_at/updated_at), com os campos trocados; devolve o id novo */
async function copiar(c, tabela, linha, trocar) {
  const cols = await colunas(c, tabela);
  const obj = { ...linha, ...trocar };
  delete obj.id; delete obj.created_at; delete obj.updated_at;
  if (cols.has("escola_id")) obj.escola_id = DESTINO; // nunca grava nada com o id da origem
  const nomes = Object.keys(obj).filter((k) => cols.has(k));
  const valores = nomes.map((k) => (cols.get(k).startsWith("json") && obj[k] !== null ? JSON.stringify(obj[k]) : obj[k]));
  const sql = `insert into "${tabela}" (${nomes.map((n) => `"${n}"`).join(",")}) values (${nomes.map((_, i) => "$" + (i + 1)).join(",")})` + (cols.has("id") ? " returning id" : "");
  const r = await c.query(sql, valores);
  return r.rows[0]?.id;
}
const contar = async (c, sql, p) => Number((await c.query(sql, p)).rows[0].n);

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  if (!DESTINO) {
    console.log("Informe --destino=<id da escola demo>. Escolas cadastradas:");
    for (const e of (await c.query("select id, nome_fantasia, isenta from escolas order by created_at")).rows) console.log("  " + e.id + "  " + e.nome_fantasia + (e.isenta ? " [isenta]" : ""));
    await c.end();
    return;
  }
  const esc = async (id) => (await c.query("select id, nome_fantasia, isenta from escolas where id=$1", [id])).rows[0];
  const origem = await esc(ORIGEM);
  const destino = await esc(DESTINO);
  if (!origem) throw new Error("escola de origem nao encontrada: " + ORIGEM);
  if (!destino) throw new Error("escola de destino nao encontrada: " + DESTINO);
  if (ORIGEM === DESTINO) throw new Error("origem e destino sao a mesma escola");
  console.log("ORIGEM : " + origem.nome_fantasia + " (" + ORIGEM + ")");
  console.log("DESTINO: " + destino.nome_fantasia + " (" + DESTINO + ")" + (destino.isenta ? " [isenta]" : " [ATENCAO: nao esta isenta]"));

  const turmasDestino = await contar(c, "select count(*) n from turmas where escola_id=$1", [DESTINO]);
  const profsDestino = await contar(c, "select count(*) n from professores where escola_id=$1", [DESTINO]);
  if (turmasDestino || profsDestino) throw new Error(`a escola destino ja tem ${turmasDestino} turmas e ${profsDestino} professores: so preencho escola vazia`);

  const turmas = (await c.query("select * from turmas where escola_id=$1 order by turno, nome", [ORIGEM])).rows;
  const turmaIds = turmas.map((t) => t.id);
  const tds = turmaIds.length ? (await c.query("select * from turma_disciplinas where turma_id = any($1) order by id", [turmaIds])).rows : [];
  const profs = (await c.query("select * from professores where escola_id=$1 order by nome", [ORIGEM])).rows;
  const profIds = profs.map((p) => p.id);
  const pds = profIds.length ? (await c.query("select * from professor_disciplinas where professor_id = any($1)", [profIds])).rows : [];
  const disp = profIds.length ? (await c.query("select * from disponibilidade_professores where professor_id = any($1)", [profIds])).rows : [];
  const fixas = (await existeTabela(c, "aulas_fixas")) ? (await c.query("select * from aulas_fixas where escola_id=$1", [ORIGEM])).rows : [];
  const slots = (await c.query("select * from horario_slots where escola_id=$1", [ORIGEM])).rows;
  const slotsDestino = await contar(c, "select count(*) n from horario_slots where escola_id=$1", [DESTINO]);
  const temConfig = await existeTabela(c, "configuracoes");
  const configs = temConfig ? (await c.query("select * from configuracoes where escola_id=$1", [ORIGEM])).rows : [];
  const configsDestino = temConfig ? await contar(c, "select count(*) n from configuracoes where escola_id=$1", [DESTINO]) : 0;

  const discIds = [...new Set([...tds.map((x) => x.disciplina_id), ...pds.map((x) => x.disciplina_id), ...fixas.map((x) => x.disciplina_id)])];
  const discs = discIds.length ? (await c.query("select * from disciplinas where id = any($1)", [discIds])).rows : [];
  const discDestino = (await c.query("select id, lower(trim(nome)) nome from disciplinas where escola_id=$1", [DESTINO])).rows;
  const porNome = new Map(discDestino.map((d) => [d.nome, d.id]));
  const discReaproveitadas = discs.filter((d) => porNome.has(d.nome.trim().toLowerCase())).length;

  const ficticios = nomesFicticios(profs.length);
  console.log("\nA copiar:");
  console.log(`  ${slots.length} horarios dos turnos` + (slotsDestino ? " (PULADO: destino ja tem)" : ""));
  console.log(`  ${discs.length} disciplinas usadas (${discReaproveitadas} ja existem no destino pelo catalogo, ${discs.length - discReaproveitadas} novas)`);
  console.log(`  ${turmas.length} turmas, ${tds.length} disciplinas de turma (com cargas, trio, co-docencia e assincronas)`);
  console.log(`  ${profs.length} professores FICTICIOS, ${pds.length} disciplinas de professor, ${disp.length} linhas de disponibilidade/HA, ${fixas.length} aulas fixas`);
  console.log(`  ${configs.length} configuracoes da escola` + (configsDestino ? " (PULADO: destino ja tem)" : ""));
  console.log("\nExemplos de professores ficticios: " + ficticios.slice(0, 5).join(", ") + "...");
  console.log("E-mails: professor01@demo.nexgrade.com.br ... (nao recebem e-mail; servem so para a demonstracao)");

  if (!APLICAR) { console.log("\nDRY-RUN: nada foi gravado. Rode com --aplicar."); await c.end(); return; }

  await c.query("BEGIN");
  try {
    if (!slotsDestino) for (const s of slots) await copiar(c, "horario_slots", s, { escola_id: DESTINO });
    if (!configsDestino) for (const cf of configs) await copiar(c, "configuracoes", cf, { escola_id: DESTINO });

    const mapaDisc = new Map();
    for (const d of discs) {
      const ja = porNome.get(d.nome.trim().toLowerCase());
      mapaDisc.set(d.id, ja ?? (await copiar(c, "disciplinas", d, { escola_id: DESTINO })));
    }

    const mapaProf = new Map();
    for (let i = 0; i < profs.length; i++) {
      const p = profs[i];
      const n = String(i + 1).padStart(2, "0");
      mapaProf.set(p.id, await copiar(c, "professores", p, {
        escola_id: DESTINO, nome: ficticios[i], email: "professor" + n + "@demo.nexgrade.com.br",
        cpf: null, matricula: null, telefone: null, professor_principal_id: null,
      }));
    }
    for (const p of profs) {
      if (p.professor_principal_id && mapaProf.has(p.professor_principal_id)) {
        await c.query("update professores set professor_principal_id=$1 where id=$2", [mapaProf.get(p.professor_principal_id), mapaProf.get(p.id)]);
      }
    }
    for (const pd of pds) await copiar(c, "professor_disciplinas", pd, { professor_id: mapaProf.get(pd.professor_id), disciplina_id: mapaDisc.get(pd.disciplina_id) });
    for (const d of disp) await copiar(c, "disponibilidade_professores", d, { professor_id: mapaProf.get(d.professor_id) });

    const mapaTurma = new Map();
    for (const t of turmas) {
      mapaTurma.set(t.id, await copiar(c, "turmas", t, { escola_id: DESTINO, matriz_curricular_id: null, codigo_sere: null, codigo_sere_if: null }));
    }
    for (const x of tds) {
      await copiar(c, "turma_disciplinas", x, {
        turma_id: mapaTurma.get(x.turma_id),
        disciplina_id: mapaDisc.get(x.disciplina_id),
        professor_id: x.professor_id ? mapaProf.get(x.professor_id) ?? null : null,
        professor_apoio_id: x.professor_apoio_id ? mapaProf.get(x.professor_apoio_id) ?? null : null,
        grupo_compartilhado_id: x.grupo_compartilhado_id ? "demo-" + x.grupo_compartilhado_id : null,
      });
    }
    for (const f of fixas) {
      if (!mapaTurma.has(f.turma_id) || !mapaProf.has(f.professor_id)) continue;
      await copiar(c, "aulas_fixas", f, { escola_id: DESTINO, turma_id: mapaTurma.get(f.turma_id), professor_id: mapaProf.get(f.professor_id), disciplina_id: mapaDisc.get(f.disciplina_id) });
    }
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }

  const n = async (sql) => contar(c, sql, [DESTINO]);
  console.log("\nGRAVADO na escola demo: " +
    (await n("select count(*) n from turmas where escola_id=$1")) + " turmas, " +
    (await n("select count(*) n from professores where escola_id=$1")) + " professores, " +
    (await n("select count(*) n from horario_slots where escola_id=$1")) + " horarios de turno.");
  console.log("Proximo passo: abrir a escola demo e gerar a grade em Horario > Modo Experimental.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
