// [RESERVAS-TOPICOS] formatacao curta das reservas (calendario do professor e card "Reservas da semana")
export const NOME_TURNO: Record<string, string> = { matutino: "manhã", vespertino: "tarde", noturno: "noite" };
export const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "Laboratório de Informática - 01 Bloco 1" -> "Lab. Informática · 01 Bloco 1"; "Tablets (10)" -> "Tablets · 10 un." */
export const abreviarSala = (nome: string) =>
  nome
    .replace(/^Laborat[óo]rio\s+(de\s+|da\s+|do\s+)?/i, "Lab. ")
    .replace(/\s+-\s+/g, " · ")
    .replace(/\s*\((\d+)\)$/, " · $1 un.")
    .replace(/\s{2,}/g, " ");

/** "Simone Vitoriano de Barros" -> "Simone Barros" */
export const abreviarNome = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : nome.trim();
};

/** o espaco antigo "Tablets" (exclusivo por aula): os tablets agora vao por quantidade */
export const ehSalaTablets = (nome: string) => /^tablets?$/i.test(nome.trim());

/** [1, 2] -> "1ª, 2ª aulas" */
export const rotuloAulas = (aulas: number[]) => `${aulas.map((n) => `${n}ª`).join(", ")} aula${aulas.length > 1 ? "s" : ""}`;
