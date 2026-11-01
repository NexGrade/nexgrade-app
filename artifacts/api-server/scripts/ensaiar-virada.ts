// [VIRADA-ANO] (24/10/2026) Ensaio da virada do ano letivo pelo terminal (no repositorio desde 01/11/2026).
// SO na escola de demonstracao, a nao ser que passe --escola=... de proposito.
// Uso (na pasta artifacts\api-server, com $env:DATABASE_URL apontando para o banco):
//   npx tsx scripts/ensaiar-virada.ts                 -> situacao + previa (nao grava)
//   npx tsx scripts/ensaiar-virada.ts --liberar       -> libera a virada antes do fim do ano (como a Nexus Core)
//   npx tsx scripts/ensaiar-virada.ts --aplicar       -> vira o ano (todas as turmas continuam, ninguem sai)
//   npx tsx scripts/ensaiar-virada.ts --desfazer      -> desfaz a ultima virada
import { pool } from "@workspace/db";
import { desfazerVirada, executarVirada, liberarViradaAntes, previaVirada, situacaoVirada } from "../src/lib/virada-ano";

const DEMO = "esc_1ce4d2d30c4146a99fb7ffa5";
const arg = (n: string) => process.argv.includes(`--${n}`);
const escolaArg = process.argv.find((a) => a.startsWith("--escola="))?.split("=")[1];
const escola = escolaArg ?? DEMO;

(async () => {
  if (escola !== DEMO && !arg("sim-e-uma-escola-real")) {
    console.log("Esta escola nao e a de demonstracao. Para continuar mesmo assim, acrescente --sim-e-uma-escola-real.");
    return;
  }
  if (arg("liberar")) console.log(await liberarViradaAntes(escola, "ensaio-terminal"));
  if (arg("desfazer")) { console.log(await desfazerVirada(escola)); }
  else if (arg("aplicar")) {
    const s = await situacaoVirada(escola);
    console.log(await executarVirada(escola, { excluirTurmas: [], duplicarTurmas: [], professoresQueSaem: [], confirmacao: s.confirmacao }, "ensaio-terminal"));
  }
  const p = await previaVirada(escola);
  const s = p.situacao;
  console.log(`\nAno das turmas: ${s.anoDe} -> virada para ${s.anoPara} | fim do ano letivo: ${s.fimDoAno ?? "(sem calendario)"} | liberada: ${s.liberada ? "SIM" : "nao"}${s.liberadaPeloMaster ? " (pela Nexus Core)" : ""}`);
  console.log(`Ultima virada: ${s.ultimaVirada ? `${s.ultimaVirada.anoDe} -> ${s.ultimaVirada.anoPara} em ${s.ultimaVirada.feitaEm}` : "nenhuma"} | pode desfazer: ${s.podeDesfazer ? "SIM" : "nao"}${s.motivoNaoDesfaz ? ` (${s.motivoNaoDesfaz})` : ""}`);
  console.log(`Turmas: ${p.turmas.length} (${p.turmas.filter((t) => t.semProfessor > 0).length} com disciplina sem professor) | professores ativos: ${p.professores.filter((x) => x.ativo).length}`);
  console.log(`Zera na virada: ${p.zera.aulasOficiais} aulas da grade oficial, ${p.zera.experimentos} linhas de experimentos, ${p.zera.disponibilidade} linhas de disponibilidade, ${p.zera.codigosSere} codigos SERE`);
  if (!arg("aplicar") && !arg("desfazer")) console.log("\nNADA FOI GRAVADO (previa).");
  await pool.end();
})().catch(async (e) => { console.error("ERRO:", e); await pool.end(); process.exit(1); });
