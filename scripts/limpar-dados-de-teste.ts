// [LIMPEZA] Lista e apaga dados de TESTE criados ao experimentar Reservas (tablets, bloqueios e reservas de sala).
//
// DRY-RUN por padrao: so LISTA o que existe, sem apagar nada. Para apagar, diga EXATAMENTE o que, com --aplicar:
//   --tablets            apaga TODAS as reservas de tablets (a funcao e nova: tudo que existe foi teste)
//   --bloqueios          apaga TODOS os bloqueios (ativos e liberados)
//   --reservas=12,15     apaga so as reservas de SALA com esses ids (veja os ids na listagem)
//   --escola=ID          restringe listagem e exclusao a uma escola (ID aparece na listagem)
//   --desde=AAAA-MM-DD   so para a LISTAGEM de reservas de sala (padrao 2026-10-17)
//
// Como rodar (PowerShell, na pasta do projeto):
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/limpar-dados-de-teste.ts                                  # dry-run: lista tudo
//   npx tsx scripts/limpar-dados-de-teste.ts --aplicar --tablets              # exemplo: apaga os tablets de teste
//   npx tsx scripts/limpar-dados-de-teste.ts --aplicar --reservas=12,15       # exemplo: apaga 2 reservas de sala
// Reservas de sala NUNCA sao apagadas em bloco: so pelos ids que voce informar.

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const tem = (nome: string) => process.argv.includes(`--${nome}`);
const aplicar = tem("aplicar");
const escola = arg("escola") ?? null;
const desde = arg("desde") ?? "2026-10-17";
const idsReservas = (arg("reservas") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
if (idsReservas.some((n) => !Number.isInteger(n) || n <= 0)) {
  console.error("--reservas precisa de numeros inteiros separados por virgula, ex.: --reservas=12,15");
  process.exit(1);
}
const filtroPor = (coluna: string) => (escola ? sql`and ${sql.raw(coluna)} = ${escola}` : sql``); // coluna e constante; a escola vai como parametro
const fmt = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v ?? ""));

async function main() {
  console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (so lista, nada sera apagado)"}${escola ? ` · escola ${escola}` : " · todas as escolas"}\n`);

  const tablets = await db.execute(sql`
    select rr.id, rr.escola_id, rr.data, rr.numero_aula, rr.turno, rr.quantidade, rr.status, p.nome as professor, rr.created_at
    from reservas_recursos rr left join professores p on p.id = rr.professor_id
    where true ${filtroPor("rr.escola_id")}
    order by rr.data, rr.numero_aula`);
  console.log(`== Reservas de TABLETS: ${tablets.rows.length}`);
  for (const r of tablets.rows as any[]) console.log(`  #${r.id} escola ${r.escola_id} | ${fmt(r.data).slice(0, 10)} ${r.numero_aula}ª ${r.turno} | ${r.quantidade} un. | ${r.status} | ${r.professor ?? "?"} | criada ${fmt(r.created_at)}`);

  const bloqueios = await db.execute(sql`
    select b.id, b.escola_id, b.alvo_tipo, coalesce(s.nome, r.nome, '?') as alvo, b.data_inicio, b.data_fim, b.motivo, b.ativo, b.created_at
    from bloqueios b left join salas s on s.id = b.sala_id left join recursos r on r.id = b.recurso_id
    where true ${filtroPor("b.escola_id")}
    order by b.id`);
  console.log(`\n== BLOQUEIOS: ${bloqueios.rows.length}`);
  for (const b of bloqueios.rows as any[]) console.log(`  #${b.id} escola ${b.escola_id} | ${b.alvo_tipo} ${b.alvo} | ${fmt(b.data_inicio).slice(0, 10)} a ${fmt(b.data_fim).slice(0, 10)} | ${b.motivo} | ${b.ativo ? "ATIVO" : "liberado"} | criado ${fmt(b.created_at)}`);

  const reservas = await db.execute(sql`
    select rs.id, rs.escola_id, rs.data, rs.numero_aula, rs.turno, rs.status, rs.titulo, s.nome as sala, p.nome as professor, rs.created_at
    from reservas rs left join salas s on s.id = rs.sala_id left join professores p on p.id = rs.professor_id
    where rs.created_at >= ${desde}::date ${filtroPor("rs.escola_id")}
    order by rs.created_at`);
  console.log(`\n== Reservas de SALA criadas desde ${desde}: ${reservas.rows.length} (so apaga as que voce listar em --reservas=)`);
  for (const r of reservas.rows as any[]) console.log(`  #${r.id} escola ${r.escola_id} | ${fmt(r.data).slice(0, 10)} ${r.numero_aula}ª ${r.turno ?? ""} | ${r.sala} | ${r.status} | "${r.titulo}" | ${r.professor ?? "?"} | criada ${fmt(r.created_at)}`);

  const quer = { tablets: tem("tablets"), bloqueios: tem("bloqueios"), reservas: idsReservas.length > 0 };
  if (!aplicar) {
    console.log("\nDry-run concluido. Para apagar, rode de novo com --aplicar e o que apagar (veja as opcoes no topo do arquivo).");
    process.exit(0);
  }
  if (!quer.tablets && !quer.bloqueios && !quer.reservas) {
    console.log("\nNada foi apagado: diga o que apagar (--tablets, --bloqueios e/ou --reservas=ID,ID).");
    process.exit(0);
  }

  const resultado = await db.transaction(async (tx) => {
    const feitos: string[] = [];
    if (quer.tablets) {
      const r = await tx.execute(sql`delete from reservas_recursos where true ${filtroPor("escola_id")} returning id`);
      feitos.push(`${r.rows.length} reserva(s) de tablets`);
    }
    if (quer.bloqueios) {
      const r = await tx.execute(sql`delete from bloqueios where true ${filtroPor("escola_id")} returning id`);
      feitos.push(`${r.rows.length} bloqueio(s)`);
    }
    if (quer.reservas) {
      const r = await tx.execute(sql`delete from reservas where id in (${sql.join(idsReservas.map((i) => sql`${i}`), sql`, `)}) ${filtroPor("escola_id")} returning id`);
      feitos.push(`${r.rows.length} reserva(s) de sala (de ${idsReservas.length} pedidas)`);
    }
    return feitos;
  });
  console.log(`\nFeito: apagou ${resultado.join(", ")}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
