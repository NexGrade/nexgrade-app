// [RCO-TURMAS-SCRIPT] (26/10/2026) Quais turmas do RCO precisam do SCRIPT de gravacao (o XML nao
// da conta): (1) mais de uma disciplina no mesmo horario (trio/dupla do IFA) -- no arquivo o RCO
// guarda so a ultima; (2) duas disciplinas diferentes com o MESMO Codigo Externo na turma (ex.:
// Pratica de Formacao Turma 01 e Turma 02, codigo 1269) -- o arquivo nao separa. As outras turmas
// podem ir pelo XML. Ordem: XML primeiro, script depois (o XML regrava a turma inteira).
export type RegistroParaAnalise = {
  codTurma: number | string | null; turmaRco: string; diaSemana: number; hora: string; coddisc: number; disciplinaNome: string;
};
export type TurmaQuePrecisaDoScript = { codTurma: string; turma: string; motivos: string[] };

const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function turmasQuePrecisamDoScript(registros: RegistroParaAnalise[]): TurmaQuePrecisaDoScript[] {
  const porTurma = new Map<string, RegistroParaAnalise[]>();
  for (const r of registros) {
    if (r.codTurma == null) continue;
    const k = String(r.codTurma);
    if (!porTurma.has(k)) porTurma.set(k, []);
    porTurma.get(k)!.push(r);
  }
  const out: TurmaQuePrecisaDoScript[] = [];
  for (const [codTurma, regs] of porTurma) {
    const motivos: string[] = [];
    const celulas = new Map<string, Set<number>>();
    for (const r of regs) {
      const k = `${r.diaSemana}|${r.hora}`;
      if (!celulas.has(k)) celulas.set(k, new Set());
      celulas.get(k)!.add(r.coddisc);
    }
    const multiplas = [...celulas.entries()].filter(([, cods]) => cods.size > 1)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, cods]) => { const [d, h] = k.split("|"); return `${DIA[Number(d)] ?? d} ${h} (${cods.size} disciplinas)`; });
    if (multiplas.length) motivos.push(`trio/dupla: ${multiplas.join(", ")}`);
    const nomesPorCodigo = new Map<number, Set<string>>();
    for (const r of regs) {
      if (!nomesPorCodigo.has(r.coddisc)) nomesPorCodigo.set(r.coddisc, new Set());
      nomesPorCodigo.get(r.coddisc)!.add(r.disciplinaNome);
    }
    for (const [cod, nomes] of nomesPorCodigo) {
      if (nomes.size > 1) motivos.push(`mesmo código ${cod}: ${[...nomes].sort().join(" / ")}`);
    }
    if (motivos.length) out.push({ codTurma, turma: regs[0]!.turmaRco, motivos });
  }
  return out.sort((a, b) => a.turma.localeCompare(b.turma, "pt-BR"));
}
