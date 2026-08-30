// Chama recalcularHoraAtividade diretamente, sem precisar promover uma
// grade pela tela. Útil pra aplicar a correção de reposicionamento de
// HA (ver recalcular-ha.ts) nos professores que já estão com HA numa
// posição que não fecha janela.
//
// Uso (da raiz do projeto, C:\Projetos\nexgrade-app):
//   npx tsx scripts/rodar-recalculo-ha.ts

import { recalcularHoraAtividade } from "../artifacts/api-server/src/lib/recalcular-ha";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  console.log("Recalculando Hora-Atividade...");
  const resultado = await recalcularHoraAtividade(ESCOLA_ID);
  console.log("Resultado:", JSON.stringify(resultado, null, 2));
  console.log(`\n${resultado.inseridas} HA inserida(s), ${resultado.removidas} removida(s), ${resultado.professoresAfetados} professor(es) afetado(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
