import { describe, it, expect } from "vitest";
import { diagnosticarGeracao, diagnosticarViolacoesPromocao, sugestaoParaCausa, explicarBloqueiosNaCausa, type OrigemBloqueio } from "../diagnostico-geracao";

// [DIAGNOSTICO-GERACAO] (01/11/2026) respostas reais da bateria de simulacoes (copia da Escola Demonstracao, CP-SAT local)
describe("diagnostico da geracao", () => {
  it("inviavel: cada causa do motor vira um problema com sugestao", () => {
    const d = diagnosticarGeracao(422, {
      error: "INVIAVEL", status: "INFEASIBLE",
      causasInviabilidade: [
        "Patrícia Fernandes: 23 aulas no turno, mas só tem 18 horário(s) livre(s) (12 bloqueados).",
        "Bruno Soares · 8MA · Arte: precisa de 10 aula(s) por semana, mas só cabem 9 (limite de 3 por dia e horários livres do professor).",
        "Turma 8MA: 33 aulas por semana, mas só tem 30 horários (6 por dia).",
      ],
    })!;
    expect(d.titulo).toMatch(/Não existe grade possível/);
    expect(d.problemas.map((p) => p.sugestao)).toEqual([
      "Libere 5 horários de Patrícia Fernandes na Disponibilidade, ou passe aulas para outro professor.",
      "Libere horários de Bruno Soares, ou aumente o limite de aulas por dia de Arte em Regras de Distribuição.",
      "Reduza 3 aulas da turma 8MA, ou marque aulas como assíncronas.",
    ]);
  });

  it("tempo esgotado nao e chamado de inviavel", () => {
    for (const body of [{ error: "TEMPO_ESGOTADO", status: "UNKNOWN" }, { error: "INVIAVEL", status: "UNKNOWN" }]) {
      const d = diagnosticarGeracao(422, body)!;
      expect(d.titulo).toBe("O motor não terminou a tempo");
      expect(d.problemas[0]!.oQue).toMatch(/NÃO quer dizer que a grade é impossível/);
      expect(d.problemas[0]!.sugestao).toMatch(/mais tempo/);
    }
  });

  it("experimento descartado e etapa aparecem no texto", () => {
    const d = diagnosticarGeracao(422, { error: "INVIAVEL", status: "INFEASIBLE", etapa: "medio_tecnico", experimentoDescartado: true, causasInviabilidade: [] })!;
    expect(d.titulo).toMatch(/etapa do Médio\/Técnico/);
    expect(d.resumo).toMatch(/Nada foi gravado/);
    expect(d.problemas[0]!.oQue).toMatch(/combinação de várias regras/);
  });

  it("aulas fixas impossiveis aparecem uma a uma", () => {
    const d = diagnosticarGeracao(400, { error: "Ha aula(s) fixa(s) impossivel(is) de manter -- ajuste antes de gerar.",
      fixasImpossiveis: ["2MD MA Seg 1a aula (Patrícia Fernandes): o professor esta bloqueado (ou com HA fixa) neste horario"] })!;
    expect(d.titulo).toBe("Há aulas fixas impossíveis de manter");
    expect(d.problemas).toHaveLength(1);
    expect(d.problemas[0]!.oQue).toMatch(/2MD MA Seg 1a aula/);
  });

  it("capacidade entra so para quem o motor ainda nao citou", () => {
    const d = diagnosticarGeracao(422, {
      error: "INVIAVEL", status: "INFEASIBLE",
      causasInviabilidade: ["Patrícia Fernandes: 23 aulas no turno, mas só tem 18 horário(s) livre(s) (12 bloqueados)."],
      capacidade: { erros: ["Patrícia Fernandes: 23 aula(s) no matutino, mas so 18 horario(s) livre(s)", "João Lima: 20 aula(s) no matutino, mas so 15 horario(s) livre(s)"] },
    })!;
    expect(d.avisos.map((a) => a.oQue)).toEqual(["João Lima: 20 aula(s) no matutino, mas so 15 horario(s) livre(s)"]);
  });

  it("sucesso com vinculo sem professor avisa qual aula ficou de fora", () => {
    const d = diagnosticarGeracao(200, { status: "FEASIBLE", semProfessorResolvido: 1, detalheSemProfessorResolvido: [{ turma: "8MA", disciplina: "Arte" }] })!;
    expect(d.titulo).toBe("Grade gerada, com avisos");
    expect(d.avisos[0]!.oQue).toBe("Arte da 8MA ficou FORA da grade: o vínculo não tem professor.");
  });

  it("sucesso sem nada a dizer nao gera diagnostico", () => {
    expect(diagnosticarGeracao(200, { status: "OPTIMAL", semProfessorResolvido: 0, naoMapeadas: 0 })).toBeNull();
  });

  it("heuristico: avisos com sugestao", () => {
    const d = diagnosticarGeracao(200, { conflitos: [
      "Apenas 0/4 aulas alocadas para \"Língua Portuguesa\" (Ana): dos 30 horários livres da turma, em 30 o professor já dá aula em outra turma.",
      "Sem professor habilitado para \"Arte\"",
    ] })!;
    expect(d.avisos[0]!.sugestao).toMatch(/Libere horários do professor/);
    expect(d.avisos[1]!.sugestao).toMatch(/Habilite um professor para Arte/);
  });

  it("servidor de calculo fora do ar usa a dica", () => {
    const d = diagnosticarGeracao(502, { error: "Não foi possível gerar a grade.", dica: "Tente de novo em 1 ou 2 minutos." })!;
    expect(d.titulo).toBe("O servidor de cálculo não respondeu");
    expect(d.problemas[0]!.sugestao).toBe("Tente de novo em 1 ou 2 minutos.");
  });

  it("turma que os professores nao conseguem cobrir no dia: sugestao aponta Disponibilidade e limite por dia [TURMA-POR-DIA]", () => {
    const c = "Turma 2MF: precisa de 30 aulas por semana, mas os professores dela só conseguem cobrir 28 (bloqueios de cada um + limite por dia de cada disciplina). Por dia: Segunda 4 de 6.";
    expect(sugestaoParaCausa(c)).toBe("Faltam 2 aulas na turma 2MF: libere horários dos professores dela nos dias indicados (Disponibilidade), ou aumente o limite por dia de alguma disciplina dela (Regras de Distribuição).");
    const d = diagnosticarGeracao(422, { error: "INVIAVEL", status: "INFEASIBLE", causasInviabilidade: [c] })!;
    expect(d.titulo).toBe("Não existe grade possível com os dados de hoje");
    expect(d.problemas[0]!.oQue).toBe(c);
  });

  it("frase desconhecida do motor fica sem sugestao (nao inventa)", () => {
    expect(sugestaoParaCausa("Alguma regra nova do motor.")).toBeUndefined();
  });

  it("promocao recusada diz turma, disciplina, dia e aula", () => {
    const d = diagnosticarViolacoesPromocao([{ turma: "6MA", disciplina: "Matemática", diaSemana: 0, numeroAula: 9, periodosValidos: [1, 2, 3, 4, 5] }]);
    expect(d.problemas[0]!.oQue).toBe("Matemática da 6MA está na 9ª aula de Segunda, mas o esquema da turma só tem as aulas 1, 2, 3, 4, 5.");
  });
});

