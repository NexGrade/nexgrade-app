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

/**
 * Eixo Tecnológico — os 13 eixos do Catálogo Nacional de Cursos
 * Técnicos (CNCT, 4ª edição, MEC/Setec, Resolução CNE/CEB nº 2/2020),
 * usado pra classificar cursos de nível técnico (cursosTable.nivel =
 * "tecnico"). Não se aplica a fundamental/medio/normal_magisterio —
 * ver cursosTable.eixoTecnologico, nulo pra esses níveis.
 *
 * Fonte: MEC/Setec, cnct.mec.gov.br.
 */
export const eixoTecnologicoEnum = pgEnum("eixo_tecnologico", [
  "ambiente_saude",
  "controle_processos_industriais",
  "desenvolvimento_educacional_social",
  "gestao_negocios",
  "informacao_comunicacao",
  "infraestrutura",
  "militar",
  "producao_alimenticia",
  "producao_cultural_design",
  "producao_industrial",
  "recursos_naturais",
  "seguranca",
  "turismo_hospitalidade_lazer",
]);

/**
 * [NOVO] Forma de Oferta — distingue os dois formatos oficiais de curso
 * técnico da SEED-PR (Instruções Normativas Conjuntas 001/2026 e
 * 005/2026), que frequentemente compartilham o MESMO nome de curso mas
 * têm código, carga horária e estrutura curricular diferentes:
 *
 * integrada                     Técnico já embutido no currículo do
 *                                Ensino Médio, pacote único e contínuo
 *                                na mesma escola (IN 001/2026).
 * concomitante_intercomplementar Aluno já matriculado no Ensino Médio
 *                                regular (nesta ou noutra escola) cursa
 *                                o técnico em paralelo, como
 *                                complemento (IN 005/2026).
 *
 * Só se aplica a cursosTable.nivel = "tecnico" — nulo pros demais níveis.
 */
export const formaOfertaEnum = pgEnum("forma_oferta", [
  "integrada",
  "concomitante_intercomplementar",
]);
