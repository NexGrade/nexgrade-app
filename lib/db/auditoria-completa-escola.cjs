// Auditoria COMPLETA (somente leitura), reutilizável para qualquer
// escola -- v2, "blindada" contra falso positivo de matriz
// compartilhada (curso técnico com eletivas por turma).
//
// Verifica, por turma:
//   1. Vínculos com professor_id NULL (sempre bug real)
//   2. Vínculo sem NENHUMA carga definida -- nem override, nem
//      itens_matriz (sempre bug real, fica 0h silenciosamente)
//   3. Carga total cadastrada vs capacidade esperada
//      (25h Fundamental / 30h Médio-Técnico, com base em nivel_ensino)
//   4. Disciplina na matriz sem vínculo -- só reportado como PISTA
//      quando a carga total já está errada (matriz compartilhada faz
//      isso ser normal na maioria dos casos)
//
// Uso: node lib/db/auditoria-completa-escola.cjs <ESCOLA_ID>
// Ex.:  node lib/db/auditoria-completa-escola.cjs org_3HCLFry0r48pfutN7ChZIip3IWL
//       node lib/db/auditoria-completa-escola.cjs escola_default

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
if (!match) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const ESCOLA_ID = process.argv[2];
if (!ESCOLA_ID) {
  console.error("Uso: node auditoria-completa-escola.cjs <ESCOLA_ID>");
  process.exit(1);
}

