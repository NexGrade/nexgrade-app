/**
 * [IEDO-URANIA] (31/10/2026) Cadastro do C.E. Iedo Nespolo pelo Urania (29/10/2026): cursos e matrizes do Ensino
 * Medio 2026 (catalogo geral, lib/matrizes-oficiais-seed-pr.ts), turmas (matriz, codigos SERE), vinculos,
 * professores, disponibilidade (HA e tracos) e as 450 aulas. Dados lidos dos PDFs e do EXPORT_URANIA.XML em
 * lib/db/urania-iedo-2026-10-29.json.
 *  - Cursos: os 2 do Ensino Medio 2026 entram pela mesma funcao da tela de catalogo (semearCatalogoEscola);
 *    os 2 de 2025 deixam de ser ofertados (nao sao apagados).
 *  - Vinculos das 15 turmas sao refeitos pela matriz nova, sem Lingua Espanhola (fora da grade do Urania;
 *    decisao da escola em 31/10). So roda se a escola ainda nao tiver aula na grade.
 *  - Professor novo com e-mail provisorio sem-email.<nome>@pendente.invalid (trocar na tela de Professores).
 *  - Horarios da manha pelo Urania (07:30 08:20 09:10 10:15 11:05 11:55).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/cadastrar-iedo-urania.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/cadastrar-iedo-urania.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/cadastro-iedo-urania.txt
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.resolve(process.cwd(), "..", "..");
const DADOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "lib", "db", "urania-iedo-2026-10-29.json"), "utf8")) as {
  escola: string;
  turmas: Record<string, { turno: string; serie: string; itinerario: "lggchs" | "matcnt"; codigoSere: number; codigoSereIf: number | null }>;
  aulas: Array<{ turma: string; dia: number; aula: number; disciplina: string; professor: string }>;
  disponibilidade: Array<{ professor: string; turno: string; dia: number; aula: number; tipo: "HA" | "BLQ" }>;
  horasManha: string[];
};
const ESCOLA = DADOS.escola;
const MODELO = { lggchs: "medio_2026_tempo_parcial_diurno_lggchs", matcnt: "medio_2026_tempo_parcial_diurno_matcnt" } as const;
const FORA_DA_GRADE = new Set(["Língua Espanhola"]);
const MOTIVO_HA = "Importado do sistema anterior 29/10 (HA)";
const MOTIVO_BLQ = "Bloqueio (importado)";
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
  const { semearCatalogoEscola, chaveCurso } = await import("../src/lib/semear-catalogo");
  const { MATRIZES_OFICIAIS_SEED_PR } = await import("../src/lib/matrizes-oficiais-seed-pr");
  const { padronizarNomeDisciplina } = await import("../src/lib/padronizar-nome-disciplina");
  const nomeDisc = (n: string) => chaveNome(padronizarNomeDisciplina(n));
  const c = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
    const [esc] = await q("select id, nome_fantasia from escolas where id=$1", [ESCOLA]);
    if (!esc) throw new Error(`escola ${ESCOLA} nao encontrada`);
    log(`Escola: ${esc.nome_fantasia} (${ESCOLA})`);
    const [{ n: aulasHoje }] = await q("select count(*)::int n from horarios where escola_id=$1", [ESCOLA]);
    if (aulasHoje > 0) { log(`PARADO: a escola ja tem ${aulasHoje} aula(s) na grade. Este script e so para o primeiro cadastro.`); process.exitCode = 1; return; }

    const turmas = await q("select id, nome, turno, matriz_curricular_id from turmas where escola_id=$1", [ESCOLA]);
    const turmaPorNome = new Map(turmas.map((t) => [t.nome, t]));
    const faltam = Object.keys(DADOS.turmas).filter((n) => !turmaPorNome.has(n));
    if (faltam.length) throw new Error(`turmas do Urania sem cadastro: ${faltam.join(", ")}`);

    // 1) cursos do Ensino Medio 2026
    const modelos = Object.values(MODELO).map((id) => MATRIZES_OFICIAIS_SEED_PR.find((m) => m.id === id)!);
    const chaves = modelos.map((m) => chaveCurso(m.label, null));
    const cursos = await q("select id, nome, ofertado from cursos where escola_id=$1", [ESCOLA]);
    log(`\n== 1) Cursos do Ensino Medio 2026`);
    for (const m of modelos) {
      const ja = cursos.find((x) => chaveNome(x.nome) === chaveNome(m.label));
      log(`  ${ja ? `ja existe (#${ja.id})` : "vai criar"}: ${m.label} — ${m.series.map((s) => `${s.serieAno} ${s.itens.length} disc.`).join(", ")}`);
    }
    const antigos = cursos.filter((x) => /^Ensino Médio - Tempo Parcial Diurno/.test(x.nome) && x.ofertado);
    for (const x of antigos) log(`  deixa de ser ofertado: #${x.id} ${x.nome}`);

    // disciplinas: as do Urania tem que estar na matriz da serie/itinerario da turma
    const problemas: string[] = [];
    for (const a of DADOS.aulas) {
      const t = DADOS.turmas[a.turma];
      const serie = MATRIZES_OFICIAIS_SEED_PR.find((m) => m.id === MODELO[t.itinerario])!.series.find((s) => s.serieAno === t.serie);
      if (!serie?.itens.some((i) => nomeDisc(i.nome) === nomeDisc(a.disciplina))) problemas.push(`${a.turma} ${DIAS[a.dia]} ${a.aula}a: ${a.disciplina} nao esta na matriz ${t.serie} ${t.itinerario}`);
    }

    // 2) turmas
    log(`\n== 2) Turmas (matriz 2026 e codigos SERE)`);
    for (const [n, t] of Object.entries(DADOS.turmas).sort()) log(`  ${n.padEnd(4)} ${t.serie} ${t.itinerario === "lggchs" ? "Linguagens e C. Humanas" : "Matematica e C. da Natureza"} | SERE ${t.codigoSere}${t.codigoSereIf ? ` / IF ${t.codigoSereIf}` : ""}`);

    // professores
    const profsHoje = await q("select id, nome from professores where escola_id=$1", [ESCOLA]);
    const nomesUrania = [...new Set([...DADOS.aulas.map((a) => a.professor), ...DADOS.disponibilidade.map((d) => d.professor)])].sort();
    const profExiste = (n: string) => profsHoje.find((p) => chaveNome(p.nome) === chaveNome(n) || chaveNome(p.nome).split(" ")[0] === chaveNome(n) && !n.includes(" "));
    const novos = nomesUrania.filter((n) => !profExiste(n));
    log(`\n== 4) Professores: ${nomesUrania.length} no Urania, ${nomesUrania.length - novos.length} ja cadastrado(s), ${novos.length} novo(s)`);
    log(`  novos: ${novos.join(", ")}`);
    const profDisc = new Map<string, Set<string>>();
    for (const a of DADOS.aulas) profDisc.set(a.professor, (profDisc.get(a.professor) ?? new Set()).add(a.disciplina));
    for (const [p, ds] of [...profDisc].sort()) log(`  ${p.padEnd(18)} ${[...ds].join(", ")}`);

    // vinculos turma x disciplina: um professor por disciplina na turma
    const profDaDisc = new Map<string, Set<string>>();
    for (const a of DADOS.aulas) { const k = `${a.turma}|${nomeDisc(a.disciplina)}`; profDaDisc.set(k, (profDaDisc.get(k) ?? new Set()).add(a.professor)); }
    for (const [k, ps] of profDaDisc) if (ps.size > 1) problemas.push(`vinculo ${k} com ${ps.size} professores: ${[...ps].join(", ")}`);

    const nHA = DADOS.disponibilidade.filter((d) => d.tipo === "HA").length;
    log(`\n== 5) Disponibilidade: ${nHA} HA e ${DADOS.disponibilidade.length - nHA} bloqueios (tracos do Urania)`);
    log(`== 6) Aulas: ${DADOS.aulas.length} em ${Object.keys(DADOS.turmas).length} turmas`);
    const slotsManha = await q("select id, numero_aula, hora_inicio::text h, nivel_ensino from horario_slots where escola_id=$1 and turno='matutino' order by numero_aula", [ESCOLA]);
    const trocasHora = slotsManha.filter((s) => DADOS.horasManha[s.numero_aula - 1] && s.h.slice(0, 5) !== DADOS.horasManha[s.numero_aula - 1]);
    log(`== 7) Horarios da manha: ${trocasHora.length ? trocasHora.map((s) => `${s.numero_aula}a ${s.h.slice(0, 5)} -> ${DADOS.horasManha[s.numero_aula - 1]}`).join(", ") : "ja iguais ao Urania"}`);

    if (problemas.length) { log(`\nATENCAO (${problemas.length}):`); problemas.forEach((p) => log("  - " + p)); }
    if (!APLICAR) { log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); return; }
    if (problemas.length) { log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); process.exitCode = 1; return; }

    // ---- backup
    const backup = {
      turmas: await q("select * from turmas where escola_id=$1", [ESCOLA]),
      turmaDisciplinas: await q("select td.* from turma_disciplinas td join turmas t on t.id=td.turma_id where t.escola_id=$1", [ESCOLA]),
      cursos: await q("select * from cursos where escola_id=$1", [ESCOLA]),
      professores: profsHoje,
      disponibilidade: await q("select d.* from disponibilidade_professores d join professores p on p.id=d.professor_id where p.escola_id=$1", [ESCOLA]),
      horarioSlots: await q("select * from horario_slots where escola_id=$1", [ESCOLA]),
    };
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-iedo-urania-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(backup, null, 1));
    log(`\nBackup: ${arqBk}`);

    // 1) cursos e matrizes pela funcao do catalogo (cria so o que falta)
    const r = await semearCatalogoEscola(ESCOLA, { chaves, ofertar: true });
    log(`Catalogo: ${r.cursosCriados} curso(s) criado(s), ${r.matrizesCriadas} matriz(es), ${r.disciplinasCriadas} disciplina(s) nova(s)`);

    await c.query("BEGIN");
    try {
      for (const x of antigos) await c.query("update cursos set ofertado=false where id=$1 and escola_id=$2", [x.id, ESCOLA]);
      const cursosNovos = await q("select id, nome from cursos where escola_id=$1", [ESCOLA]);
      const matrizes = await q("select m.id, m.curso_id, m.serie_ano from matrizes_curriculares m where m.escola_id=$1", [ESCOLA]);
      const itens = await q("select i.matriz_curricular_id, i.disciplina_id, i.carga_horaria_semanal, d.nome from itens_matriz i join disciplinas d on d.id=i.disciplina_id join matrizes_curriculares m on m.id=i.matriz_curricular_id where m.escola_id=$1", [ESCOLA]);
      const matrizDe = (itin: "lggchs" | "matcnt", serie: string) => {
        const label = MATRIZES_OFICIAIS_SEED_PR.find((m) => m.id === MODELO[itin])!.label;
        const curso = cursosNovos.find((x) => chaveNome(x.nome) === chaveNome(label));
        const mt = curso && matrizes.find((m) => m.curso_id === curso.id && chaveNome(m.serie_ano) === chaveNome(serie));
        if (!mt) throw new Error(`matriz ${label} ${serie} nao encontrada depois do catalogo`);
        return mt.id as number;
      };

      // 4) professores
      const profId = new Map<string, number>();
      for (const n of nomesUrania) {
        const ja = profExiste(n);
        if (ja) { profId.set(n, ja.id); continue; }
        const [novo] = await q("insert into professores (escola_id, nome, email) values ($1,$2,$3) returning id", [ESCOLA, n, `sem-email.${slug(n)}@pendente.invalid`]);
        profId.set(n, novo.id);
      }

      // 2) e 3) turmas e vinculos
      for (const [n, t] of Object.entries(DADOS.turmas)) {
        const tid = turmaPorNome.get(n)!.id;
        const mid = matrizDe(t.itinerario, t.serie);
        await c.query("update turmas set matriz_curricular_id=$1, nivel_ensino='medio_tecnico', codigo_sere=$2, codigo_sere_if=$3 where id=$4",
          [mid, t.codigoSere, t.codigoSereIf, tid]);
        await c.query("delete from turma_disciplinas where turma_id=$1", [tid]);
        for (const it of itens.filter((i) => i.matriz_curricular_id === mid && !FORA_DA_GRADE.has(i.nome))) {
          const ps = [...(profDaDisc.get(`${n}|${nomeDisc(it.nome)}`) ?? [])];
          await c.query("insert into turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override) values ($1,$2,$3,$4)",
            [tid, it.disciplina_id, ps.length ? profId.get(ps[0]) : null, it.carga_horaria_semanal]);
        }
      }

      // disciplina pelo nome (depois do catalogo)
      const discs = await q("select id, nome from disciplinas where escola_id=$1", [ESCOLA]);
      const discId = (nome: string) => {
        const d = discs.find((x) => nomeDisc(x.nome) === nomeDisc(nome));
        if (!d) throw new Error(`disciplina ${nome} nao encontrada`);
        return d.id as number;
      };
      for (const [p, ds] of profDisc) for (const d of ds) {
        await c.query("insert into professor_disciplinas (professor_id, disciplina_id) select $1,$2 where not exists (select 1 from professor_disciplinas where professor_id=$1 and disciplina_id=$2)", [profId.get(p), discId(d)]);
      }

      // 5) disponibilidade
      for (const d of DADOS.disponibilidade) {
        const ha = d.tipo === "HA";
        await c.query(
          `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
           values ($1,$2,$3,$4,$5,$6,$7) on conflict (professor_id, dia_semana, horario_slot, turno)
           do update set disponivel=excluded.disponivel, hora_atividade_obrigatoria=excluded.hora_atividade_obrigatoria, motivo=excluded.motivo`,
          [profId.get(d.professor), d.dia, d.aula, d.turno, ha, ha, ha ? MOTIVO_HA : MOTIVO_BLQ]);
      }

      // 6) aulas
      for (const a of DADOS.aulas) {
        await c.query(
          "insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade) values ($1,$2,$3,$4,$5,$6,'oficial')",
          [ESCOLA, turmaPorNome.get(a.turma)!.id, discId(a.disciplina), profId.get(a.professor), a.dia, a.aula]);
      }

      // 7) horarios da manha
      for (const s of trocasHora) await c.query("update horario_slots set hora_inicio=$1 where id=$2", [DADOS.horasManha[s.numero_aula - 1], s.id]);

      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    log("\nGRAVADO. Confira com: pnpm --filter @workspace/api-server exec tsx scripts/ver-conflitos.ts " + ESCOLA);
  } catch (e: any) {
    log("ERRO: " + (e?.message ?? e)); process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "cadastro-iedo-urania.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio completo: ${arq}`);
  }
}
main();
