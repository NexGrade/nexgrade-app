// Script pontual — adiciona índices nas colunas mais usadas em filtros
// (turma_id, professor_id, escola_id, etc.), nas tabelas que toda tela
// principal do NexGrade consulta o tempo todo (horarios, disponibilidade,
// turma_disciplinas, professor_disciplinas, horarios_experimentais).
//
// Sem índice, o Postgres varre a tabela inteira pra achar as linhas de
// uma turma/professor específico. Com poucas linhas isso nem se nota
// (por isso não doeu até agora), mas cresce proporcionalmente ao
// tamanho da tabela — vale fazer antes de crescer, não depois.
//
// Seguro rodar mais de uma vez (usa "IF NOT EXISTS" em tudo).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/adicionar-indices.ts

import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const INDICES: Array<{ nome: string; comando: string }> = [
  // horarios — consultado em toda tela de Grade, PDF, relatório de carga
  { nome: "idx_horarios_turma_id", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_turma_id ON horarios (turma_id)` },
  { nome: "idx_horarios_professor_id", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_professor_id ON horarios (professor_id)` },
  { nome: "idx_horarios_escola_id", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_escola_id ON horarios (escola_id)` },

  // disponibilidade_professores — consultado no gerador e na tela de Disponibilidade
  { nome: "idx_disponibilidade_professor_id", comando: `CREATE INDEX IF NOT EXISTS idx_disponibilidade_professor_id ON disponibilidade_professores (professor_id)` },

  // turma_disciplinas — consultado toda vez que gera grade ou mostra carga de uma turma
  { nome: "idx_turma_disciplinas_turma_id", comando: `CREATE INDEX IF NOT EXISTS idx_turma_disciplinas_turma_id ON turma_disciplinas (turma_id)` },

  // professor_disciplinas — consultado no gerador pra achar quem pode dar cada disciplina
  { nome: "idx_professor_disciplinas_disciplina_id", comando: `CREATE INDEX IF NOT EXISTS idx_professor_disciplinas_disciplina_id ON professor_disciplinas (disciplina_id)` },
  { nome: "idx_professor_disciplinas_professor_id", comando: `CREATE INDEX IF NOT EXISTS idx_professor_disciplinas_professor_id ON professor_disciplinas (professor_id)` },

  // horarios_experimentais — consultado no Modo Experimental, geração em massa e promoção
  { nome: "idx_horarios_experimentais_nome", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_experimentais_nome ON horarios_experimentais (nome)` },
  { nome: "idx_horarios_experimentais_escola_id", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_experimentais_escola_id ON horarios_experimentais (escola_id)` },
  { nome: "idx_horarios_experimentais_turma_id", comando: `CREATE INDEX IF NOT EXISTS idx_horarios_experimentais_turma_id ON horarios_experimentais (turma_id)` },

  // turmas, professores, disciplinas — consultado em praticamente toda tela (escola_id)
  { nome: "idx_turmas_escola_id", comando: `CREATE INDEX IF NOT EXISTS idx_turmas_escola_id ON turmas (escola_id)` },
  { nome: "idx_professores_escola_id", comando: `CREATE INDEX IF NOT EXISTS idx_professores_escola_id ON professores (escola_id)` },
  { nome: "idx_disciplinas_escola_id", comando: `CREATE INDEX IF NOT EXISTS idx_disciplinas_escola_id ON disciplinas (escola_id)` },

  // horario_slots — consultado toda vez que renderiza uma grade ou gera horário
  { nome: "idx_horario_slots_turno", comando: `CREATE INDEX IF NOT EXISTS idx_horario_slots_turno ON horario_slots (turno)` },
];

async function main() {
  console.log("🔧 Adicionando índices de performance...\n");
  for (const { nome, comando } of INDICES) {
    try {
      await db.execute(sql.raw(comando));
      console.log(`✅ ${nome}`);
    } catch (err) {
      console.error(`❌ ${nome}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log("\n🎉 Índices verificados/criados.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
