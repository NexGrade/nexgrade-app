// SO LEITURA. Relatorio para a escola: HA de hoje x HA que o NexGrade colocaria no recalculo
// (mesma regra da promocao: calcularHAIdeal), por professor, com as janelas antes e depois.
// Nao grava nada no banco. Gera um CSV (abre no Excel) em lib/db/_arquivo/ -- tem nomes de
// professores, entao fica fora do git.
//
// Uso (da raiz do projeto, com a DATABASE_URL carregada):
//   npx tsx scripts/relatorio-ha-escola.ts --escola=org_...

import fs from "node:fs";
import path from "node:path";
import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable, horariosTable, turmasTable } from "@workspace/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { calcularHAIdeal } from "../artifacts/api-server/src/lib/recalcular-ha";
import { carregarAssSoTurma } from "../artifacts/api-server/src/lib/assincrona-so-turma";

const ESCOLA_ID = process.argv.find((a) => a.startsWith("--escola="))?.split("=")[1] ?? "";
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const T = (t: string | null) => ({ matutino: "M", vespertino: "T", noturno: "N" } as Record<string, string>)[t ?? ""] ?? "?";
const ORDEM_T: Record<string, number> = { matutino: 0, vespertino: 1, noturno: 2 };

type Pos = { turno: string; dia: number; aula: number };
const k = (p: Pos) => `${p.turno}|${p.dia}|${p.aula}`;
const fmt = (p: Pos, star = false) => `${DIAS[p.dia]} ${p.aula}ª ${T(p.turno)}${star ? "*" : ""}`;
const ordena = (a: Pos, b: Pos) => a.dia - b.dia || (ORDEM_T[a.turno] ?? 9) - (ORDEM_T[b.turno] ?? 9) || a.aula - b.aula;

/** janelas = horarios vagos entre o primeiro e o ultimo ocupado, por turno e dia */
function janelas(ocupados: Set<string>): number {
  const porTD = new Map<string, number[]>();
  for (const s of ocupados) {
    const [t, d, a] = s.split("|");
    const kk = `${t}|${d}`;
    (porTD.get(kk) ?? porTD.set(kk, []).get(kk)!).push(Number(a));
  }
  let total = 0;
  for (const aulas of porTD.values()) {
    const min = Math.min(...aulas), max = Math.max(...aulas);
    for (let a = min + 1; a < max; a++) if (!aulas.includes(a)) total++;
  }
  return total;
}

const csv = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  if (!ESCOLA_ID) { console.error("Uso: npx tsx scripts/relatorio-ha-escola.ts --escola=<id>"); process.exit(1); }
  console.log("SO LEITURA: nada sera gravado no banco.\n");

  const profs = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const ids = profs.map((p) => p.id);
  const [ideal, disp, aulas, ehAssSoTurma] = await Promise.all([
    calcularHAIdeal(ESCOLA_ID),
    ids.length ? db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ids)) : Promise.resolve([]),
    db.select({ h: horariosTable, turno: turmasTable.turno, turma: turmasTable })
      .from(horariosTable).innerJoin(turmasTable, eq(horariosTable.turmaId, turmasTable.id))
      .where(and(eq(horariosTable.escolaId, ESCOLA_ID), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
    carregarAssSoTurma(ESCOLA_ID),
  ]);

  const linhas: string[] = [];
  linhas.push(["Professor", "Muda?", "HA hoje (qtd)", "HA NexGrade (qtd)", "HA hoje", "HA NexGrade", "Sai", "Entra", "Janelas hoje", "Janelas NexGrade", "Observação"].map(csv).join(";"));

  let mudam = 0, piora = 0, melhora = 0;
  const resumo: string[] = [];
  for (const p of [...profs].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const minhasAulas = aulas.filter((x) => x.h.professorId === p.id && !ehAssSoTurma(x.h, x.turma));
    const haHoje: Pos[] = disp.filter((d) => d.professorId === p.id && d.horaAtividadeObrigatoria && d.turno)
      .map((d) => ({ turno: d.turno!, dia: d.diaSemana, aula: d.horarioSlot })).sort(ordena);
    const haNova = ideal.filter((m) => m.professorId === p.id)
      .map((m) => ({ turno: m.turno, dia: m.diaSemana, aula: m.horarioSlot, star: !!m.outroTurno })).sort(ordena);
    if (minhasAulas.length === 0 && haHoje.length === 0 && haNova.length === 0) continue;

    const setHoje = new Set(haHoje.map(k));
    const setNova = new Set(haNova.map(k));
    const sai = haHoje.filter((h) => !setNova.has(k(h)));
    const entra = haNova.filter((h) => !setHoje.has(k(h)));

    const ocupaBase = new Set<string>(minhasAulas.map((x) => `${x.turno}|${x.h.diaSemana}|${x.h.numeroAula}`));
    // atividade do Urania ("(ocupado: FORM)" etc.) ocupa o horario, como na tela de Conflitos
    for (const d of disp) if (d.professorId === p.id && !d.horaAtividadeObrigatoria && d.turno && /\(ocupado:/.test(d.motivo ?? "")) ocupaBase.add(`${d.turno}|${d.diaSemana}|${d.horarioSlot}`);
    const jHoje = janelas(new Set([...ocupaBase, ...setHoje]));
    const jNova = janelas(new Set([...ocupaBase, ...setNova]));

    const muda = sai.length > 0 || entra.length > 0;
    if (muda) mudam++;
    if (jNova > jHoje) piora++;
    if (jNova < jHoje) melhora++;
    const obs: string[] = [];
    if (haNova.length > haHoje.length) obs.push(`+${haNova.length - haHoje.length} HA (completa a tabela SEED)`);
    if (haNova.length < haHoje.length) obs.push(`-${haHoje.length - haNova.length} HA`);
    if (entra.some((e) => e.turno === "noturno") && !minhasAulas.some((x) => x.turno === "noturno")) obs.push("HA à NOITE sem dar aula à noite");
    if (jNova > jHoje) obs.push("mais janelas");
    if (jNova < jHoje) obs.push("menos janelas");

    linhas.push([
      p.nome, muda ? "Sim" : "Não", haHoje.length, haNova.length,
      haHoje.map((h) => fmt(h)).join(", "), haNova.map((h) => fmt(h, h.star)).join(", "),
      sai.map((h) => fmt(h)).join(", "), entra.map((h) => fmt(h, h.star)).join(", "),
      jHoje, jNova, obs.join("; "),
    ].map(csv).join(";"));
    if (muda || obs.length) resumo.push(`${p.nome}: HA ${haHoje.length} -> ${haNova.length}, janelas ${jHoje} -> ${jNova}${obs.length ? " (" + obs.join("; ") + ")" : ""}`);
  }

  const pasta = path.resolve("lib/db/_arquivo");
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, `relatorio-ha-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(arq, "﻿" + linhas.join("\r\n"), "utf8"); // BOM: o Excel abre com acentos certos
  for (const r of resumo) console.log(r);
  console.log(`\nResumo: ${mudam} professor(es) com a HA mudando; ${melhora} com menos janelas, ${piora} com mais janelas.`);
  console.log(`Legenda: M/T/N = manhã/tarde/noite; * = HA de outro turno (HA*).`);
  console.log(`CSV: ${arq}`);
  console.log("SO LEITURA: nada foi gravado no banco.");
  await pool.end();
}

main().catch(async (err) => { console.error("ERRO:", err); await pool.end(); process.exit(1); });
