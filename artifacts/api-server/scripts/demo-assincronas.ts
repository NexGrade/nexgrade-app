/**
 * [DEMO-ASSINCRONAS] (06/11/2026) Escola Demonstracao: aulas assincronas e uma Hibrida (trio com revezamento) para a
 * dona testar o calendario trimestral das assincronas (Imprimir Grade) e a agenda da presenca.
 *  1) Em ate 2 turmas de cada periodo, 2 aulas da grade OFICIAL viram assincronas (disciplinas diferentes, aulas do
 *     meio do turno, nunca aula fixa); a disciplina ganha +1 em "aulas assincronas" no vinculo da turma.
 *  2) Numa turma de outra escolha, 3 disciplinas com professores diferentes viram um trio com revezamento
 *     (grupo "demo-trio", ordem 1-2-3, comecando na segunda-feira desta semana) e 1 aula de cada vira assincrona.
 *     Atencao: o trio pede as 3 disciplinas no mesmo horario; ao gerar a grade dessa turma de novo, o motor tenta
 *     junta-las. Para tirar, use --desfazer.
 *  3) Se a escola nao tiver os trimestres de 2026, copia as datas de outra escola que tenha.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/demo-assincronas.ts                       (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/demo-assincronas.ts --aplicar             (backup + grava)
 *   pnpm --filter @workspace/api-server exec tsx scripts/demo-assincronas.ts --desfazer=<backup>   (volta o backup)
 * Relatorio em lib/db/_arquivo/demo-assincronas.txt
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const DESFAZER = process.argv.find((a) => a.startsWith("--desfazer="))?.slice("--desfazer=".length) ?? null;
const ESCOLA = process.env.ESCOLA_ID || "esc_1ce4d2d30c4146a99fb7ffa5"; // Escola Demonstracao NexGrade (ESCOLA_ID so para ensaiar em banco local)
const ANO = 2026;
const RAIZ = path.resolve(process.cwd(), "..", "..");
const ROTULO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite", integral: "Integral" };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function segundaDestaSemana(): string {
  const d = new Date(Date.now() - 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

type Backup = {
  escola: string; quando: string;
  horarios: Array<{ id: number; assincrona: boolean }>;
  vinculos: Array<{ id: number; aulasAssincronas: number; grupoTrio: string | null; trioOrdem: number | null; trioInicio: string | null }>;
  trimestresCriados: number[];
};

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const c = await pool.connect();
  try {
    const [esc] = (await c.query("select id, nome_fantasia from escolas where id = $1", [ESCOLA])).rows;
    if (!esc) throw new Error(`Escola ${ESCOLA} não encontrada.`);
    log(`Escola: ${esc.nome_fantasia} (${ESCOLA})`);

    if (DESFAZER) {
      const bk = JSON.parse(fs.readFileSync(path.resolve(RAIZ, DESFAZER), "utf8")) as Backup;
      if (bk.escola !== ESCOLA) throw new Error("O backup é de outra escola.");
      log(`Desfazer o backup de ${bk.quando}: ${bk.horarios.length} aula(s), ${bk.vinculos.length} vínculo(s), ${bk.trimestresCriados.length} trimestre(s) criado(s).`);
      if (!APLICAR) { log("\nDRY-RUN: nada gravado. Rode de novo com --aplicar junto com --desfazer para voltar."); return; }
      await c.query("begin");
      for (const h of bk.horarios) await c.query("update horarios set assincrona = $2 where id = $1 and escola_id = $3", [h.id, h.assincrona, ESCOLA]);
      for (const v of bk.vinculos) await c.query("update turma_disciplinas set aulas_assincronas = $2, grupo_trio = $3, trio_ordem = $4, trio_inicio = $5 where id = $1", [v.id, v.aulasAssincronas, v.grupoTrio, v.trioOrdem, v.trioInicio]);
      if (bk.trimestresCriados.length) await c.query("delete from trimestres_letivos where id = any($1) and escola_id = $2", [bk.trimestresCriados, ESCOLA]);
      await c.query("commit");
      log("Desfeito.");
      return;
    }

    const turmas = (await c.query("select id, nome, turno from turmas where escola_id = $1 order by turno, nome", [ESCOLA])).rows as Array<{ id: number; nome: string; turno: string }>;
    const aulas = (await c.query(
      `select h.id, h.turma_id, h.disciplina_id, h.professor_id, h.dia_semana, h.numero_aula, h.assincrona, h.fixa, d.nome as disciplina
         from horarios h join disciplinas d on d.id = h.disciplina_id
        where h.escola_id = $1 and coalesce(h.versao_grade, 'oficial') = 'oficial'`, [ESCOLA])).rows as Array<{
      id: number; turma_id: number; disciplina_id: number; professor_id: number | null; dia_semana: number; numero_aula: number; assincrona: boolean; fixa: boolean; disciplina: string;
    }>;
    const vinculos = (await c.query(
      `select td.id, td.turma_id, td.disciplina_id, td.professor_id, td.aulas_assincronas, td.grupo_trio, td.trio_ordem, td.trio_inicio::text as trio_inicio
         from turma_disciplinas td join turmas t on t.id = td.turma_id where t.escola_id = $1`, [ESCOLA])).rows as Array<{
      id: number; turma_id: number; disciplina_id: number; professor_id: number | null; aulas_assincronas: number; grupo_trio: string | null; trio_ordem: number | null; trio_inicio: string | null;
    }>;
    const profs = new Map(((await c.query("select id, nome from professores where escola_id = $1", [ESCOLA])).rows as Array<{ id: number; nome: string }>).map((p) => [p.id, p.nome]));
    log(`Turmas: ${turmas.length} · aulas na grade oficial: ${aulas.length} · já assíncronas: ${aulas.filter((a) => a.assincrona).length} · vínculos em trio: ${vinculos.filter((v) => v.grupo_trio).length}`);

    const marcar: typeof aulas = [];
    const vinc = (turmaId: number, discId: number) => vinculos.find((v) => v.turma_id === turmaId && v.disciplina_id === discId);
    const candidatas = (turmaId: number) => aulas
      .filter((a) => a.turma_id === turmaId && !a.assincrona && !a.fixa && a.professor_id != null && vinc(turmaId, a.disciplina_id))
      .sort((x, y) => Math.abs(x.numero_aula - 3) - Math.abs(y.numero_aula - 3) || x.dia_semana - y.dia_semana);

    // 2) trio: a primeira turma que tiver 3 disciplinas com professores diferentes (escolhida antes, para nao repetir turma)
    const comAulas = turmas.filter((t) => aulas.some((a) => a.turma_id === t.id));
    // 0) o que ja existe: assincronas por turma e os trios (com ou sem revezamento)
    const turmaNome = new Map(turmas.map((t) => [t.id, t]));
    const discNome = new Map(aulas.map((a) => [a.disciplina_id, a.disciplina]));
    const jaAss = new Map<number, number>();
    for (const a of aulas.filter((x) => x.assincrona)) jaAss.set(a.turma_id, (jaAss.get(a.turma_id) ?? 0) + 1);
    if (jaAss.size) log(`\n== Assíncronas que já existem: ${[...jaAss.entries()].map(([t, n]) => `${turmaNome.get(t)?.nome ?? t} (${n})`).join(", ")}`);
    const gruposExist = new Map<string, typeof vinculos>();
    for (const v of vinculos.filter((x) => (x.grupo_trio ?? "").trim())) {
      const k = `${v.turma_id}|${v.grupo_trio!.trim()}`;
      gruposExist.set(k, [...(gruposExist.get(k) ?? []), v]);
    }
    const ligarRevez: typeof vinculos = []; // vinculos de trios que ainda nao tem revezamento
    if (gruposExist.size) {
      log(`\n== Híbridas (trios) que já existem`);
      for (const [k, membros] of gruposExist) {
        const t = turmaNome.get(Number(k.split("|")[0]));
        const temRevez = membros.every((m) => m.trio_ordem && m.trio_inicio);
        log(`  ${t?.nome ?? k} (${ROTULO[t?.turno ?? ""] ?? t?.turno}) · ${membros.map((m) => `${discNome.get(m.disciplina_id) ?? `disc ${m.disciplina_id}`} — ${profs.get(m.professor_id ?? -1) ?? "sem professor"}${m.trio_ordem ? ` (ordem ${m.trio_ordem})` : ""}`).join(" / ")}`
          + (temRevez ? ` · revezamento desde ${membros[0]!.trio_inicio!.split("-").reverse().join("/")}` : " · SEM revezamento: liga agora (ordem 1-2-3 a partir desta semana)"));
        if (!temRevez) ligarRevez.push(...[...membros].sort((a, b) => a.id - b.id));
      }
    }

    let trio: { turma: { id: number; nome: string; turno: string }; aulas: typeof aulas } | null = null;
    // ja existe Hibrida na escola: nao cria outra (o trio novo atrapalharia a proxima geracao da turma)
    for (const t of gruposExist.size ? [] : comAulas) {
      const usados = new Set<number>(), discs = new Set<number>();
      const escolhidas: typeof aulas = [];
      for (const a of candidatas(t.id)) {
        if (usados.has(a.professor_id!) || discs.has(a.disciplina_id) || escolhidas.some((e) => e.dia_semana === a.dia_semana)) continue;
        if (vinc(t.id, a.disciplina_id)?.grupo_trio) continue;
        escolhidas.push(a); usados.add(a.professor_id!); discs.add(a.disciplina_id);
        if (escolhidas.length === 3) break;
      }
      if (escolhidas.length === 3) { trio = { turma: t, aulas: escolhidas }; break; }
    }

    // 1) ate 2 turmas por periodo, 2 aulas cada (fora a turma do trio)
    log("\n== Aulas que viram assíncronas (grade oficial)");
    for (const turno of [...new Set(comAulas.map((t) => t.turno))]) {
      for (const t of comAulas.filter((x) => x.turno === turno && x.id !== trio?.turma.id).slice(0, 2)) {
        const escolhidas: typeof aulas = [];
        for (const a of candidatas(t.id)) {
          if (escolhidas.some((e) => e.disciplina_id === a.disciplina_id || e.dia_semana === a.dia_semana)) continue;
          escolhidas.push(a);
          if (escolhidas.length === 2) break;
        }
        for (const a of escolhidas) log(`  ${ROTULO[turno] ?? turno} · ${t.nome} · ${DIAS[a.dia_semana]} ${a.numero_aula}ª · ${a.disciplina} — ${profs.get(a.professor_id!) ?? "?"}`);
        marcar.push(...escolhidas);
      }
    }
    const inicio = segundaDestaSemana();
    if (trio) {
      log(`\n== Híbrida (trio "demo-trio", revezamento a partir de ${inicio.split("-").reverse().join("/")}) na turma ${trio.turma.nome} (${ROTULO[trio.turma.turno] ?? trio.turma.turno})`);
      trio.aulas.forEach((a, i) => log(`  ordem ${i + 1}: ${a.disciplina} — ${profs.get(a.professor_id!) ?? "?"} · assíncrona em ${DIAS[a.dia_semana]} ${a.numero_aula}ª`));
      marcar.push(...trio.aulas);
    } else if (!gruposExist.size) log("\n== Híbrida: nenhuma turma com 3 disciplinas de professores diferentes livres para o trio (não cria).");

    const tri = (await c.query("select id, trimestre, data_inicio::text as ini, data_fim::text as fim from trimestres_letivos where escola_id = $1 and ano = $2 order by trimestre", [ESCOLA, ANO])).rows;
    let copiarTri: Array<{ trimestre: number; ini: string; fim: string; dias_letivos: number }> = [];
    if (tri.length) log(`\n== Trimestres de ${ANO}: já cadastrados (${tri.map((t: any) => `${t.trimestre}º ${t.ini}..${t.fim}`).join("; ")}).`);
    else {
      const outra = (await c.query(
        `select escola_id, count(*) n from trimestres_letivos where ano = $1 and escola_id <> $2 group by escola_id having count(*) = 3 order by escola_id limit 1`, [ANO, ESCOLA])).rows[0];
      if (outra) {
        copiarTri = (await c.query("select trimestre, data_inicio::text as ini, data_fim::text as fim, dias_letivos from trimestres_letivos where escola_id = $1 and ano = $2 order by trimestre", [outra.escola_id, ANO])).rows;
        log(`\n== Trimestres de ${ANO}: a escola não tem; copia de ${outra.escola_id}: ${copiarTri.map((t) => `${t.trimestre}º ${t.ini}..${t.fim}`).join("; ")}`);
      } else log(`\n== Trimestres de ${ANO}: a escola não tem e nenhuma outra tem os 3 cadastrados. Cadastre em Calendário e Turnos.`);
    }

    log(`\nTotal: ${marcar.length} aula(s) viram assíncronas${trio ? ", 1 trio novo" : ""}${ligarRevez.length ? `, revezamento ligado em ${ligarRevez.length} vínculo(s) de Híbrida` : ""}${copiarTri.length ? `, ${copiarTri.length} trimestre(s)` : ""}.`);
    if (!APLICAR) { log("\nDRY-RUN: nada gravado. Confira e rode de novo com --aplicar."); return; }

    // backup
    const idsVinc = new Set<number>();
    for (const a of marcar) idsVinc.add(vinc(a.turma_id, a.disciplina_id)!.id);
    for (const v of ligarRevez) idsVinc.add(v.id);
    const bk: Backup = {
      escola: ESCOLA, quando: new Date().toISOString(),
      horarios: marcar.map((a) => ({ id: a.id, assincrona: a.assincrona })),
      vinculos: vinculos.filter((v) => idsVinc.has(v.id)).map((v) => ({ id: v.id, aulasAssincronas: v.aulas_assincronas, grupoTrio: v.grupo_trio, trioOrdem: v.trio_ordem, trioInicio: v.trio_inicio })),
      trimestresCriados: [],
    };
    await c.query("begin");
    for (const a of marcar) {
      await c.query("update horarios set assincrona = true where id = $1 and escola_id = $2", [a.id, ESCOLA]);
      await c.query("update turma_disciplinas set aulas_assincronas = aulas_assincronas + 1 where id = $1", [vinc(a.turma_id, a.disciplina_id)!.id]);
    }
    // Hibridas que ja existiam sem revezamento: ordem 1-2-3 (pela ordem do cadastro) a partir desta semana
    const porGrupo = new Map<string, typeof vinculos>();
    for (const v of ligarRevez) { const k = `${v.turma_id}|${v.grupo_trio!.trim()}`; porGrupo.set(k, [...(porGrupo.get(k) ?? []), v]); }
    for (const membros of porGrupo.values()) for (const [i, v] of membros.entries())
      await c.query("update turma_disciplinas set trio_ordem = $2, trio_inicio = $3 where id = $1", [v.id, i + 1, inicio]);
    if (trio) for (const [i, a] of trio.aulas.entries())
      await c.query("update turma_disciplinas set grupo_trio = 'demo-trio', trio_ordem = $2, trio_inicio = $3 where id = $1", [vinc(a.turma_id, a.disciplina_id)!.id, i + 1, inicio]);
    for (const t of copiarTri) {
      const r = await c.query("insert into trimestres_letivos (escola_id, ano, trimestre, data_inicio, data_fim, dias_letivos) values ($1, $2, $3, $4, $5, $6) returning id", [ESCOLA, ANO, t.trimestre, t.ini, t.fim, t.dias_letivos]);
      bk.trimestresCriados.push(r.rows[0].id);
    }
    // o backup vai para o disco antes de confirmar: sem ele, nada e gravado
    fs.mkdirSync(path.join(RAIZ, "lib", "db", "_arquivo"), { recursive: true });
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-demo-assincronas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arqBk, JSON.stringify(bk, null, 1));
    await c.query("commit");
    log(`\nGravado. Backup para desfazer: ${path.relative(RAIZ, arqBk)}`);
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    fs.mkdirSync(path.join(RAIZ, "lib", "db", "_arquivo"), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, "lib", "db", "_arquivo", "demo-assincronas.txt"), linhas.join("\n"));
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
