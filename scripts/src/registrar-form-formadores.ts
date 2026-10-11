// Script pontual — registra a FORMAÇÃO (curso de formadores) de terça à noite
// do Mário Braga, vista no PDF do Urânia de 12/10 a 16/10/2026:
//   JOÃO LUCAS  terça 18:00, 18:45 e 19:35  (aulas 1, 2 e 3)
//   VIVIANE     terça 18:00 e 18:45          (aulas 1 e 2)
//
// FORM é só uma OBSERVAÇÃO na grade do professor: ele está em curso de formadores
// nesse horário. Não desconta da HA e não vai para o RCO. Gravada como "atividade
// fora de sala" (mesmo formato de COORD e PAEE: bloqueio com "(ocupado: FORM)" no
// motivo); o PDF mostra "FORM" e o motor não põe aula ali.
//
// Esta versão também CORRIGE a primeira (que gravou FORM como HA fixa, em 11/10):
//   - João Lucas e Viviane: troca a "HA fixa - FORM" pela atividade FORM;
//   - Carlos (terça aulas 2 e 3): devolve a HA manual que ele tinha antes
//     ("HA manual (definida na tela)"); a HA dele fica como estava.
//
// Como rodar (DRY-RUN por padrão — só mostra o que faria, não grava nada):
//   pnpm --filter @workspace/scripts exec tsx src/registrar-form-formadores.ts
// Para gravar de verdade, depois de conferir o dry-run:
//   pnpm --filter @workspace/scripts exec tsx src/registrar-form-formadores.ts --aplicar

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { and, eq, ilike } from "drizzle-orm";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga
const TURNO = "noturno";
const TERCA = 1; // diaSemana: 0=segunda ... 4=sexta
const MOTIVO_FORM = "Atividade fora de sala (ocupado: FORM)"; // igual à tela de disponibilidade
const MOTIVO_HA_FORM_ANTIGO = "HA fixa (definida manualmente) - FORM (curso de formadores)"; // gravado pela 1a versão
const MOTIVO_HA_MANUAL = "HA manual (definida na tela)";
const MOTIVO_BLOQUEIO_NAO_LETIVO = "Bloqueio automatico: aula 1 do noturno";

type Alvo = "atividade_form" | "devolver_ha";
const ALVOS: { prefixoNome: string; aulas: number[]; alvo: Alvo }[] = [
  { prefixoNome: "João Lucas", aulas: [1, 2, 3], alvo: "atividade_form" },
  { prefixoNome: "Viviane", aulas: [1, 2], alvo: "atividade_form" },
  { prefixoNome: "Carlos Eduardo", aulas: [2, 3], alvo: "devolver_ha" },
];

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  console.log(aplicar ? "🔧 APLICANDO FORM (observação) de terça, noturno...\n" : "🔍 DRY-RUN — nada será gravado (use --aplicar para gravar)\n");
  let problemas = 0;

  for (const f of ALVOS) {
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

      if (f.alvo === "devolver_ha") {
        if (atual?.horaAtividadeObrigatoria && atual.motivo === MOTIVO_HA_FORM_ANTIGO) {
          console.log(`${aplicar ? "✅" : "➡️ "} ${prof.nome} ter aula ${aula}: ${desc}  →  volta para HA manual`);
          if (aplicar) await db.update(disponibilidadeTable).set({ disponivel: true, horaAtividadeObrigatoria: true, motivo: MOTIVO_HA_MANUAL }).where(eq(disponibilidadeTable.id, atual.id));
        } else {
          console.log(`⏭️  ${prof.nome} ter aula ${aula}: ${desc} — nada a devolver`);
        }
        continue;
      }

      if (!atual?.horaAtividadeObrigatoria && atual?.motivo === MOTIVO_FORM && !atual.disponivel) {
        console.log(`⏭️  ${prof.nome} ter aula ${aula}: já é atividade FORM`);
        continue;
      }
      // só mexe em: vazio, linha livre, a HA fixa FORM da 1a versão e o bloqueio automático do 18:00.
      // Outra HA, atividade do Urânia ou bloqueio real não é sobrescrito.
      const seguro =
        !atual ||
        (atual.horaAtividadeObrigatoria && atual.motivo === MOTIVO_HA_FORM_ANTIGO) ||
        (!atual.horaAtividadeObrigatoria && atual.disponivel) ||
        (atual.motivo ?? "").startsWith(MOTIVO_BLOQUEIO_NAO_LETIVO);
      if (!seguro) {
        console.error(`⚠️  ${prof.nome} ter aula ${aula}: tem ${desc} — NÃO sobrescrevo. Resolver à mão.`);
        problemas++;
        continue;
      }
      console.log(`${aplicar ? "✅" : "➡️ "} ${prof.nome} ter aula ${aula}: ${desc}  →  atividade FORM (não é HA)`);
      if (aplicar) {
        if (atual) {
          await db.update(disponibilidadeTable).set({ disponivel: false, horaAtividadeObrigatoria: false, motivo: MOTIVO_FORM }).where(eq(disponibilidadeTable.id, atual.id));
        } else {
          await db.insert(disponibilidadeTable).values({ professorId: prof.id, diaSemana: TERCA, horarioSlot: aula, turno: TURNO, disponivel: false, horaAtividadeObrigatoria: false, motivo: MOTIVO_FORM });
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