// Calcula a capacidade real (em horas/semana) de cada combinação
// turno + nivel_ensino, contando as posições letivas em horario_slots
// -- em vez de assumir 25h/30h fixos por nivel_ensino, que não bate
// quando um turno tem posição(ões) não-letiva(s) (ex.: 1º horário
// "vago"/tolerância na noite do Mário Braga: 6 slots na tabela, mas
// só 5 marcados letivo=true).
//
// horario_slots.nivel_ensino pode ser NULL quando o turno usa o MESMO
// esquema pra todos os níveis (ex.: vespertino, noturno). Só é
// diferenciado por nível quando o turno mistura Fundamental+Médio no
// mesmo turno (ex.: matutino do Mário Braga: 5 slots pra fundamental,
// 6 pra medio_tecnico). Por isso a busca tenta o par exato primeiro e
// cai pro nivel_ensino=NULL como esquema genérico do turno.
//
// horario_slots não tem coluna de dia da semana -- o esquema é o
// mesmo pros 5 dias úteis, então capacidade semanal = slots_letivos x 5.
async function calcularCapacidades(client, escolaId) {
  const res = await client.query(
    `SELECT turno, nivel_ensino, COUNT(*) FILTER (WHERE letivo = true) AS slots_letivos
     FROM horario_slots
     WHERE escola_id = $1
     GROUP BY turno, nivel_ensino`,
    [escolaId]
  );
  const porTurnoNivel = new Map(); // chave: "turno|nivel_ensino" (nivel pode ser "null")
  for (const r of res.rows) {
    porTurnoNivel.set(`${r.turno}|${r.nivel_ensino ?? "null"}`, Number(r.slots_letivos) * 5);
  }
  return function capacidadeEsperada(turno, nivelEnsino) {
    if (porTurnoNivel.has(`${turno}|${nivelEnsino}`)) return porTurnoNivel.get(`${turno}|${nivelEnsino}`);
    if (porTurnoNivel.has(`${turno}|null`)) return porTurnoNivel.get(`${turno}|null`);
    return null; // sem esquema cadastrado pra esse turno -- não dá pra checar
  };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const problemas = {
    professorNulo: 0,
    disciplinaFaltando: 0,
    fantasma: 0,
    cargaErrada: 0,
  };

  try {
    const turmasRes = await client.query(
      `SELECT id, nome, turno, nivel_ensino, matriz_curricular_id
       FROM turmas
       WHERE escola_id = $1
       ORDER BY turno, nome`,
      [ESCOLA_ID]
    );

    console.log(`Auditando ${turmasRes.rows.length} turmas (escola_id=${ESCOLA_ID})...\n`);

    const capacidadeEsperada = await calcularCapacidades(client, ESCOLA_ID);

    let turnoAtual = null;
    for (const turma of turmasRes.rows) {
      if (turma.turno !== turnoAtual) {
        turnoAtual = turma.turno;
        console.log(`\n########## TURNO: ${turnoAtual.toUpperCase()} ##########`);
      }

      const linhasProblema = [];

      // 1. professor_id NULL
      const nulosRes = await client.query(
        `SELECT d.nome, COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0) AS carga
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1 AND td.professor_id IS NULL`,
        [turma.id, turma.matriz_curricular_id]
      );
      for (const r of nulosRes.rows) {
        linhasProblema.push(`  ❌ SEM PROFESSOR: ${r.nome} (${r.carga}h)`);
        problemas.professorNulo++;
      }

      // 4 (calculado primeiro). Carga total vs capacidade esperada —
      // é o sinal que realmente importa; os itens 2 e 3 abaixo só são
      // reportados como problema se a carga total NÃO bater, porque
      // em matrizes compartilhadas por curso (várias turmas usando a
      // mesma matriz) é normal cada turma ativar só um subconjunto de
      // disciplinas eletivas/técnicas do pool -- isso não é bug.
      const totalRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0)), 0) AS total
         FROM turma_disciplinas td
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1`,
        [turma.id, turma.matriz_curricular_id]
      );
      const total = Number(totalRes.rows[0].total);
      const esperado = capacidadeEsperada(turma.turno, turma.nivel_ensino);

      if (esperado === null) {
        linhasProblema.push(`  ⚠ Sem esquema de horario_slots cadastrado para turno="${turma.turno}" -- não foi possível checar carga total (total cadastrado: ${total}h)`);
      } else {
        const cargaBate = total === esperado;
        if (!cargaBate) {
          linhasProblema.push(`  ❌ CARGA TOTAL: ${total}h (esperado ${esperado}h para turno=${turma.turno}/nivelEnsino=${turma.nivel_ensino})`);
          problemas.cargaErrada++;

          // 2. Disciplina na matriz sem vínculo -- só reportado quando a
          //    carga já está errada, como pista do que pode estar faltando
          const faltantesRes = await client.query(
            `SELECT d.nome, im.carga_horaria_semanal
             FROM itens_matriz im
             JOIN disciplinas d ON d.id = im.disciplina_id
             WHERE im.matriz_curricular_id = $1
               AND NOT EXISTS (
                 SELECT 1 FROM turma_disciplinas td
                 WHERE td.turma_id = $2 AND td.disciplina_id = im.disciplina_id
               )`,
            [turma.matriz_curricular_id, turma.id]
          );
          for (const r of faltantesRes.rows) {
            linhasProblema.push(`     possível causa: "${r.nome}" (${r.carga_horaria_semanal}h) está na matriz mas sem vínculo aqui`);
            problemas.disciplinaFaltando++;
          }
        }
      }

      // 3. Vínculo fantasma (override sem itens_matriz) SEM carga
      //    definida (override NULL) -- esse sim é sempre bug real,
      //    porque resulta em 0h silencioso. Fantasma COM override
      //    definido é eletiva intencional, não é reportado.
      const fantasmaRes = await client.query(
        `SELECT d.nome, td.carga_horaria_semanal_override AS override
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1
           AND td.carga_horaria_semanal_override IS NULL
           AND im.id IS NULL`,
        [turma.id, turma.matriz_curricular_id]
      );
      for (const r of fantasmaRes.rows) {
        linhasProblema.push(`  ❌ VÍNCULO SEM CARGA: ${r.nome} (nem override nem itens_matriz -- fica 0h silenciosamente)`);
        problemas.fantasma++;
      }

      if (linhasProblema.length > 0) {
        console.log(`\n=== ${turma.nome} (id=${turma.id}, nivelEnsino=${turma.nivel_ensino}) ===`);
        for (const l of linhasProblema) console.log(l);
      }
    }

    console.log("\n\n========== RESUMO ==========");
    console.log(`Vínculos sem professor: ${problemas.professorNulo}`);
    console.log(`Disciplinas faltando (na matriz, sem vínculo): ${problemas.disciplinaFaltando}`);
    console.log(`Vínculos fantasma: ${problemas.fantasma}`);
    console.log(`Turmas com carga total incorreta: ${problemas.cargaErrada}`);
    const totalProblemas = Object.values(problemas).reduce((a, b) => a + b, 0);
    if (totalProblemas === 0) {
      console.log("\n✅ Nenhum problema encontrado. Escola blindada.");
    } else {
      console.log(`\n❌ Total de ${totalProblemas} problemas encontrados — revisar acima.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
