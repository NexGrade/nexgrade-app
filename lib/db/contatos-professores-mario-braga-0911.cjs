// [CONTATOS-MB-0911] (10/11/2026) Telefone (e, se a dona aprovar, e-mail) dos professores do
// C.E. Prof. Mario Braga, pela lista que a escola mandou em 09/11
// ("Email e contatos dos professores prioridade reservas.jpeg", 27 professores).
//  - Casa pelo id do cadastro, conferindo o nome (o nome da lista e o nome completo; no cadastro
//    alguns estao abreviados, por isso o nome esperado do cadastro vai junto).
//  - Telefone: grava so os digitos, como o da Simone ja esta. Sem telefone na lista (Geovani) ou
//    numero suspeito (Anderson: "(42) 9999-3999", parece de preenchimento) -> fica como esta.
//  - E-mail: o e-mail do cadastro e o que da acesso ao professor (lib/acesso.ts compara professores.email
//    com o e-mail do login). Por isso so troca com --com-emails, e nunca para um e-mail que ja esta em
//    outro professor (de qualquer escola).
//  - Nao mexe em nome, CPF, matricula, carga, ativo, nem em professores fora da lista.
// Uso (na pasta lib\db):  node contatos-professores-mario-braga-0911.cjs                      (dry-run)
//                         node contatos-professores-mario-braga-0911.cjs --aplicar            (so telefones)
//                         node contatos-professores-mario-braga-0911.cjs --aplicar --com-emails (telefones e e-mails)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const COM_EMAILS = process.argv.includes("--com-emails");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

