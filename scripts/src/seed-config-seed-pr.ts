// Popula a tabela `configuracoes` com os parâmetros oficiais da SEED-PR
// que foram CONFIRMADOS por fonte primária (PDF real da Resolução SEED
// n.º 7.200/2025). Cada valor é editável depois pelo painel — este
// script só define o ponto de partida correto.
//
// Fonte de cada valor está documentada no campo `descricao` de cada
// configuração, para rastreabilidade.
//
// Como rodar (na raiz do monorepo):
//   pnpm --filter @workspace/scripts run seed-config-seed-pr

import { db, pool } from "@workspace/db";
import { configuracoesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";

const CONFIGS_SEED_PR: Array<{ chave: string; valor: unknown; descricao: string }> = [
  {
    chave: "seed_pr.padrao_20h",
    valor: { aulasRegencia: 15, horasAtividade: 9 },
    descricao:
      "Resolução SEED n.º 7.200/2025, Art. 11, §1º, I: professor padrão 20h cumpre 15 aulas de regência (50min) + 9 horas-atividade de 50min (5 na instituição + 4 em local de livre escolha) = 7h30 de hora-atividade, totalizando 20h-relógio.",
  },
  {
    chave: "seed_pr.padrao_40h",
    valor: { aulasRegencia: 30, horasAtividade: 18 },
    descricao:
      "Resolução SEED n.º 7.200/2025, Art. 11, §1º, II: professor padrão 40h cumpre 30 aulas de regência + 18 horas-atividade (10 na instituição + 8 em local de livre escolha) = 15h de hora-atividade, totalizando 40h-relógio.",
  },
  {
    chave: "seed_pr.teto_aulas_turno",
    valor: { noturno: 19, diurno: 24 },
    descricao:
      "Resolução SEED n.º 7.200/2025, Art. 11, §3º: no turno da noite, no máximo 19 aulas; nos demais turnos, até 24 aulas.",
  },
  {
    chave: "seed_pr.hora_atividade_mesmo_turno_ate",
    valor: 19,
    descricao:
      "Resolução SEED n.º 7.200/2025, Art. 11, §4º: professor com até 19 aulas no mesmo turno deve cumprir a hora-atividade nesse mesmo turno/local (sem desmembrar em contra-turno).",
  },
  {
    chave: "seed_pr.max_aulas_geminadas_padrao",
    valor: 2,
    descricao:
      "Prática pedagógica comum (evitar 3+ aulas seguidas da mesma disciplina para a mesma turma) — valor padrão aplicado quando `turma_disciplinas.max_aulas_consecutivas_dia` está vazio. Ajustável por turma/disciplina no painel. Não é um artigo específico confirmado da resolução — trate como recomendação operacional, editável pela escola.",
  },
];

async function main() {
  console.log("🌱 Inserindo parâmetros SEED-PR em `configuracoes`...\n");

  for (const cfg of CONFIGS_SEED_PR) {
    const existente = await db
      .select()
      .from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, ESCOLA_ID), eq(configuracoesTable.chave, cfg.chave)));

    if (existente.length > 0) {
      await db
        .update(configuracoesTable)
        .set({ valor: cfg.valor, descricao: cfg.descricao })
        .where(and(eq(configuracoesTable.escolaId, ESCOLA_ID), eq(configuracoesTable.chave, cfg.chave)));
      console.log(`🔄 Atualizado: ${cfg.chave}`);
    } else {
      await db.insert(configuracoesTable).values({
        escolaId: ESCOLA_ID,
        chave: cfg.chave,
        valor: cfg.valor,
        descricao: cfg.descricao,
      });
      console.log(`✅ Criado: ${cfg.chave}`);
    }
  }

  console.log("\n🎉 Parâmetros SEED-PR configurados. Revise em Configurações no painel.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
