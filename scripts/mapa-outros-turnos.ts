import { db, professoresTable, turmasTable, horariosTable, disponibilidadeTable } from "@workspace/db";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNOS = ["matutino", "vespertino", "noturno"];

async function run() {
  const [profs, turmas, hors, disps] = await Promise.all([
    db.select().from(professoresTable),
    db.select().from(turmasTable),
    db.select().from(horariosTable),
    db.select().from(disponibilidadeTable),
  ]);
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const nomes = ["Cristiane", "Rafael", "Robson", "Wellington"];

  for (const nome of nomes) {
    const prof = profs.find((p) => p.nome === nome);
    if (!prof) continue;
    console.log(`\n########## ${nome} -- todos os turnos ##########`);
    for (const turno of TURNOS) {
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
      if (ocupado.size === 0 && haOcupado.size === 0) continue; // nao trabalha nesse turno
      let livres = 0;
      console.log(`  --- ${turno} ---`);
      for (let dia = 0; dia < 5; dia++) {
        let linha = "  " + DIAS[dia] + ": ";
        for (let aula = 1; aula <= 8; aula++) {
          const chave = `${dia}-${aula}`;
          if (ocupado.has(chave)) linha += "A";
          else if (haOcupado.has(chave)) linha += "H";
          else {
            linha += "_";
            livres++;
          }
        }
        console.log(linha);
      }
      console.log(`  (${livres} slot(s) livre(s) nesse turno)`);
    }
  }
  process.exit(0);
}

run();
