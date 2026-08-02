const fs = require("fs");

const caminho = process.argv[2];
if (!caminho) {
  console.error("Uso: node aplicar-escopo-professor.cjs <caminho-do-horarios.ts>");
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

// 1) GerarOpts ganha o campo opcional apenasProfessorId
const old1 = `export interface GerarOpts {
  escolaId: string;
  turmaId: number;
  aulaspordia?: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  compactarCargaHoraria?: boolean;
  experimental: boolean;
  nomeExperimental?: string;
}`;
const new1 = `export interface GerarOpts {
  escolaId: string;
  turmaId: number;
  aulaspordia?: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  compactarCargaHoraria?: boolean;
  experimental: boolean;
  nomeExperimental?: string;
  // [NOVO] Quando definido, a regeneracao fica restrita as disciplinas
  // deste professor (titular OU apoio) nesta turma -- as demais
  // disciplinas/professores da turma ficam intocados. Usado por
  // POST /gerar-professor pra evitar que regenerar as turmas de UM
  // professor apague/realoque as aulas de TODOS os outros professores
  // que dividem essas mesmas turmas.
  apenasProfessorId?: number;
}`;
conteudo = substituir1(conteudo, old1, new1, "GerarOpts");

// 2) Logo apos validar que a turma tem disciplinas, calcula o
//    subconjunto de disciplinas do professor-alvo (se houver).
const old2 = `if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");`;
const new2 = `if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");

  // [NOVO] Ver comentario em GerarOpts.apenasProfessorId.
  const turmaDiscsAlvo = opts.apenasProfessorId
    ? turmaDiscs.filter((td) => td.professorId === opts.apenasProfessorId || td.professorApoioId === opts.apenasProfessorId)
    : turmaDiscs;
  if (opts.apenasProfessorId && turmaDiscsAlvo.length === 0) {
    throw new Error("Este professor não tem nenhuma disciplina vinculada nesta turma.");
  }
  const discIdsAlvo = new Set(turmaDiscsAlvo.map((td) => td.disciplinaId));`;
conteudo = substituir1(conteudo, old2, new2, "turmaDiscsAlvo");

// 3) O algoritmo principal passa a iterar so sobre as disciplinas-alvo
//    (todas, se nao houver escopo de professor).
const old3 = `const discOrdenadas = [...turmaDiscs].sort((a, b) => {`;
const new3 = `const discOrdenadas = [...turmaDiscsAlvo].sort((a, b) => {`;
conteudo = substituir1(conteudo, old3, new3, "discOrdenadas");

// 4) "existing" (slots ja gravados desta turma, candidatos a serem
//    substituidos) passa a considerar so os das disciplinas-alvo --
//    os das demais disciplinas ficam de fora de existingIds, e por
//    isso continuam presentes em baseSlots como obstaculo fixo (nao
//    podem ser realocados).
const old4 = `  const existingIds = new Set(existing.map(s => s.id));
  const baseSlots = substituir ? allSlots.filter(s => !existingIds.has(s.id)) : allSlots;`;
const new4 = `  const existingEscopado = opts.apenasProfessorId
    ? existing.filter((s) => discIdsAlvo.has(s.disciplinaId))
    : existing;
  const existingIds = new Set(existingEscopado.map(s => s.id));
  const baseSlots = substituir ? allSlots.filter(s => !existingIds.has(s.id)) : allSlots;`;
conteudo = substituir1(conteudo, old4, new4, "existingEscopado");

// 5) Apagar so as disciplinas-alvo, nao a turma inteira, ao substituir
//    (tanto no caminho experimental quanto no real).
const old5a = `      if (substituir) {
        await tx.delete(horariosExperimentaisTable)
          .where(and(
            eq(horariosExperimentaisTable.turmaId, turmaId),
            eq(horariosExperimentaisTable.nome, nomeExperimental!),
            eq(horariosExperimentaisTable.escolaId, escolaId),
          ));
      }`;
const new5a = `      if (substituir) {
        const condicaoDeleteExp = opts.apenasProfessorId
          ? and(
              eq(horariosExperimentaisTable.turmaId, turmaId),
              eq(horariosExperimentaisTable.nome, nomeExperimental!),
              eq(horariosExperimentaisTable.escolaId, escolaId),
              inArray(horariosExperimentaisTable.disciplinaId, [...discIdsAlvo]),
            )
          : and(
              eq(horariosExperimentaisTable.turmaId, turmaId),
              eq(horariosExperimentaisTable.nome, nomeExperimental!),
              eq(horariosExperimentaisTable.escolaId, escolaId),
            );
        await tx.delete(horariosExperimentaisTable).where(condicaoDeleteExp);
      }`;
conteudo = substituir1(conteudo, old5a, new5a, "delete-experimental");

const old5b = `    if (substituir) {
      await tx.delete(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
    }`;
const new5b = `    if (substituir) {
      const condicaoDelete = opts.apenasProfessorId
        ? and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId), inArray(horariosTable.disciplinaId, [...discIdsAlvo]))
        : and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId));
      await tx.delete(horariosTable).where(condicaoDelete);
    }`;
conteudo = substituir1(conteudo, old5b, new5b, "delete-real");

// 6) POST /gerar-professor passa o escopo pro algoritmo.
const old6 = `      const r = await gerarAlgoritmo({
        escolaId,
        turmaId,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
      });`;
const new6 = `      const r = await gerarAlgoritmo({
        escolaId,
        turmaId,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
        apenasProfessorId: professorId,
      });`;
conteudo = substituir1(conteudo, old6, new6, "chamada-gerar-professor");

fs.writeFileSync(caminho, conteudo, "utf8");
console.log("Escopo por professor aplicado com sucesso em:", caminho);
