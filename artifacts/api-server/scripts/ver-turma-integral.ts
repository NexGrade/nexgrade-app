/**
 * [TURNO-INTEGRAL] (30/10/2026) Raio-x de uma turma integral. So le o banco.
 * Para cada horario VAGO da turma integral mostra o horario real (manha/tarde) e o que os
 * professores da turma tem nesse horario real em outras turmas (e HA/indisponibilidade).
 * Mostra tambem as copias da grade (grade_backups) que tinham aula da turma nesse horario.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/ver-turma-integral.ts org_xxx [nome da turma]
 */
import fs from "node:fs";
import path from "node:path";

const ESCOLA_ID = process.argv[2];
const FILTRO_TURMA = process.argv.slice(3).join(" ").trim().toLowerCase();
const RAIZ = path.resolve(process.cwd(), "..", "..");
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite", integral: "Integral" };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(RAIZ, "lib", "db", ".env");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL nao encontrada (nem em lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  if (!ESCOLA_ID) { console.log("Uso: ... ver-turma-integral.ts org_xxx [nome da turma]"); return; }
  carregarDatabaseUrl();
  const { pool, db, turmasTable, horariosTable, horarioSlotsTable, disciplinasTable, professoresTable, turmaDisciplinasTable, disponibilidadeTable, gradeBackupsTable } = await import("@workspace/db");
  const { and, eq, inArray, sql, desc } = await import("drizzle-orm");
  const { carregarMapaIntegral, slotReal, TURNO_INTEGRAL } = await import("../src/lib/turno-integral");
  try {
    const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID));
    const integrais = turmas.filter((t) => t.turno === TURNO_INTEGRAL && (!FILTRO_TURMA || t.nome.toLowerCase().includes(FILTRO_TURMA)));
    if (!integrais.length) { console.log("Nenhuma turma integral encontrada."); return; }
    const turnoDe = new Map(turmas.map((t) => [t.id, t.turno]));
    const nomeTurma = new Map(turmas.map((t) => [t.id, t.nome]));
    const mapa = await carregarMapaIntegral(ESCOLA_ID);
    const slots = await db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, ESCOLA_ID), eq(horarioSlotsTable.turno, TURNO_INTEGRAL)));
    const discs = new Map((await db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, ESCOLA_ID))).map((d) => [d.id, d.nome]));
    const profs = new Map((await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID))).map((p) => [p.id, p.nome]));
    const aulas = await db.select().from(horariosTable)
      .where(and(eq(horariosTable.escolaId, ESCOLA_ID), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`));
    const real = (turmaId: number, n: number) => slotReal(turnoDe.get(turmaId) ?? "?", n, mapa);
    const backups = await db.select().from(gradeBackupsTable).where(eq(gradeBackupsTable.escolaId, ESCOLA_ID)).orderBy(desc(gradeBackupsTable.createdAt)).limit(10);

    console.log(`Esquema integral (aula -> horario real):`);
    for (const s of [...slots].sort((a, b) => a.numeroAula - b.numeroAula)) {
      const r = mapa.get(s.numeroAula);
      console.log(`  ${s.numeroAula}a ${s.horaInicio} (${s.duracaoMinutos} min)${s.letivo === false ? " [nao letivo]" : ""} -> ${r ? `${TURNO[r.turno] ?? r.turno} ${r.numeroAula}a` : "sem equivalente"}`);
    }

    for (const t of integrais) {
      const daTurma = aulas.filter((a) => a.turmaId === t.id);
      const tds = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, t.id));
      const profsTurma = [...new Set(tds.flatMap((td) => [td.professorId, td.professorApoioId]).filter((x): x is number => !!x))];
      const disp = profsTurma.length ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profsTurma)) : [];
      console.log(`\n== Turma ${t.nome} (id ${t.id}) · ${daTurma.length} aula(s) na grade oficial`);
      const letivas = slots.filter((s) => s.letivo !== false && s.numeroAula >= 1).map((s) => s.numeroAula).sort((a, b) => a - b);
      for (let dia = 0; dia < 5; dia++) for (const n of letivas) {
        if (daTurma.some((a) => a.diaSemana === dia && a.numeroAula === n)) continue;
        const r = real(t.id, n);
        console.log(`\n  VAGO: ${DIA[dia]} ${n}a aula do integral = ${TURNO[r.turno] ?? r.turno} ${r.numeroAula}a`);
        for (const pid of profsTurma) {
          const noMesmo = aulas.filter((a) => a.professorId === pid && a.diaSemana === dia && a.turmaId !== t.id)
            .filter((a) => { const x = real(a.turmaId, a.numeroAula); return x.turno === r.turno && x.numeroAula === r.numeroAula; });
          const bloq = disp.filter((d) => d.professorId === pid && d.diaSemana === dia && d.horarioSlot === r.numeroAula && (d.turno ?? r.turno) === r.turno);
          const discsDele = tds.filter((td) => td.professorId === pid || td.professorApoioId === pid).map((td) => discs.get(td.disciplinaId)).join(", ");
          const ocup = [
            ...noMesmo.map((a) => `aula de ${discs.get(a.disciplinaId)} na ${nomeTurma.get(a.turmaId)}`),
            ...bloq.map((d) => `${d.motivo ?? (d.disponivel ? "disponivel" : "indisponivel")}`),
          ];
          if (ocup.length) console.log(`    ${profs.get(pid)} (${discsDele}): ${ocup.join("; ")}`);
        }
        for (const b of backups) {
          const dados = b.dados as { horarios?: Array<{ turmaId: number; disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number }> };
          const tinha = (dados.horarios ?? []).filter((a) => a.turmaId === t.id && a.diaSemana === dia && a.numeroAula === n);
          for (const a of tinha) console.log(`    copia #${b.id} de ${b.createdAt.toLocaleString("pt-BR")} (${b.motivo}): ${discs.get(a.disciplinaId)} com ${profs.get(a.professorId)}`);
        }
      }
    }
    // o que mudou na turma integral entre cada copia e a seguinte (e a grade de hoje)
    const fotos = [...backups].reverse().map((b) => ({
      rotulo: `copia #${b.id} (${b.createdAt.toLocaleString("pt-BR")})`,
      aulas: ((b.dados as { horarios?: Array<{ turmaId: number; disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number }> }).horarios ?? []),
    }));
    fotos.push({ rotulo: "grade de HOJE", aulas });
    const chave = (a: { disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number }) => `${a.diaSemana}|${a.numeroAula}|${a.disciplinaId}|${a.professorId}`;
    const texto = (k: string) => { const [d, n, di, p] = k.split("|").map(Number); return `${DIA[d!]} ${n}a ${discs.get(di!)} (${profs.get(p!)})`; };
    for (const t of integrais) {
      console.log(`\nMudancas na ${t.nome} de uma copia para a seguinte:`);
      for (let i = 1; i < fotos.length; i++) {
        const antes = new Set(fotos[i - 1]!.aulas.filter((a) => a.turmaId === t.id).map(chave));
        const depois = new Set(fotos[i]!.aulas.filter((a) => a.turmaId === t.id).map(chave));
        const saiu = [...antes].filter((k) => !depois.has(k));
        const entrou = [...depois].filter((k) => !antes.has(k));
        if (!saiu.length && !entrou.length) continue;
        console.log(`  ${fotos[i - 1]!.rotulo} -> ${fotos[i]!.rotulo}`);
        for (const k of saiu) console.log(`    saiu:   ${texto(k)}`);
        for (const k of entrou) console.log(`    entrou: ${texto(k)}`);
      }
    }

    console.log(`\nCopias da grade guardadas: ${backups.length}`);
    for (const b of backups) console.log(`  #${b.id} ${b.createdAt.toLocaleString("pt-BR")} · ${b.motivo} · ${b.qtdAulas} aulas`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error("ERRO:", e?.message ?? e); process.exit(1); });