describe("diagnostico do heuristico com a turma cheia", () => {
  it("sugere substituir a grade da turma em vez de liberar horario do professor", () => {
    const d = diagnosticarGeracao(200, { conflitos: ["Apenas 0/4 aulas alocadas para \"Matemática\" (Ana): a turma não tem mais horário livre."] })!;
    expect(d.avisos[0]!.sugestao).toMatch(/substituindo a grade atual/);
  });
});

// [ORIGEM-BLOQUEIO] [DIAGNOSTICO-ULTIMA-AULA] (03/11/2026) bateria de 03/11: Ed. Fisica do Medio passada para a Flavia
describe("de onde vem cada horario bloqueado", () => {
  const origens = (lista: Array<[number, number, OrigemBloqueio]>) => new Map([["Flávia Machado", new Map(lista.map(([d, a, o]) => [`${d}-${a}`, o] as [string, OrigemBloqueio]))]]);
  // 21 bloqueios na Disponibilidade + 8 horarios com aula dela no Fundamental (ja posto na etapa anterior)
  const flavia = origens([
    ...[1, 2, 3, 4, 5, 6].flatMap((a) => [[0, a, "bloqueio"], [2, a, "bloqueio"], [3, a, "bloqueio"]] as Array<[number, number, OrigemBloqueio]>),
    [1, 5, "bloqueio"], [1, 6, "bloqueio"], [4, 6, "bloqueio"],
    [1, 1, "outraTurma"], [1, 2, "outraTurma"], [1, 3, "outraTurma"], [1, 4, "outraTurma"], [4, 1, "outraTurma"], [4, 2, "outraTurma"], [4, 3, "outraTurma"], [4, 5, "outraTurma"],
  ]);

  it("separa bloqueio da Disponibilidade e aula em outra turma", () => {
    const c = explicarBloqueiosNaCausa("Flávia Machado: 4 aulas no turno, mas só tem 1 horário(s) livre(s) (29 bloqueados).", flavia);
    expect(c).toBe("Flávia Machado: 4 aulas nas turmas que estão sendo geradas, mas só tem 1 horário(s) livre(s) (21 bloqueados na Disponibilidade, 8 com aula em outras turmas do turno).");
    expect(sugestaoParaCausa(c)).toBe("Libere 3 horários de Flávia Machado na Disponibilidade, ou passe aulas para outro professor. As aulas que já tem nas outras turmas do turno também ocupam horário.");
  });

  it("conta que nao bate com a do motor: a frase fica como veio", () => {
    const c = "Flávia Machado: 4 aulas no turno, mas só tem 1 horário(s) livre(s) (30 bloqueados).";
    expect(explicarBloqueiosNaCausa(c, flavia)).toBe(c);
    expect(explicarBloqueiosNaCausa("Turma 9MA: 26 aulas por semana, mas só tem 25 horários (5 por dia).", flavia)).toMatch(/^Turma 9MA/);
  });

  it("turmas que vao ate a 5a aula: conta so ate a 5a", () => {
    const ricardo = new Map([["Ricardo Melo", new Map([3, 4].flatMap((d) => [1, 2, 3, 4, 5, 6].map((a) => [`${d}-${a}`, "bloqueio"] as [string, OrigemBloqueio])))]]);
    const c = explicarBloqueiosNaCausa("Ricardo Melo: 16 aulas em turmas que vão até a 5ª aula, mas só tem 15 horário(s) livre(s) até a 5ª aula (10 bloqueados).", ricardo);
    expect(c).toBe("Ricardo Melo: 16 aulas em turmas que vão até a 5ª aula, mas só tem 15 horário(s) livre(s) até a 5ª aula (10 bloqueados na Disponibilidade).");
    expect(sugestaoParaCausa(c)).toBe("Libere 1 horário de Ricardo Melo até a 5ª aula na Disponibilidade, ou passe aulas para outro professor.");
  });
});
