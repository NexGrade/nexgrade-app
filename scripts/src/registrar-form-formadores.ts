// Script pontual — registra a FORMAÇÃO (curso de formadores) de terça à noite
// do Mário Braga, vista no PDF do Urânia de 12/10 a 16/10/2026:
//   JOÃO LUCAS  terça 18:00, 18:45 e 19:35  (aulas 1, 2 e 3)
//   VIVIANE     terça 18:00 e 18:45          (aulas 1 e 2)
//   CARLOS      terça 18:45 e 19:35          (aulas 2 e 3)
//
// FORM = o professor está em curso de formadores nesse horário. Não vai para o
// RCO (o XML só lê aulas da grade); só desconta da hora-atividade (HA). Gravada
// como HA fixa com "FORM" no motivo: conta como HA, o motor nunca põe aula ali e
// o PDF mostra "FORM". Ver MOTIVO_HA_FORMACAO em api-server/src/lib/bloqueio-real.ts.
//
// Como rodar (DRY-RUN por padrão — só mostra o que faria, não grava nada):
//   pnpm --filter @workspace/scripts exec tsx src/registrar-form-formadores.ts
// Para gravar de verdade, depois de conferir o dry-run:
//   pnpm --filter @workspace/scripts exec tsx src/registrar-form-formadores.ts --aplicar
// Depois de gravar, rode o recálculo da HA (scripts/rodar-recalculo-ha.ts) para a HA
// automática se ajustar ao que a FORM já cobre.

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { and, eq, ilike } from "drizzle-orm";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga
const TURNO = "noturno";
const TERCA = 1; // diaSemana: 0=segunda ... 4=sexta
const MOTIVO_HA_FORMACAO = "HA fixa (definida manualmente) - FORM (curso de formadores)"; // igual a bloqueio-real.ts
const MOTIVO_BLOQUEIO_NAO_LETIVO = "Bloqueio automatico: aula 1 do noturno";
const MOTIVO_HA_AUTO = "Hora-atividade institucional (recalculada automaticamente)";

const FORMACOES: { prefixoNome: string; aulas: number[] }[] = [
  { prefixoNome: "João Lucas", aulas: [1, 2, 3] },
  { prefixoNome: "Viviane", aulas: [1, 2] },
  { prefixoNome: "Carlos Eduardo", aulas: [2, 3] },
];

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  console.log(aplicar ? "🔧 APLICANDO FORM de terça (noturno)...\n" : "🔍 DRY-RUN — nada será gravado (use --aplicar para gravar)\n");
  let problemas = 0;

  for (const f of FORMACOES) {
    const profs = await db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, ESCOLA_ID), ilike(professoresTable.nome, `${f.prefixoNome}%`)));
    if (profs.length !== 1) {
      console.error(`❌ "${f.prefixoNome}": encontrei ${profs.length} professor(es) [${profs.map((p) => p.nome).join(", ")}] — esperava exatamente 1. Pulado.`);
      problemas++;
      continue;
    }
    const prof = profs[0]!;
    const existentes = await db.select().from(disponibilidadeTable)
      .where(and(eq(disponibilidadeTable.professorId, prof.id), eq(disponibilidadeTable.diaSemana, TERCA), eq(disponibilidadeTable.turno, TURNO)));

    for (const aula of f.aulas) {
      const atual = existentes.find((d) => d.horarioSlot === aula);
      const desc = atual
        ? `${atual.horaAtividadeObrigatoria ? "HA" : atual.disponivel ? "livre" : "bloqueio"} — "${atual.motivo ?? ""}"`
        : "sem registro";
      if (atual?.horaAtividadeObrigatoria && atual.motivo === MOTIVO_HA_FORMACAO) {
        console.log(`⏭️  ${prof.nome} ter aula ${aula}: já é FORM`);
        continue;
      }
      // só mexe em: vazio, linha livre, HA (automática ou manual) e o bloqueio automático do 18:00.
      // Atividade do Urânia ("ocupado:") ou bloqueio real não é sobrescrito.
      const seguro =
        !atual ||
        atual.horaAtividadeObrigatoria ||
        atual.disponivel ||
        (atual.motivo ?? "").startsWith(MOTIVO_BLOQUEIO_NAO_LETIVO);
      if (!seguro) {
        console.error(`⚠️  ${prof.nome} ter aula ${aula}: tem ${desc} — NÃO sobrescrevo. Resolver à mão.`);
        problemas++;
        continue;
      }
      const ehAuto = atual?.horaAtividadeObrigatoria && (atual.motivo ?? "").startsWith(MOTIVO_HA_AUTO);
      console.log(`${aplicar ? "✅" : "➡️ "} ${prof.nome} ter aula ${aula}: ${desc}  →  FORM${ehAuto ? " (troca HA automática por FORM)" : ""}`);
      if (aplicar) {
        if (atual) {
          await db.update(disponibilidadeTable)
            .set({ disponivel: true, horaAtividadeObrigatoria: true, motivo: MOTIVO_HA_FORMACAO })
            .where(eq(disponibilidadeTable.id, atual.id));
        } else {
          await db.insert(disponibilidadeTable).values({
            professorId: prof.id, diaSemana: TERCA, horarioSlot: aula, turno: TURNO,
            disponivel: true, horaAtividadeObrigatoria: true, motivo: MOTIVO_HA_FORMACAO,
          });
        }
      }
    }
  }

  console.log(problemas ? `\n⚠️  ${problemas} item(ns) precisam de atenção.` : "\nTudo certo.");
  if (!aplicar) console.log("DRY-RUN concluído. Nada foi gravado.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("❌ Erro:", err);
  await pool.end();
  process.exit(1);
});