// [id, nome no cadastro (21/10), nome na lista, e-mail da lista, telefone da lista (null = nao gravar)]
const LISTA = [
  [598, "Aline Nunes da Silva", "ALINE NUNES DA SILVA", "silva.aline3@escola.pr.gov.br", "(41) 98808-9084"],
  [599, "Anderson dos Santos Mazur", "ANDERSON DOS SANTOS MAZUR", "anderson.mazur@escola.pr.gov.br", null], // lista: (42) 9999-3999
  [600, "Andre Pizoni Cardoso", "ANDRE PIZONI CARDOSO", "andrepizoni@seed.pr.gov.br", "(41) 99826-1980"],
  [602, "Antonio Carlos da Silva", "ANTONIO CARLOS DA SILVA", "antonio.silva6@escola.pr.gov.br", "(41) 99516-9695"],
  [605, "Cecilia Favoretto Jez", "CECILIA FAVORETTO JEZ", "cecilia.jez@escola.pr.gov.br", "(41) 98802-9831"],
  [607, "Chrystian Savano Grassi", "CHRYSTIAN SAVANO GRASSI", "chrystian.grassi@escola.pr.gov.br", "(41) 99255-2607"],
  [609, "Crislaine Lourenco Franco", "CRISLAINE LOURENÇO FRANCO", "crislaine.franco@escola.pr.gov.br", "(41) 99107-5386"],
  [615, "Eduarda Poliana Pauluk dos Santos", "EDUARDA POLIANA PAULUK DOS SANTOS", "eduardapauluksantos@escola.pr.gov.br", "(41) 98849-1602"],
  [620, "Eliane Rocha", "ELIANE ROCHA FRANCISCO CRUZ", "elianeletras@yahoo.com.br", "(41) 99550-4147"],
  [625, "Fernanda Rizzi Galerani", "FERNANDA RIZZI GALERANI", "fernanda.galerani@escola.pr.gov.br", "(41) 99162-2297"],
  [628, "Gabriela Costa", "GABRIELA FARIA COSTA", "gabriela.faria.costa@escola.pr.gov.br", "(41) 99144-5470"],
  [629, "Geovani Borges Valente da Silva Carvalho", "GEOVANI BORGES VALENTE DA SILVA CARVALHO", "carvalho.geovani@escola.pr.gov.br", null], // NAO INFORMADO
  [630, "Geverson Luiz de Oliveira", "GEVERSON LUIZ DE OLIVEIRA", "geverson.oliveira@escola.pr.gov.br", "(41) 99811-5723"],
  [633, "Gustavo Batista Santos", "GUSTAVO BATISTA SANTOS", "gustavo.batista.santos15@escola.pr.gov.br", "(41) 99252-5750"],
  [636, "Herica Carmo Gomes", "HERICA CARMO GOMES", "herica.gomes@escola.pr.gov.br", "(41) 99901-7184"],
  [645, "Julio Cesar dos Santos", "JULIO CESAR DOS SANTOS VALENTIN", "julio.anjos.santos@escola.pr.gov.br", "(41) 98849-8336"],
  [653, "Marise", "MARISE BRUNET", "marise.brunet@escola.pr.gov.br", "(41) 99603-2809"],
  [656, "Marta Caetana de Barros", "MARTA CAETANA DE BARROS SILVA", "marta.barros@escola.pr.gov.br", "(41) 99573-3911"],
  [657, "Matheus Tavares", "MATHEUS TAVARES COSTA", "matheus.tavares.costa@escola.pr.gov.br", "(41) 98531-3655"],
  [662, "Paulo Xavier", "PAULO VICTOR NUNES XAVIER", "paulovictorxavier@hotmail.com", "(41) 99605-6406"],
  [663, "Pedro Antonio Marcolino", "PEDRO ANTONIO MARCOLINO", "parmarcolino@seed.pr.gov.br", "(41) 98503-7265"],
  [665, "Rafael Belo", "RAFAEL CARNEIRO BELO DOS SANTOS", "rafaelbelo12@gmail.com", "(41) 99104-1149"],
  [668, "Robson dos Santos Amaral", "ROBSON DOS SANTOS AMARAL", "robson.santos.amaral@escola.pr.gov.br", "(41) 99554-9103"],
  [672, "Silmara Vitoriano de Barros", "SILMARA VITORIANO DE BARROS CARVALHO", "silmara.barros@escola.pr.gov.br", "(41) 99711-6877"],
  [673, "Simone Vitoriano de Barros", "SIMONE VITORIANO DE BARROS", "simone.vitoriano.barros@escola.pr.gov.br", "(41) 99818-0353"],
  [674, "Soneide Santos", "SONEIDE SOARES DA SILVA DOS SANTOS", "soneide.santos@escola.pr.gov.br", "(41) 99159-3069"],
  [678, "Wellington de Souza Machado", "WELLINGTON DE SOUZA MACHADO", "wellington@colegiocidadao.com.br", "(41) 99941-2040"],
];

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
const digitos = (s) => (s || "").replace(/\D/g, "");
const u = (process.env.DATABASE_URL || fs.readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1]).trim().replace(/^["']|["']$/g, "");

(async () => {
  const c = new Client({ connectionString: u, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log(APLICAR ? `MODO: APLICAR (${COM_EMAILS ? "telefones e e-mails" : "so telefones"})\n` : "MODO: DRY-RUN (nada sera alterado)\n");
    const ids = LISTA.map((x) => x[0]);
    const { rows } = await c.query("SELECT id, escola_id, nome, email, telefone, ativo FROM professores WHERE id = ANY($1)", [ids]);
    const porId = new Map(rows.map((r) => [r.id, r]));
    const problemas = [], telefones = [], emails = [], semTelefone = [];
    for (const [id, nomeCad, nomeLista, email, tel] of LISTA) {
      const r = porId.get(id);
      if (!r) { problemas.push(`${nomeLista}: id ${id} nao existe`); continue; }
      if (r.escola_id !== ESCOLA) { problemas.push(`${nomeLista}: id ${id} e de outra escola`); continue; }
      if (norm(r.nome) !== norm(nomeCad)) { problemas.push(`${nomeLista}: id ${id} hoje se chama "${r.nome}" (esperado "${nomeCad}")`); continue; }
      const ina = r.ativo ? "" : " (INATIVO)";
      if (tel === null) semTelefone.push(`${r.nome}${ina}: telefone atual ${r.telefone || "(vazio)"} fica como esta`);
      else if (digitos(r.telefone) !== digitos(tel)) telefones.push({ id, nome: r.nome + ina, de: r.telefone || "(vazio)", para: digitos(tel) });
      if (r.email.trim().toLowerCase() !== email.toLowerCase()) emails.push({ id, nome: r.nome + ina, de: r.email, para: email.toLowerCase() });
    }
    // e-mail novo ja usado por outro professor (qualquer escola)?
    for (const e of emails) {
      const { rows: [o] } = await c.query("SELECT count(*)::int n FROM professores WHERE lower(trim(email)) = $1 AND id <> $2", [e.para, e.id]);
      e.emUso = o.n > 0;
    }
    console.log(`Telefones a gravar: ${telefones.length}`);
    for (const t of telefones) console.log(`  ${t.nome}: ${t.de} -> ${t.para}`);
    console.log(`\nSem telefone gravado por este script: ${semTelefone.length}`);
    for (const s of semTelefone) console.log(`  ${s}`);
    console.log(`\nE-mails diferentes do cadastro: ${emails.length}${COM_EMAILS ? "" : " (NAO serao trocados sem --com-emails; o e-mail e o login do professor)"}`);
    for (const e of emails) console.log(`  ${e.nome}: ${e.de} -> ${e.para}${e.emUso ? "  [JA USADO POR OUTRO PROFESSOR: nao troca]" : ""}`);
    const { rows: fora } = await c.query(
      "SELECT nome FROM professores WHERE escola_id = $1 AND ativo AND NOT (id = ANY($2)) AND coalesce(telefone,'') = '' ORDER BY nome", [ESCOLA, ids]);
    console.log(`\nProfessores ativos do Mario Braga fora da lista e sem telefone: ${fora.length}`);
    console.log("  " + fora.map((x) => x.nome).join(", "));
    if (problemas.length) {
      console.log(`\nATENCAO (${problemas.length}): nada sera gravado enquanto houver:`);
      for (const p of problemas) console.log(`  ${p}`);
      process.exitCode = 1; return;
    }
    if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar (e --com-emails, se a escola confirmar os e-mails)."); return; }

    fs.mkdirSync("_arquivo", { recursive: true });
    const arq = path.join("_arquivo", `backup-contatos-mario-braga-0911-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(rows, null, 1));
    console.log(`\nBackup: ${arq}`);
    await c.query("BEGIN");
    try {
      for (const t of telefones) await c.query("UPDATE professores SET telefone = $1, updated_at = now() WHERE id = $2 AND escola_id = $3", [t.para, t.id, ESCOLA]);
      let ne = 0;
      if (COM_EMAILS) for (const e of emails.filter((x) => !x.emUso)) { await c.query("UPDATE professores SET email = $1, updated_at = now() WHERE id = $2 AND escola_id = $3", [e.para, e.id, ESCOLA]); ne++; }
      await c.query("COMMIT");
      console.log(`GRAVADO: ${telefones.length} telefones, ${ne} e-mails.`);
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
