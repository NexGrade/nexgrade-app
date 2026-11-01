import { describe, it, expect } from "vitest";
import { diagnosticarGeracao, diagnosticarViolacoesPromocao, sugestaoParaCausa } from "../diagnostico-geracao";

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
