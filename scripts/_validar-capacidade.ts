import { validarCapacidadeProfessores } from "../artifacts/api-server/src/lib/capacidade-professor";
const escolaId = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const r = await validarCapacidadeProfessores(escolaId);
const erros = r.filter((x) => x.nivel === "erro"), avisos = r.filter((x) => x.nivel === "aviso");
console.log(`ERROS: ${erros.length} | AVISOS: ${avisos.length}`);
for (const x of r) console.log(`  [${x.nivel.toUpperCase()}] ${x.professor} | aulas ${JSON.stringify(x.aulasPorTurno)} + HA ${x.haExigida} | livres ${JSON.stringify(x.livresPorTurno)} | ${x.mensagem}`);
process.exit(0);
