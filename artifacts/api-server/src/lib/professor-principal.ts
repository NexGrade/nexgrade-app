// [MESMA-PESSOA-HA] (07/10/2026) Cadastros diferentes da MESMA pessoa.
//
// Quando um professor da duas disciplinas do mesmo trio, ele precisa de dois
// cadastros (ex.: "Jessica" e "Jessica (IFA)", como faz o Urania), senao o
// sistema acusa professor duplicado. O cadastro secundario aponta para o
// principal em `professores.professor_principal_id`.
//
// Para a hora-atividade, os dois contam como UMA pessoa: as aulas dos
// cadastros ligados sao somadas, a HA exigida sai da tabela oficial com o
// total e fica toda no cadastro principal. O secundario nao recebe HA.
//
// So vale ligacao de um nivel (secundario -> principal) dentro da mesma
// escola; principal que tambem aponta para outro e ignorado.

export interface ProfessorComPrincipal {
  id: number;
  professorPrincipalId?: number | null;
}

/** id de cada professor -> id do cadastro principal (o proprio id se nao for secundario). */
export function montarMapaPrincipal(professores: ProfessorComPrincipal[]): Map<number, number> {
  const ids = new Set(professores.map((p) => p.id));
  const apontaPara = new Map(professores.map((p) => [p.id, p.professorPrincipalId ?? null]));
  const mapa = new Map<number, number>();
  for (const p of professores) {
    const alvo = p.professorPrincipalId ?? null;
    const valido = alvo != null && alvo !== p.id && ids.has(alvo) && apontaPara.get(alvo) == null;
    mapa.set(p.id, valido ? alvo! : p.id);
  }
  return mapa;
}

/** true se o professor e cadastro secundario (a HA dele fica no principal). */
export function ehSecundario(mapa: Map<number, number>, professorId: number): boolean {
  const principal = mapa.get(professorId);
  return principal != null && principal !== professorId;
}

/** principal de um professor (ele mesmo quando nao esta ligado a ninguem). */
export function principalDe(mapa: Map<number, number>, professorId: number): number {
  return mapa.get(professorId) ?? professorId;
}
