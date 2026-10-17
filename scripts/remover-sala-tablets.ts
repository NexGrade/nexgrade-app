// [RECURSOS-TABLETS] Remove do banco a sala antiga "Tablets" (espaco exclusivo por aula), que foi substituida
// pelo equipamento por quantidade (tabela "recursos"). Ela ja esta oculta nas telas; isto apaga o registro.
//
// ATENCAO: as reservas ficam ligadas a sala com "apagar em cascata": apagar a sala apaga as reservas dela.
// Por isso o script:
//   - NAO apaga se houver reserva futura ativa (confirmada/pendente) naquela sala: cancele antes;
//   - se so houver historico (passadas ou canceladas), so apaga com --apagar-historico (o historico vai junto).
//
// DRY-RUN por padrao: mostra o que existe e o que faria, sem gravar nada.
//
// Como rodar (PowerShell, na pasta do projeto):
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/remover-sala-tablets.ts                                  # dry-run
//   npx tsx scripts/remover-sala-tablets.ts --aplicar                        # apaga (so salas sem nenhuma reserva)
//   npx tsx scripts/remover-sala-tablets.ts --aplicar --apagar-historico     # apaga tambem salas que so tem historico

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const aplicar = process.argv.includes("--aplicar");
const apagarHistorico = process.argv.includes("--apagar-historico");

type Linha = { id: number; escola_id: string; nome: string; total: number; futuras_ativas: number; historico: number };

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (nada sera gravado)"}${aplicar && apagarHistorico ? " + apagar historico" : ""}`);

  const r = await db.execute(sql`
    select s.id, s.escola_id, s.nome,
      count(r.id)::int as total,
      count(r.id) filter (where r.status <> 'cancelada' and r.data >= ${hoje})::int as futuras_ativas,
      count(r.id) filter (where not (r.status <> 'cancelada' and r.data >= ${hoje}))::int as historico
    from salas s
    left join reservas r on r.sala_id = s.id
    where lower(trim(s.nome)) in ('tablet', 'tablets')
    group by s.id, s.escola_id, s.nome
    order by s.escola_id, s.id`);
  const salas = r.rows as unknown as Linha[];

  if (salas.length === 0) {
    console.log("Nenhuma sala chamada Tablets encontrada. Nada a fazer.");
    process.exit(0);
  }

  const apagaveis: Linha[] = [];
  for (const s of salas) {
    let veredito: string;
    if (s.futuras_ativas > 0) veredito = `NAO APAGA: ${s.futuras_ativas} reserva(s) futura(s) ativa(s). Cancele antes.`;
    else if (s.total === 0) { veredito = "pode apagar (sem nenhuma reserva)"; apagaveis.push(s); }
    else if (apagarHistorico) { veredito = `apaga junto ${s.historico} reserva(s) de historico`; apagaveis.push(s); }
    else veredito = `NAO APAGA sem --apagar-historico: tem ${s.historico} reserva(s) de historico (passadas/canceladas) que iriam junto.`;
    console.log(`\nSala #${s.id} "${s.nome}" (escola ${s.escola_id}): ${s.total} reserva(s) no total, ${s.futuras_ativas} futura(s) ativa(s), ${s.historico} de historico\n  -> ${veredito}`);
  }

  if (!aplicar) {
    console.log("\nDry-run concluido. Para apagar, rode de novo com --aplicar (veja as opcoes no topo do arquivo).");
    process.exit(0);
  }
  if (apagaveis.length === 0) {
    console.log("\nNada foi apagado (nenhuma sala passou nas travas).");
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    for (const s of apagaveis) {
      // confere de novo dentro da transacao: nenhuma reserva futura ativa entrou nesse meio tempo
      const novas = await tx.execute(sql`select count(*)::int as n from reservas where sala_id = ${s.id} and status <> 'cancelada' and data >= ${hoje}`);
      if ((novas.rows[0] as { n: number }).n > 0) throw new Error(`Sala #${s.id}: surgiu reserva futura ativa; nada foi apagado.`);
      await tx.execute(sql`delete from salas where id = ${s.id}`);
    }
  });
  console.log(`\nFeito: ${apagaveis.length} sala(s) apagada(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
