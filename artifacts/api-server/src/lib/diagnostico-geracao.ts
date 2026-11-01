// [DIAGNOSTICO-GERACAO] (01/11/2026) Transforma a resposta da geracao (CP-SAT/heuristico) e da promocao numa
// lista de problemas com O QUE esta errado e a SUGESTAO de correcao, para a tela mostrar em vez de so a frase
// do erro. Achado da bateria de simulacoes de 01/11: as listas que dizem o que corrigir (causas do motor, aulas
// fixas impossiveis, vinculos sem professor, aulas fora do esquema) chegavam ao servidor e se perdiam na tela.
// Funcao pura (testada em __tests__/diagnostico-geracao.test.ts).

export type ProblemaGeracao = { oQue: string; sugestao?: string };
export type DiagnosticoGeracao = {
  titulo: string;
  resumo?: string;
  problemas: ProblemaGeracao[];
  avisos: ProblemaGeracao[];
};

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Sugestao para cada frase do diagnostico do motor (cpsat-service/app/diagnostico_inviabilidade.py). */
export function sugestaoParaCausa(causa: string): string | undefined {
  let m = /^(.+?): (\d+) aulas no turno, mas só tem (\d+) horário\(s\) livre\(s\)/.exec(causa);
  if (m) return `Libere ${plural(Number(m[2]) - Number(m[3]), "horário", "horários")} de ${m[1]} na Disponibilidade, ou passe aulas para outro professor.`;
  m = /^(.+?): (\d+) aulas no turno, acima do teto de (\d+)/.exec(causa);
  if (m) return `Tire ${plural(Number(m[2]) - Number(m[3]), "aula", "aulas")} de ${m[1]} neste turno, ou autorize um teto maior para ele em Conflitos.`;
  m = /^(.+?) · (.+?) · (.+?): precisa de (\d+) aula\(s\) por semana, mas só cabem (\d+)/.exec(causa);
  if (m) return `Libere horários de ${m[1]}, ou aumente o limite de aulas por dia de ${m[3]} em Regras de Distribuição.`;
  m = /^Turma (.+?): (\d+) aulas por semana, mas só tem (\d+) horários/.exec(causa);
  if (m) return `Reduza ${plural(Number(m[2]) - Number(m[3]), "aula", "aulas")} da turma ${m[1]}, ou marque aulas como assíncronas.`;
  if (/^Aula fixa de .+ cai num horário bloqueado/.test(causa)) return "Mova a aula fixa para um horário livre do professor, ou libere esse horário na Disponibilidade.";
  if (/duas aulas fixas no mesmo horário/.test(causa)) return "Mova uma das aulas fixas para outro horário.";
  return undefined;
}

const comSugestao = (oQue: string): ProblemaGeracao => ({ oQue, sugestao: sugestaoParaCausa(oQue) });

