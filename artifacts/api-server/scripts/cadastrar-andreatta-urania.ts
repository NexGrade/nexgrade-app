/**
 * [ANDREATTA-URANIA] (11/11/2026) Primeiro cadastro do C.E. Andre Andreatta - EFM (Quatro Barras) pelo Urania
 * (manha 31/08/2026, tarde 11/05/2026), SEM o arquivo do RCO (decisao da dona em 11/11: so pelos PDFs).
 * Dados lidos dos PDFs por lib/db/ler-urania-andreatta.py em lib/db/urania-andreatta-2026.json.
 *  - Cursos e matrizes do catalogo (semearCatalogoEscola, a mesma funcao da tela): Fundamental Anos Finais Diurno,
 *    Ensino Medio 2026 (Linguagens/C. Humanas e Matematica/C. Natureza), Tecnico em Administracao integrado
 *    (1a serie, 2511) e a 3a serie do Tecnico em Administracao como esta no RCO (1624).
 *  - Esquema de aulas pelo Urania: manha Fundamental 07:30 08:20 09:10 10:20 11:10; manha Medio/Tecnico + 12:00;
 *    tarde 13:10 14:00 14:50 15:50 16:40 (50 min).
 *  - 20 turmas (ano letivo 2026), SEM codigo SERE (entra quando vier o arquivo do RCO).
 *  - Vinculos turma x disciplina pela matriz da turma, com o professor do Urania; Lingua Espanhola (facultativa)
 *    fica de fora, menos no 3oB, onde a escola da Espanhol (3 aulas) no lugar de Lingua Inglesa I.
 *  - Codocencia: "R9A", "R6C"... do relatorio de professores = professor de apoio da recomposicao da turma
 *    (turma_disciplinas.professor_apoio_id + a aula do apoio nos mesmos horarios do titular).
 *  - Professores com e-mail provisorio sem-email.<nome>.andreatta@pendente.invalid (trocar na tela de Professores).
 *  - Disponibilidade: HA do Urania = HA; COR (coordenacao) e traco = indisponivel.
 *  - So roda em escola sem turmas e sem aulas (primeiro cadastro).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/cadastrar-andreatta-urania.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/cadastrar-andreatta-urania.ts --aplicar  (grava)
 * Relatorio em lib/db/_arquivo/cadastro-andreatta-urania.txt
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.resolve(process.cwd(), "..", "..");
type Curso = { tipo: "oficial"; id: string } | { tipo: "tecnico"; codigo: string };
const DADOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "lib", "db", "urania-andreatta-2026.json"), "utf8")) as {
  escola: string;
  fonte: Record<string, string>;
  horas: Record<string, string[]>; // "turno|nivel" -> horas de inicio
  turmas: Record<string, { turno: string; serie: string; nivel: "fundamental" | "medio_tecnico"; curso: Curso }>;
  aulas: Array<{ turma: string; dia: number; aula: number; sigla: string; disciplina: string; professor: string; apoio: boolean }>;
  disponibilidade: Array<{ professor: string; turno: string; dia: number; aula: number; tipo: "HA" | "BLQ" | "COR" }>;
  professores: Record<string, string>; // chave -> nome no cadastro
};
const ESCOLA = DADOS.escola;
const ANO_LETIVO = 2026;
const DATA_TURNO: Record<string, string> = { matutino: "31/08", vespertino: "11/05" };
const MOTIVO_HA = (turno: string) => `Importado do sistema anterior ${DATA_TURNO[turno]} (HA)`;
const MOTIVO_BLQ = "Bloqueio (importado)";
const MOTIVO_COR = "Coordenação (importado)";
// 3oB: a escola da Espanhol no lugar de Lingua Inglesa I (3 aulas)
const TROCAS_MATRIZ: Record<string, { sai: string; entra: string; carga: number }> = {
  "3ºB": { sai: "Língua Inglesa I", entra: "Língua Espanhola", carga: 3 },
};
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const chaveNome = (s: string) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
const slug = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const { semearCatalogoEscola, chaveCurso, listarModelosCatalogo } = await import("../src/lib/semear-catalogo");
  const { MATRIZES_OFICIAIS_SEED_PR } = await import("../src/lib/matrizes-oficiais-seed-pr");
  const { MATRIZES_TECNICAS_SEED_PR_2026 } = await import("../src/lib/matrizes-tecnicas-seed-pr");
  const { padronizarNomeDisciplina } = await import("../src/lib/padronizar-nome-disciplina");
  const nomeDisc = (n: string) => chaveNome(padronizarNomeDisciplina(n));
  const c = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
    const [esc] = await q("select id, nome_fantasia from escolas where id=$1", [ESCOLA]);
    if (!esc) throw new Error(`escola ${ESCOLA} nao encontrada`);
    log(`Escola: ${esc.nome_fantasia} (${ESCOLA})`);
    for (const [t, f] of Object.entries(DADOS.fonte)) log(`  ${t}: ${f}`);
    const [{ n: turmasHoje }] = await q("select count(*)::int n from turmas where escola_id=$1", [ESCOLA]);
    const [{ n: aulasHoje }] = await q("select count(*)::int n from horarios where escola_id=$1", [ESCOLA]);
    const [{ n: slotsHoje }] = await q("select count(*)::int n from horario_slots where escola_id=$1", [ESCOLA]);
    const [{ n: profsHoje }] = await q("select count(*)::int n from professores where escola_id=$1", [ESCOLA]);
    if (turmasHoje || aulasHoje || slotsHoje || profsHoje) {
      log(`PARADO: a escola ja tem ${turmasHoje} turma(s), ${aulasHoje} aula(s), ${slotsHoje} horario(s) de aula e ${profsHoje} professor(es). Este script e so para o primeiro cadastro.`);
      process.exitCode = 1; return;
    }

    // ---- cursos do catalogo usados pelas turmas
    const catalogo = listarModelosCatalogo();
    const modeloDe = (cu: Curso) => {
      if (cu.tipo === "oficial") {
        const m = MATRIZES_OFICIAIS_SEED_PR.find((x) => x.id === cu.id)!;
        const r = catalogo.find((x) => x.nome === m.label && !x.formaOferta)!;
        return { chave: r.chave, nome: r.nome, series: m.series };
      }
      const m = (MATRIZES_TECNICAS_SEED_PR_2026 as any[]).find((x) => x.codigo === cu.codigo)!;
      const r = catalogo.find((x) => x.codigoCurso === cu.codigo)!;
      return { chave: r.chave, nome: r.nome, series: m.series as Array<{ serieAno: string; itens: Array<{ nome: string; cargaHorariaSemanal: number; obrigatoria?: boolean }> }> };
    };
    const problemas: string[] = [];
    const cursosUsados = new Map<string, ReturnType<typeof modeloDe>>();
    for (const t of Object.values(DADOS.turmas)) { const m = modeloDe(t.curso); cursosUsados.set(m.chave, m); }
    log(`\n== 1) Cursos e matrizes do catalogo (${cursosUsados.size})`);
    for (const m of cursosUsados.values()) {
      const turmasDoCurso = Object.entries(DADOS.turmas).filter(([, t]) => modeloDe(t.curso).chave === m.chave).map(([n]) => n);
      log(`  ${m.nome}\n     series: ${m.series.map((s) => s.serieAno).join(", ")} | turmas: ${turmasDoCurso.join(" ")}`);
    }

    // ---- vinculos esperados por turma (itens da matriz) e conferencia das aulas
    type Item = { nome: string; carga: number };
    const vinculosDe = (nomeTurma: string): Item[] => {
      const t = DADOS.turmas[nomeTurma];
      const serie = modeloDe(t.curso).series.find((s) => chaveNome(s.serieAno) === chaveNome(t.serie));
      if (!serie) { problemas.push(`${nomeTurma}: serie ${t.serie} nao existe no curso`); return []; }
      let itens = serie.itens.filter((i) => i.obrigatoria !== false).map((i) => ({ nome: i.nome, carga: i.cargaHorariaSemanal }));
      const tr = TROCAS_MATRIZ[nomeTurma];
      if (tr) itens = [...itens.filter((i) => nomeDisc(i.nome) !== nomeDisc(tr.sai)), { nome: tr.entra, carga: tr.carga }];
      return itens;
    };
    log(`\n== 2) Esquema de aulas`);
    for (const [k, hs] of Object.entries(DADOS.horas)) log(`  ${k.replace("|", " / ")}: ${hs.join(" ")}`);

    log(`\n== 3) Turmas e vinculos (disciplina: aulas no Urania / carga da matriz, professor [+ apoio])`);
    const titularDe = new Map<string, Set<string>>(); // turma|disc -> professores titulares
    const apoioDe = new Map<string, Set<string>>();
    for (const a of DADOS.aulas) {
      const k = `${a.turma}|${nomeDisc(a.disciplina)}`;
      const m = a.apoio ? apoioDe : titularDe;
      m.set(k, (m.get(k) ?? new Set()).add(a.professor));
    }
    const nomeProf = (k: string) => DADOS.professores[k] ?? k;
    for (const [nt, t] of Object.entries(DADOS.turmas)) {
      const itens = vinculosDe(nt);
      const aulasT = DADOS.aulas.filter((a) => a.turma === nt && !a.apoio);
      log(`  ${nt} (${t.turno}, ${t.serie}, ${modeloDe(t.curso).nome}) — ${aulasT.length} aulas`);
      for (const it of itens) {
        const k = `${nt}|${nomeDisc(it.nome)}`;
        const n = aulasT.filter((a) => nomeDisc(a.disciplina) === nomeDisc(it.nome)).length;
        const tit = [...(titularDe.get(k) ?? [])], ap = [...(apoioDe.get(k) ?? [])];
        log(`     ${it.nome}: ${n}/${it.carga} ${tit.map(nomeProf).join(", ") || "(sem professor)"}${ap.length ? ` + apoio ${ap.map(nomeProf).join(", ")}` : ""}`);
        if (n !== it.carga) problemas.push(`${nt} ${it.nome}: ${n} aula(s) no Urania, ${it.carga} na matriz`);
        if (tit.length > 1) problemas.push(`${nt} ${it.nome}: ${tit.length} professores titulares (${tit.map(nomeProf).join(", ")})`);
        if (ap.length > 1) problemas.push(`${nt} ${it.nome}: ${ap.length} professores de apoio`);
      }
      for (const a of aulasT) if (!itens.some((i) => nomeDisc(i.nome) === nomeDisc(a.disciplina))) problemas.push(`${nt} ${DIAS[a.dia]} ${a.aula}a: ${a.sigla} (${a.disciplina}) nao esta na matriz da turma`);
    }

    // ---- choques: professor em dois lugares no mesmo turno/dia/aula; turma com duas aulas no mesmo horario
    const ocup = new Map<string, string>();
    for (const a of DADOS.aulas) {
      const t = DADOS.turmas[a.turma];
      const kp = `${a.professor}|${t.turno}|${a.dia}|${a.aula}`;
      if (ocup.has(kp)) problemas.push(`${nomeProf(a.professor)} em duas turmas em ${t.turno} ${DIAS[a.dia]} ${a.aula}a: ${ocup.get(kp)} e ${a.turma}`);
      ocup.set(kp, a.turma);
    }
    // professor de apoio so junto do titular, na mesma disciplina e no mesmo horario
    for (const a of DADOS.aulas.filter((x) => x.apoio)) {
      const tit = DADOS.aulas.some((x) => !x.apoio && x.turma === a.turma && x.dia === a.dia && x.aula === a.aula && nomeDisc(x.disciplina) === nomeDisc(a.disciplina));
      if (!tit || !/^rec/i.test(nomeDisc(a.disciplina)) && !/recomposi/i.test(nomeDisc(a.disciplina))) problemas.push(`${nomeProf(a.professor)} de apoio em ${a.turma} ${DIAS[a.dia]} ${a.aula}a fora de recomposicao (${a.disciplina})`);
    }
    for (const x of (DADOS as any).avisos_corrigidos ?? []) log(`CORRIGIDO NA LEITURA: ${x}`);
    const ocT = new Set<string>();
    for (const a of DADOS.aulas.filter((x) => !x.apoio)) {
      const k = `${a.turma}|${a.dia}|${a.aula}`;
      if (ocT.has(k)) problemas.push(`${a.turma} com duas aulas em ${DIAS[a.dia]} ${a.aula}a`);
      ocT.add(k);
    }

    // ---- professores
    const profDisc = new Map<string, Set<string>>();
    for (const a of DADOS.aulas) profDisc.set(a.professor, (profDisc.get(a.professor) ?? new Set()).add(a.disciplina));
    log(`\n== 4) Professores (${Object.keys(DADOS.professores).length}), todos novos, e-mail provisorio`);
    for (const [k, n] of Object.entries(DADOS.professores).sort((x, y) => x[1].localeCompare(y[1]))) {
      const turnos = [...new Set(DADOS.aulas.filter((a) => a.professor === k).map((a) => DADOS.turmas[a.turma].turno))];
      const nAulas = DADOS.aulas.filter((a) => a.professor === k).length;
      const nHA = DADOS.disponibilidade.filter((d) => d.professor === k && d.tipo === "HA").length;
      log(`  ${n.padEnd(12)} ${String(nAulas).padStart(2)} aulas, ${String(nHA).padStart(2)} HA (${turnos.join("+") || "sem aula"}) | ${[...(profDisc.get(k) ?? [])].join(", ")}`);
    }

    const cont = (t: string) => DADOS.disponibilidade.filter((d) => d.tipo === t).length;
    log(`\n== 5) Disponibilidade: ${cont("HA")} HA, ${cont("COR")} coordenacao, ${cont("BLQ")} bloqueios (tracos do Urania)`);
    // HA/bloqueio em cima de aula do proprio professor
    for (const d of DADOS.disponibilidade) {
      if (ocup.has(`${d.professor}|${d.turno}|${d.dia}|${d.aula}`)) problemas.push(`${nomeProf(d.professor)} ${d.tipo} em cima de aula: ${d.turno} ${DIAS[d.dia]} ${d.aula}a`);
    }
    const nApoio = DADOS.aulas.filter((a) => a.apoio).length;
    log(`== 6) Aulas na grade oficial: ${DADOS.aulas.length} (${DADOS.aulas.length - nApoio} + ${nApoio} de professor de apoio)`);
    for (const [nt, tr] of Object.entries(TROCAS_MATRIZ)) log(`\nCONFERIR COM A ESCOLA: ${nt} tem ${tr.entra} (${tr.carga} aulas) no Urania; a matriz 2026 tem ${tr.sai} (${tr.carga}). Ficou ${tr.entra}.`);
    log("SEM CODIGO SERE: as turmas entram sem codigo do SERE; o envio ao RCO depende do arquivo do RCO da escola.");

    if (problemas.length) { log(`\nATENCAO (${problemas.length}):`); problemas.forEach((p) => log("  - " + p)); }
    else log("\nNenhum problema encontrado.");
    if (!APLICAR) { log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); return; }
    if (problemas.length) { log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); process.exitCode = 1; return; }

    // ======== grava
    const r = await semearCatalogoEscola(ESCOLA, { chaves: [...cursosUsados.keys()], ofertar: true });
    log(`\nCatalogo: ${r.cursosCriados} curso(s), ${r.matrizesCriadas} matriz(es), ${r.disciplinasCriadas} disciplina(s)`);

    await c.query("BEGIN");
    try {
      const cursos = await q("select id, nome from cursos where escola_id=$1", [ESCOLA]);
      const matrizes = await q("select id, curso_id, serie_ano from matrizes_curriculares where escola_id=$1", [ESCOLA]);
      const discs = await q("select id, nome from disciplinas where escola_id=$1", [ESCOLA]);
      const discId = (nome: string) => {
        const d = discs.find((x) => nomeDisc(x.nome) === nomeDisc(nome));
        if (!d) throw new Error(`disciplina ${nome} nao encontrada depois do catalogo`);
        return d.id as number;
      };
      const matrizDe = (t: { curso: Curso; serie: string }) => {
        const m = modeloDe(t.curso);
        const cu = cursos.find((x) => chaveNome(x.nome) === chaveNome(m.nome));
        const mt = cu && matrizes.find((x) => x.curso_id === cu.id && chaveNome(x.serie_ano) === chaveNome(t.serie));
        if (!mt) throw new Error(`matriz ${m.nome} ${t.serie} nao encontrada depois do catalogo`);
        return mt.id as number;
      };

      // esquema de aulas
      for (const [k, hs] of Object.entries(DADOS.horas)) {
        const [turno, nivel] = k.split("|");
        for (const [i, h] of hs.entries()) {
          await c.query("insert into horario_slots (escola_id, turno, nivel_ensino, numero_aula, hora_inicio, duracao_minutos, letivo) values ($1,$2,$3,$4,$5,50,true)",
            [ESCOLA, turno, turno === "matutino" ? nivel : null, i + 1, h]);
        }
      }

      // professores
      const profId = new Map<string, number>();
      for (const [k, n] of Object.entries(DADOS.professores)) {
        const [novo] = await q("insert into professores (escola_id, nome, email) values ($1,$2,$3) returning id", [ESCOLA, n, `sem-email.${slug(n)}.andreatta@pendente.invalid`]);
        profId.set(k, novo.id);
      }

      // turmas e vinculos
      const turmaId = new Map<string, number>();
      for (const [nt, t] of Object.entries(DADOS.turmas)) {
        const [nova] = await q("insert into turmas (escola_id, nome, serie, turno, nivel_ensino, ano_letivo, matriz_curricular_id) values ($1,$2,$3,$4,$5,$6,$7) returning id",
          [ESCOLA, nt, t.serie, t.turno, t.nivel, ANO_LETIVO, matrizDe(t)]);
        turmaId.set(nt, nova.id);
        for (const it of vinculosDe(nt)) {
          const k = `${nt}|${nomeDisc(it.nome)}`;
          const tit = [...(titularDe.get(k) ?? [])][0], ap = [...(apoioDe.get(k) ?? [])][0];
          await c.query("insert into turma_disciplinas (turma_id, disciplina_id, professor_id, professor_apoio_id, carga_horaria_semanal_override) values ($1,$2,$3,$4,$5)",
            [nova.id, discId(it.nome), tit ? profId.get(tit) : null, ap ? profId.get(ap) : null, it.carga]);
        }
      }

      // professor x disciplina
      for (const [p, ds] of profDisc) for (const d of ds) {
        await c.query("insert into professor_disciplinas (professor_id, disciplina_id) select $1,$2 where not exists (select 1 from professor_disciplinas where professor_id=$1 and disciplina_id=$2)", [profId.get(p), discId(d)]);
      }

      // disponibilidade
      for (const d of DADOS.disponibilidade) {
        const ha = d.tipo === "HA";
        await c.query(
          `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [profId.get(d.professor), d.dia, d.aula, d.turno, ha, ha, ha ? MOTIVO_HA(d.turno) : d.tipo === "COR" ? MOTIVO_COR : MOTIVO_BLQ]);
      }

      // aulas
      for (const a of DADOS.aulas) {
        await c.query(
          "insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade) values ($1,$2,$3,$4,$5,$6,'oficial')",
          [ESCOLA, turmaId.get(a.turma), discId(a.disciplina), profId.get(a.professor), a.dia, a.aula]);
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    log("\nGRAVADO. Confira com: pnpm --filter @workspace/api-server exec tsx scripts/ver-conflitos.ts " + ESCOLA);
  } catch (e: any) {
    log("ERRO: " + (e?.message ?? e)); process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "cadastro-andreatta-urania.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio completo: ${arq}`);
  }
}
main();
