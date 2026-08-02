const fs = require("fs");

const caminho = process.argv[2];
if (!caminho) {
  console.error("Uso: node adicionar-debug-co-docencia.cjs <caminho-do-horarios.ts>");
  process.exit(1);
}

let conteudo = fs.readFileSync(caminho, "utf8");

function contar(texto, alvo) {
  return texto.split(alvo).length - 1;
}

function substituir1(texto, alvo, novo, label) {
  const qtd = contar(texto, alvo);
  if (qtd !== 1) {
    throw new Error(`[${label}] esperava 1 ocorrencia, achei ${qtd}. Abortando sem alterar nada.`);
  }
  return texto.replace(alvo, novo);
}

const ancora = `const profApoio = td.professorApoioId ? professores.find((p) => p.id === td.professorApoioId) : undefined;`;

const insercao = `${ancora}

    // [DEBUG TEMPORARIO] Diagnostico de co-docencia -- varre a semana
    // inteira e loga quais horarios passariam em TODAS as checagens
    // (titular disponivel E apoio disponivel), no estado ATUAL de
    // ocupacao (que ja reflete turmas anteriores deste mesmo lote).
    // Remover depois de diagnosticar.
    if (profApoio) {
      const diasDebug = [0, 1, 2, 3, 4];
      const aulasDebug = Array.from({ length: aulasPorDiaReal }, (_, i) => i + 1);
      const livresDebug: string[] = [];
      const motivosDebug: Record<string, string[]> = {};
      for (const diaD of diasDebug) {
        for (const aulaD of aulasDebug) {
          const chaveD = \`\${diaD}-\${aulaD}\`;
          const motivos: string[] = [];
          const titularOk = profsParaDisc.some((p) => {
            const ok = !ocupadoProf[\`\${p.id}-\${diaD}-\${aulaD}\`]
              && !indisponivelProf[\`\${p.id}-\${diaD}-\${aulaD}\`]
              && respeitaLimiteComplementar(p.id, diaD)
              && semAulaAdjacenteMesmaTurma(p.id, diaD, aulaD);
            return ok;
          });
          if (!titularOk) motivos.push("titular-indisponivel");
          if (ocupadoProf[\`\${profApoio.id}-\${diaD}-\${aulaD}\`]) motivos.push("apoio-ocupado");
          if (indisponivelProf[\`\${profApoio.id}-\${diaD}-\${aulaD}\`]) motivos.push("apoio-bloqueado-disponibilidade");
          if (!respeitaLimiteComplementar(profApoio.id, diaD)) motivos.push("apoio-limite-diario");
          if (!semAulaAdjacenteMesmaTurma(profApoio.id, diaD, aulaD)) motivos.push("apoio-aula-adjacente");
          if (motivos.length === 0) {
            livresDebug.push(chaveD);
          } else {
            motivosDebug[chaveD] = motivos;
          }
        }
      }
      console.log(
        \`[CO-DOCENCIA DEBUG] turma=\${turmaId} disc=\${td.disciplinaId} titular=[\${profsParaDisc.map((p) => p.nome).join(",")}] apoio=\${profApoio.nome} cargaSemanal=\${cargaEfetiva(td, disc)} slotsLivres=\${JSON.stringify(livresDebug)}\`,
      );
      console.log(\`[CO-DOCENCIA DEBUG] motivos dos bloqueados: \${JSON.stringify(motivosDebug)}\`);
    }`;

conteudo = substituir1(conteudo, ancora, insercao, "debug-co-docencia");

fs.writeFileSync(caminho, conteudo, "utf8");
console.log("Debug de co-docencia inserido com sucesso em:", caminho);
