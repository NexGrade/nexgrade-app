import { db, professoresTable, turmasTable, horariosTable, disponibilidadeTable } from "@workspace/db";
import * as readline from "readline";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const MOTIVO = "Hora-atividade institucional -- turno alternativo (turno principal sem espaço, Art. 11 §4º)";

// quantas faltam e em qual turno alternativo encaixar, ja confirmado no mapeamento anterior
const PENDENCIAS: Array<{ nome: string; turnoAlternativo: string; faltam: number }> = [
  { nome: "Cristiane", turnoAlternativo: "vespertino", faltam: 1 },
  { nome: "Rafael", turnoAlternativo: "matutino", faltam: 4 },
  { nome: "Robson", turnoAlternativo: "matutino", faltam: 6 },
  { nome: "Wellington", turnoAlternativo: "matutino", faltam: 1 },
];

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

async function main() {
  const [profs, turmas, hors, disps] = await Promise.all([
    db.select().from(professoresTable),
    db.select().from(turmasTable),
    db.select().from(horariosTable),
    db.select().from(disponibilidadeTable),
  ]);
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  const paraInserir: Array<{ professorId: number; nome: string; turno: string; dia: number; aula: number }> = [];

  for (const pend of PENDENCIAS) {
    const prof = profs.find((p) => p.nome === pend.nome);
    if (!prof) {
      console.log(`Professor "${pend.nome}" não encontrado -- pulando.`);
      continue;
    }
    const ocupado = new Set(
      hors
        .filter((h) => h.professorId === prof.id && turmaMap.get(h.turmaId)?.turno === pend.turnoAlternativo)
        .map((h) => `${h.diaSemana}-${h.numeroAula}`),
    );
    const haOcupado = new Set(
      disps
        .filter((d) => d.professorId === prof.id && d.turno === pend.turnoAlternativo && d.horaAtividadeObrigatoria)
        .map((d) => `${d.diaSemana}-${d.horarioSlot}`),
    );

    let encontrados = 0;
    for (let dia = 0; dia < 5 && encontrados < pend.faltam; dia++) {
      for (let aula = 1; aula <= 8 && encontrados < pend.faltam; aula++) {
        const chave = `${dia}-${aula}`;
        if (ocupado.has(chave) || haOcupado.has(chave)) continue;
        paraInserir.push({ professorId: prof.id, nome: prof.nome, turno: pend.turnoAlternativo, dia, aula });
        encontrados++;
      }
    }
    if (encontrados < pend.faltam) {
      console.log(`ATENÇÃO: só achei ${encontrados}/${pend.faltam} slot(s) livre(s) pra ${pend.nome} em ${pend.turnoAlternativo}.`);
    }
  }

  console.log("=".repeat(70));
  console.log("COMPLETAR HA -- turno alternativo (dry-run)");
  console.log("=".repeat(70));
  for (const i of paraInserir) {
    console.log(`  + ${i.nome} | ${i.turno} | ${DIAS[i.dia]} aula ${i.aula}`);
  }
  console.log(`\nTotal a inserir: ${paraInserir.length}`);

  if (paraInserir.length === 0) {
    console.log("Nada a fazer.");
    process.exit(0);
  }

  const resp = await perguntar("\nAplicar agora? (digite 'sim' para confirmar) ");
  if (resp.trim().toLowerCase() !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.insert(disponibilidadeTable).values(
    paraInserir.map((i) => ({
      professorId: i.professorId,
      turno: i.turno,
      diaSemana: i.dia,
      horarioSlot: i.aula,
      disponivel: true,
      horaAtividadeObrigatoria: true,
      motivo: MOTIVO,
    })),
  );

  console.log(`\nPronto! ${paraInserir.length} HA inserida(s) em turno alternativo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
