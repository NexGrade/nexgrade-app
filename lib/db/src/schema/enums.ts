import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Composição Curricular — enum fechado com as siglas oficiais do SERE-PR,
 * confirmado via CODIGOS_SEED.pdf e validado contra cenários reais em
 * todos os níveis de ensino.
 *
 * [ATUALIZADO] Adicionado "IF" (sem sufixo). A seção 2.2 de
 * docs/analise-formatos-uranin-sere.md identificou que cursos "ENSINO
 * MEDIO IF..." usam a etiqueta "IF" sozinha para categorias equivalentes
 * a "IFA" em outros cursos — ainda não confirmado oficialmente com a
 * SEED-PR se são a mesma coisa ou categorias distintas (ver item
 * CONFIRMAR correspondente no plano de implementação). Por segurança,
 * mantemos os dois valores até essa confirmação.
 *
 * BNC  Base Nacional Comum                     (Ensino Fundamental, 6º-9º ano)
 * PD   Parte Diversificada                      (Ensino Fundamental)
 * FGB  Formação Geral Básica                    (Ensino Médio Regular)
 * PFO  Percurso Formativo Obrigatório            (Projeto de Vida, Ed. Financeira)
 * IFA  Itinerário Formativo de Aprofundamento    (disciplinas propedêuticas do Médio)
 * IF   Itinerário Formativo (variante genérica — ver nota acima)
 * IFP  Itinerário Formativo Profissional         (teóricas de Técnicos/Magistério)
 * APF  Aprofundamento Profissional               (práticas, laboratórios, estágios)
 */
export const composicaoCurricularEnum = pgEnum("composicao_curricular", [
  "BNC",
  "PD",
  "FGB",
  "PFO",
  "IFA",
  "IF",
  "IFP",
  "APF",
]);