/** Diagnostico de uma resposta de geracao (sincrona ou do job assincrono). `null` quando nao ha nada a mostrar. */
export function diagnosticarGeracao(httpStatus: number, body: Record<string, any> | undefined | null): DiagnosticoGeracao | null {
  if (!body) return null;
  const ok = httpStatus >= 200 && httpStatus < 300;
  const problemas: ProblemaGeracao[] = [];
  const avisos: ProblemaGeracao[] = [];
  let titulo = ok ? "Grade gerada" : "A grade não foi gerada";
  let resumo: string | undefined;

  const capacidadeErros: string[] = Array.isArray(body.capacidade?.erros) ? body.capacidade.erros : [];
  const parte = body.etapa === "medio_tecnico" ? " (na etapa do Médio/Técnico)" : body.etapa === "fundamental" ? " (na etapa do Fundamental)" : "";

  if (!ok) {
    if (body.error === "TEMPO_ESGOTADO" || (body.error === "INVIAVEL" && body.status === "UNKNOWN")) {
      titulo = "O motor não terminou a tempo";
      problemas.push({
        oQue: `O cálculo parou no tempo limite${parte} sem achar uma grade. Isso NÃO quer dizer que a grade é impossível.`,
        sugestao: "Gere de novo com mais tempo (Tempo limite), ou gere um grupo menor de turmas (Turno parcial).",
      });
    } else if (body.error === "INVIAVEL") {
      titulo = `Não existe grade possível com os dados de hoje${parte}`;
      const causas: string[] = Array.isArray(body.causasInviabilidade) ? body.causasInviabilidade : [];
      if (causas.length) problemas.push(...causas.map(comSugestao));
      else problemas.push({
        oQue: "O motor não achou uma contradição simples: o que trava é a combinação de várias regras (bloqueios, aulas seguidas, limites por dia).",
        sugestao: "Veja a capacidade dos professores abaixo e a tela de Conflitos; gerar por partes (Turno parcial) ajuda a achar a turma que trava.",
      });
    } else if (Array.isArray(body.fixasImpossiveis) && body.fixasImpossiveis.length) {
      titulo = "Há aulas fixas impossíveis de manter";
      problemas.push(...body.fixasImpossiveis.map((f: string) => ({ oQue: f, sugestao: "Mova essa aula fixa para um horário livre do professor, ou libere o horário na Disponibilidade." })));
    } else if (Array.isArray(body.gruposInconsistentes) && body.gruposInconsistentes.length) {
      titulo = "Dupla ou trio com cargas diferentes";
      problemas.push(...body.gruposInconsistentes.map((g: string) => ({ oQue: g, sugestao: "Deixe a mesma carga semanal em todas as turmas da dupla/trio." })));
    } else if (Array.isArray(body.semMapa) && body.semMapa.length) {
      titulo = "Não dá para melhorar: há aulas da grade oficial sem vínculo";
      problemas.push(...body.semMapa.slice(0, 30).map((s: unknown) => ({ oQue: typeof s === "string" ? s : JSON.stringify(s), sugestao: "Corrija o vínculo da turma (professor/disciplina) ou use Gerar do zero em vez de Melhorar." })));
    } else if (httpStatus === 502) {
      titulo = "O servidor de cálculo não respondeu";
      problemas.push({ oQue: "A grade não foi calculada porque o servidor de cálculo não respondeu (pode estar ligando).", sugestao: body.dica ?? "Tente de novo em 1 ou 2 minutos." });
    } else if (body.error === "CANCELADO" || body.paradoPeloUsuario) {
      titulo = "Cálculo parado";
    } else {
      problemas.push({ oQue: String(body.mensagem || body.error || "Erro ao gerar a grade.") });
    }
    if (body.experimentoDescartado) resumo = "Nada foi gravado: a parte que já tinha sido calculada foi descartada para não ficar um experimento pela metade.";
    // capacidade: professor que nao cabe no turno costuma ser a causa; so entra quem o motor ainda nao citou
    const professorDe = (c: string) => c.split(":")[0]!.trim();
    avisos.push(...capacidadeErros
      .filter((c) => !problemas.some((p) => p.oQue.startsWith(`${professorDe(c)}:`)))
      .map((c) => ({ oQue: c })));
  }

  // sucesso (ou erro) com aulas que ficaram de fora
  const semProf: Array<{ turma: string; disciplina: string }> = Array.isArray(body.detalheSemProfessorResolvido) ? body.detalheSemProfessorResolvido : [];
  if (semProf.length) avisos.push(...semProf.map((s) => ({
    oQue: `${s.disciplina} da ${s.turma} ficou FORA da grade: o vínculo não tem professor.`,
    sugestao: `Escolha o professor de ${s.disciplina} na turma ${s.turma} e gere de novo.`,
  })));
  else if (Number(body.semProfessorResolvido) > 0) avisos.push({ oQue: `${body.semProfessorResolvido} vínculo(s) sem professor ficaram fora da grade.`, sugestao: "Escolha o professor desses vínculos e gere de novo." });
  const naoMap = Array.isArray(body.detalheNaoMapeadas) ? body.detalheNaoMapeadas.length : Number(body.naoMapeadas) || 0;
  // heuristico: "Apenas a/b aulas alocadas..." e "Sem professor habilitado..."
  const conflitos: unknown[] = Array.isArray(body.conflitos) ? body.conflitos : [];
  for (const c of conflitos) {
    if (typeof c !== "string") continue;
    const semProfHab = /^Sem professor habilitado para "(.+)"/.exec(c);
    if (semProfHab) avisos.push({ oQue: c, sugestao: `Habilite um professor para ${semProfHab[1]} (Professores → Disciplinas que leciona) ou escolha o professor no vínculo da turma.` });
    else if (/^Apenas \d+\/\d+ aulas alocadas/.test(c) && /a turma não tem mais horário livre/.test(c)) avisos.push({ oQue: c, sugestao: "A turma já está com todos os horários ocupados: gere a turma substituindo a grade atual, ou reduza a carga de alguma disciplina." });
    else if (/^Apenas \d+\/\d+ aulas alocadas/.test(c)) avisos.push({ oQue: c, sugestao: "Libere horários do professor, mude aulas dele de outra turma, ou escolha outro professor para esta disciplina." });
    else avisos.push({ oQue: c });
  }
  if (naoMap > 0) avisos.push({ oQue: `${naoMap} aula(s) calculadas não puderam ser gravadas (turma, disciplina ou professor não reconhecido).`, sugestao: "Confira se algum cadastro mudou durante o cálculo e gere de novo." });

  if (ok && !avisos.length) return null;
  if (ok) titulo = "Grade gerada, com avisos";
  return { titulo, resumo, problemas, avisos };
}

/** Diagnostico da promocao recusada por aulas fora do esquema de horarios da turma. */
export function diagnosticarViolacoesPromocao(
  violacoes: Array<{ turma: string; disciplina: string; diaSemana: number; numeroAula: number; periodosValidos: number[] }>,
): DiagnosticoGeracao {
  return {
    titulo: "O experimento não pode ser promovido",
    resumo: "Há aulas em horários que não existem no esquema de aulas da turma.",
    problemas: violacoes.map((v) => ({
      oQue: `${v.disciplina} da ${v.turma} está na ${v.numeroAula}ª aula de ${DIAS[v.diaSemana] ?? v.diaSemana}, mas o esquema da turma só tem as aulas ${v.periodosValidos.join(", ")}.`,
      sugestao: "Ajuste o esquema de aulas da turma, ou gere o experimento de novo.",
    })),
    avisos: [],
  };
}
