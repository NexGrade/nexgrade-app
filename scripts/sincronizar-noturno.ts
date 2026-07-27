// Sincroniza a grade OFICIAL do noturno com os dados extraídos do PDF
// real da escola (fonte de verdade). Diferente do dry-run, este script
// GRAVA no banco -- mas só depois de mostrar exatamente o que vai
// mudar e pedir confirmação.
//
// Reaproveita a extração/resolução do dry-run-importar-noturno.ts.
// Pode ser rodado de novo toda semana que a escola mandar uma grade
// nova (é só trocar scripts/aulas_noturno.json pelo resultado da
// semana nova).
//
// Como rodar:
//   cd C:\Projetos\nexgrade-app
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/sincronizar-noturno.ts
//   (ele pede confirmação antes de gravar -- responda "sim" pra aplicar)

import { db } from "@workspace/db";
import {
  turmasTable,
  disciplinasTable,
  professoresTable,
  horariosTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import * as readline from "readline";

const AULAS_EXTRAIDAS: Array<{
  professor: string;
  dia: number;
  diaLabel: string;
  numeroAula: number;
  hora: string;
  turmaCodigo: string;
  disciplinaAbrev: string;
}> = JSON.parse(readFileSync("scripts/aulas_noturno.json", "utf-8"));

const ABREV_PARA_NOME: Record<string, string> = {
  "MAT.": "matematica",
  "PORT": "lingua portuguesa e literatura",
  "GEO": "geografia",
  "BIO": "biologia",
  "QUIM": "quimica",
  "ART": "arte",
  "ED.FIS": "educacao fisica",
  "INGLES": "lingua estrangeira moderna - ingles",
  "ED.FIN": "educacao financeira",
  "ED.DIG": "educacao digital",
  "HIB": "hibrida",
  "HIST": "historia",
  "FISIC": "fisica",
  "FILOS": "filosofia",
  "SOCIO": "sociologia",
  "VIDA": "projeto de vida",
  "MAT 2": "matematica 2",
  "BIO2": "biologia 2",
  "FIS2": "fisica 2",
  "FIS3": "fisica 3",
  "QUI1": "quimica 1",
  "R PORT": "recomposicao da aprendizagem - lingua portuguesa",
  "R MAT": "recomposicao da aprendizagem - matematica",
  "ART2": "arte 2",
  "GEO1": "geografia 1",
  "HIS1": "historia 1",
  "SOCIO1": "sociologia 1",
  "EMPRES": "informatica empresarial",
  "ECON.": "principios economicos",
  "FINAN.": "financas empresariais",
  "PR.ADM": "princ de administracao",
  "RH": "recursos humanos",
  "E.MARK": "estrategias de marketing",
  "INTEG.": "tecnicas integradas",
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

async function main() {
  const escolaId = "escola_default";

  const [turmasNoturno, disciplinas, professores, horariosAtuais] = await Promise.all([
    db.select().from(turmasTable).where(and(eq(turmasTable.turno, "noturno"), eq(turmasTable.escolaId, escolaId))),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
  ]);

  const turmaPorNome = new Map(turmasNoturno.map((t) => [normalizar(t.nome), t]));
  const disciplinaPorNomeNorm = new Map(disciplinas.map((d) => [normalizar(d.nome), d]));
  const professorPorNomeCompleto = new Map(professores.map((p) => [normalizar(p.nome), p]));
  const professorPorPrimeiroNome = new Map<string, typeof professores>();
  for (const p of professores) {
    const primeiro = normalizar(p.nome).split(" ")[0];
    if (!professorPorPrimeiroNome.has(primeiro)) professorPorPrimeiroNome.set(primeiro, []);
    professorPorPrimeiroNome.get(primeiro)!.push(p);
  }

  const turmaIdsNoturno = new Set(turmasNoturno.map((t) => t.id));
  const horariosAtuaisNoturno = horariosAtuais.filter((h) => turmaIdsNoturno.has(h.turmaId));

  type LinhaResolvida = {
    turmaId: number; disciplinaId: number; professorId: number;
    diaSemana: number; numeroAula: number;
    turmaNome: string; disciplinaNome: string; professorNome: string;
  };
  const resolvidas: LinhaResolvida[] = [];
  const problemas: string[] = [];

  for (const item of AULAS_EXTRAIDAS) {
    const turma = turmaPorNome.get(normalizar(item.turmaCodigo));
    if (!turma) { problemas.push(`Turma "${item.turmaCodigo}" nao encontrada`); continue; }

    const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
    const disc = nomeBusca ? disciplinaPorNomeNorm.get(nomeBusca) : undefined;
    if (!disc) { problemas.push(`Disciplina "${item.disciplinaAbrev}" nao encontrada`); continue; }

    const nomeProfNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeProfNorm);
    if (!prof) {
      const mHibrida = item.professor.match(/^HIBRIDA-(.+)$/i);
      if (mHibrida) {
        const alvo = normalizar(`Hibrida (${mHibrida[1]})`);
        prof = professores.find((p) => normalizar(p.nome) === alvo);
      }
    }
    if (!prof) {
      const candidatos = professorPorPrimeiroNome.get(nomeProfNorm.split(" ")[0]) ?? [];
      if (candidatos.length === 1) prof = candidatos[0];
    }
    if (!prof) { problemas.push(`Professor "${item.professor}" nao encontrado`); continue; }

    resolvidas.push({
      turmaId: turma.id, disciplinaId: disc.id, professorId: prof.id,
      diaSemana: item.dia, numeroAula: item.numeroAula,
      turmaNome: turma.nome, disciplinaNome: disc.nome, professorNome: prof.nome,
    });
  }

  if (problemas.length > 0) {
    console.log("ABORTADO -- ainda ha", problemas.length, "problema(s) de mapeamento. Rode o dry-run primeiro.");
    problemas.forEach((p) => console.log("  -", p));
    process.exit(1);
  }

  const chave = (h: { turmaId: number; diaSemana: number; numeroAula: number }) =>
    `${h.turmaId}-${h.diaSemana}-${h.numeroAula}`;
  const atuaisMap = new Map(horariosAtuaisNoturno.map((h) => [chave(h), h]));
  const novasMap = new Map(resolvidas.map((r) => [chave(r), r]));

  const paraInserir: LinhaResolvida[] = [];
  const paraAtualizar: Array<{ id: number; nova: LinhaResolvida }> = [];
  const paraRemoverIds: number[] = [];

  for (const [k, nova] of novasMap) {
    const atual = atuaisMap.get(k);
    if (!atual) paraInserir.push(nova);
    else if (atual.disciplinaId !== nova.disciplinaId || atual.professorId !== nova.professorId) {
      paraAtualizar.push({ id: atual.id, nova });
    }
  }
  for (const [k, atual] of atuaisMap) {
    if (!novasMap.has(k)) paraRemoverIds.push(atual.id);
  }

  console.log("=".repeat(70));
  console.log("SINCRONIZAÇÃO -- Grade oficial NOTURNO");
  console.log("=".repeat(70));
  console.log(`  Inserções: ${paraInserir.length}`);
  console.log(`  Atualizações: ${paraAtualizar.length}`);
  console.log(`  Remoções: ${paraRemoverIds.length}`);
  console.log(`  Sem mudança: ${resolvidas.length - paraInserir.length - paraAtualizar.length}`);

  if (paraInserir.length === 0 && paraAtualizar.length === 0 && paraRemoverIds.length === 0) {
    console.log("\nNada a fazer -- grade já está sincronizada.");
    process.exit(0);
  }

  console.log("\nDetalhe das inserções:");
  for (const i of paraInserir) {
    console.log(`  + ${i.turmaNome} | ${["Seg","Ter","Qua","Qui","Sex"][i.diaSemana]} aula ${i.numeroAula} | ${i.disciplinaNome} | ${i.professorNome}`);
  }
  console.log("\nDetalhe das atualizações:");
  for (const a of paraAtualizar) {
    console.log(`  ~ ${a.nova.turmaNome} | ${["Seg","Ter","Qua","Qui","Sex"][a.nova.diaSemana]} aula ${a.nova.numeroAula} -> ${a.nova.disciplinaNome} / ${a.nova.professorNome}`);
  }
  console.log("\nDetalhe das remoções:");
  for (const id of paraRemoverIds) {
    const h = horariosAtuaisNoturno.find((x) => x.id === id)!;
    console.log(`  - id ${id} (turmaId ${h.turmaId}, dia ${h.diaSemana}, aula ${h.numeroAula})`);
  }

  const resp = await perguntar("\nAplicar essas mudanças na grade OFICIAL agora? (digite 'sim' para confirmar) ");
  if (normalizar(resp) !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (paraInserir.length > 0) {
      await tx.insert(horariosTable).values(
        paraInserir.map((i) => ({
          escolaId, turmaId: i.turmaId, disciplinaId: i.disciplinaId, professorId: i.professorId,
          diaSemana: i.diaSemana, numeroAula: i.numeroAula,
        })),
      );
    }
    for (const a of paraAtualizar) {
      await tx.update(horariosTable)
        .set({ disciplinaId: a.nova.disciplinaId, professorId: a.nova.professorId })
        .where(eq(horariosTable.id, a.id));
    }
    if (paraRemoverIds.length > 0) {
      await tx.delete(horariosTable).where(inArray(horariosTable.id, paraRemoverIds));
    }
  });

  console.log("\nPronto! Grade oficial do noturno sincronizada com o PDF.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
