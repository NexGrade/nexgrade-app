import { db, professoresTable, turmasTable, horariosTable, disponibilidadeTable } from "@workspace/db";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

async function run() {
  const [profs, turmas, hors, disps] = await Promise.all([
    db.select().from(professoresTable),
    db.select().from(turmasTable),
    db.select().from(horariosTable),
    db.select().from(disponibilidadeTable),
  ]);
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const alvo: Array<[string, string]> = [
    ["Cristiane", "matutino"],
    ["Rafael", "vespertino"],
    ["Robson", "vespertino"],
    ["Wellington", "vespertino"],
  ];

  for (const [nome, turno] of alvo) {
    const prof = profs.find((p) => p.nome === nome);
    if (!prof) {
      console.log(`Professor "${nome}" nao encontrado`);
      continue;
    }
    const ocupado = new Set(
      hors
        .filter((h) => h.professorId === prof.id && turmaMap.get(h.turmaId)?.turno === turno)
        .map((h) => `${h.diaSemana}-${h.numeroAula}`),
    );
    const haOcupado = new Set(
      disps
        .filter((d) => d.professorId === prof.id && d.turno === turno && d.horaAtividadeObrigatoria)
        .map((d) => `${d.diaSemana}-${d.horarioSlot}`),
    );
    console.log(`=== ${nome} (${turno}) ===`);
    for (let dia = 0; dia < 5; dia++) {
      let linha = DIAS[dia] + ": ";
      for (let aula = 1; aula <= 8; aula++) {
        const chave = `${dia}-${aula}`;
        linha += ocupado.has(chave) ? "A" : haOcupado.has(chave) ? "H" : "_";
      }
      console.log(linha);
    }
    console.log();
  }
  process.exit(0);
}

run();
