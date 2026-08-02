const fs = require("fs");

const caminho = process.argv[2];
if (!caminho) {
  console.error("Uso: node aplicar-co-docencia.cjs <caminho-do-horarios.ts>");
  process.exit(1);
}

let conteudo = fs.readFileSync(caminho, "utf8");

function contarOcorrencias(texto, alvo) {
  return texto.split(alvo).length - 1;
}

function substituirTodas(texto, alvo, novo, esperadas) {
  const qtd = contarOcorrencias(texto, alvo);
  if (qtd !== esperadas) {
    throw new Error(
      `Esperava encontrar "${alvo.slice(0, 60)}..." exatamente ${esperadas}x, mas achei ${qtd}x. Abortando sem alterar nada.`,
    );
  }
  return texto.split(alvo).join(novo);
}

// 1) Insere o calculo de profApoio uma unica vez, logo antes de
//    "const alocacaoPorDia" (que so aparece 1x no arquivo, dentro do
//    loop principal de disciplinas).
const ancoraAlocacaoPorDia = "const alocacaoPorDia: Record<number, number> = {};";
const insercaoProfApoio =
  "// [NOVO] Segundo professor (co-docencia confirmada pela escola --\n" +
  "    // ver comentario em schema/turmas.ts sobre professorApoioId). Quando\n" +
  "    // definido, toda vez que o titular for alocado num slot, o apoio\n" +
  "    // TAMBEM precisa estar livre naquele mesmo slot -- e os dois ganham\n" +
  "    // uma linha propria em horarios (ver alocar() abaixo), pra que a\n" +
  "    // carga horaria de ambos seja contabilizada corretamente.\n" +
  "    const profApoio = td.professorApoioId ? professores.find((p) => p.id === td.professorApoioId) : undefined;\n\n" +
  "    " + ancoraAlocacaoPorDia;

conteudo = substituirTodas(conteudo, ancoraAlocacaoPorDia, insercaoProfApoio, 1);

// 2) Nos DOIS lacos de alocacao (principal e o de "sobras"), o professor
//    candidato so e considerado disponivel se, alem de tudo que ja era
//    checado, o professor de apoio (se houver) TAMBEM estiver livre
//    naquele slot exato.
const alvoCondicao = "&& semAulaAdjacenteMesmaTurma(p.id, dia, aula),";
const novaCondicao =
  "&& semAulaAdjacenteMesmaTurma(p.id, dia, aula)\n" +
  "            && (!profApoio || (\n" +
  "              !ocupadoProf[`${profApoio.id}-${dia}-${aula}`]\n" +
  "              && !indisponivelProf[`${profApoio.id}-${dia}-${aula}`]\n" +
  "              && respeitaLimiteComplementar(profApoio.id, dia)\n" +
  "              && semAulaAdjacenteMesmaTurma(profApoio.id, dia, aula)\n" +
  "            )),";

conteudo = substituirTodas(conteudo, alvoCondicao, novaCondicao, 2);

// 3) Nos mesmos dois lacos, depois de alocar o titular, aloca tambem o
//    apoio (se houver) no MESMO disciplinaId/dia/aula -- gera uma
//    segunda linha em horarios pra ele.
const alvoAlocar = "alocar(td.disciplinaId, profDisponivel.id, dia, aula);";
const novoAlocar =
  "alocar(td.disciplinaId, profDisponivel.id, dia, aula);\n" +
  "        if (profApoio) alocar(td.disciplinaId, profApoio.id, dia, aula);";

conteudo = substituirTodas(conteudo, alvoAlocar, novoAlocar, 2);

fs.writeFileSync(caminho, conteudo, "utf8");
console.log("Co-docencia aplicada com sucesso em:", caminho);
