// Sincroniza a grade OFICIAL de um turno com os dados extraídos do PDF
// real da escola (fonte de verdade). Pede confirmação antes de gravar.
//
// Como rodar:
//   cd C:\Projetos\nexgrade-app
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/sincronizar-grade.ts <turno> <caminho-do-json>
//
// Exemplos:
//   npx tsx scripts/sincronizar-grade.ts noturno scripts/aulas_noturno.json
//   npx tsx scripts/sincronizar-grade.ts matutino scripts/aulas_matutino.json
//   npx tsx scripts/sincronizar-grade.ts vespertino scripts/aulas_vespertino.json

import { db } from "@workspace/db";
import {
  turmasTable,
  disciplinasTable,
  professoresTable,
  horariosTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import * as readline from "readline";

const TURNO = process.argv[2];
const CAMINHO_JSON = process.argv[3];

if (!TURNO || !["matutino", "vespertino", "noturno"].includes(TURNO) || !CAMINHO_JSON) {
  console.error("Uso: npx tsx scripts/sincronizar-grade.ts <matutino|vespertino|noturno> <caminho-do-json>");
  process.exit(1);
}

// Dicionário sigla -> nome normalizado da disciplina (minusculo, sem
// acento/pontuação). Cobre Noturno (validado) + Matutino (mapeado em
// 2026-07-25, cruzando com a lista real de disciplinas do banco).
// Siglas sem tradução conhecida aparecem como "problema" no dry-run
// em vez de arriscar mapear errado -- ver ORGAN. e TECEMP abaixo.
const ABREV_PARA_NOME: Record<string, string> = {
  // ── comuns a vários turnos ──
  "MAT.": "matematica",
  "MAT": "matematica",
  "PORT": "lingua portuguesa e literatura",
  "L.POR": "lingua portuguesa e literatura",
  "GEO": "geografia",
  "BIO": "biologia",
  "QUIM": "quimica",
  "ART": "arte",
  "ARTE": "arte",
  "ED.FIS": "educacao fisica",
  "INGLES": "lingua estrangeira moderna - ingles",
  "L.ING": "lingua estrangeira moderna - ingles",
  "ED.FIN": "educacao financeira",
  "ED.DIG": "educacao digital",
  "HIB": "hibrida",
  "HIST": "historia",
  "FISIC": "fisica",
  "FIS": "fisica",
  "FILOS": "filosofia",
  "FIL.": "filosofia",
  "SOCIO": "sociologia",
  "SOC.": "sociologia",
  "VIDA": "projeto de vida",
  "MAT 2": "matematica 2",
  "BIO2": "biologia 2",
  "FIS2": "fisica 2",
  "FIS3": "fisica 3",
  "QUI1": "quimica 1",
  "R PORT": "recomposicao da aprendizagem - lingua portuguesa",
  "LRPORT": "leitura e recomposicao da aprendizagem - lingua portuguesa",
  "R MAT": "recomposicao da aprendizagem - matematica",
  "ART2": "arte 2",
  "GEO1": "geografia 1",
  "HIS1": "historia 1",
  "SOC1": "sociologia 1",
  "SOCIO1": "sociologia 1",
  "EMPRES": "informatica empresarial",
  "ECON.": "principios economicos",
  "FINAN.": "financas empresariais",
  "PR.ADM": "princ de administracao",
  "RH": "recursos humanos",
  "INTEG.": "tecnicas integradas",
  "CIEN": "ciencias (fundamental)",
  "ING1": "lingua inglesa 1",
  "INFAPL": "informatica aplicada",
  "ORGAN.": "lid org e ges de pessoas",
  "TECEMP": "in tec e empreendedorismo",

  // — Vespertino (variacoes sem ponto de siglas ja conhecidas + novas) —
  "EDFIS": "educacao fisica",
  "INGL": "lingua estrangeira moderna - ingles",
  "LPORT": "lingua portuguesa e literatura",
  "ENSREL": "ensino religioso",
  "RED": "redacao e leitura",

  // ── Paraná (padrão ".PR" -- confirmado no Matutino) ──
  "GEO.PR": "geografia do parana",
  "HIS.PR": "historia do parana",
  "ART.PR": "arte paranaense",

  // ── Técnico: Farmácia ──
  "FARM1": "farmacologia 1",
  "FARM2": "farmacologia 2",
  "FFARM": "fundamentos de farmacia",
  "FARHOS": "farmacia hospitalar",
  "DPFACO": "dis prod far e correlatos",
  "TOXI": "toxicologia",
  "SPUBL": "saude publica",
  "FFISIO": "fund da fisiopatologia",
  "BASBIO": "bases bio aplic a saude",
  "BSTRA": "biosseguranca e seg trab",

  // ── Técnico: Desenvolvimento de Sistemas ──
  "DADOS": "banco de dados",
  "DADOS1": "banco de dados 1",
  "DADOS2": "banco de dados 2",
  "BAEND": "programacao back end",
  "BAEND1": "programacao back end 1",
  "FRONT": "programacao front end",
  "MOBILE": "programacao mobile",
  "LOGCOM": "logica computacional",
  "INTCOM": "introducao a computacao",
  "INTPRO": "introducao a programacao",
  "APSIS": "analise proj de sistemas",
  "AMSIS": "analise e met p sistemas",
  "PROSIS": "prog no des de sistemas",
  "CDADOS": "ciencias de dados",
  "GRAFIC": "computacao grafica",

  // ── Técnico: Administração ──
  "AD.ORÇ": "adm financ e orcamentaria",
  "CONFIN": "controladoria e financas",
  "NEGOC.": "negociacao e vendas",
  "VENDAS": "comunicacao e vendas",
  "E.MARK": "estrategias de marketing", // ambiguo -- ver CANDIDATOS_AMBIGUOS
  "EMPREE": "empreendedorismo",
  "DIREIT": "nocoes de direito",
  "TECGES": "tecno e fer de gestao",

  // ── Meio ambiente ──
  "EDAMB": "educacao ambiental",
  "EDAMB1": "educacao ambiental 1",
  "GESRES": "gestao de residuos",
  "GRNAT": "gestao de rec naturais",
  "GRNAT1": "gestao de rec naturais 1",
  "RISAMB": "est de imp ris ambientais",
  "SGAMB": "sist de gestao ambiental",
  "ACQAM": "analise cont e quim amb",
  "ACQAM1": "analise cont e quim amb 1",

  // ── Fundamental / pedagógico ──
  "MATBAS": "mat bas p anos iniciais",
  "OTPED": "org do trab pedagogico",
  "TPEINF": "trab ped na ed infantil",
  "EDINDI": "ed inclusiva diversidade",
  "DHSOC": "des hum e socioemocional",
  "CIDSOC": "socgovcidad e sociedade",
  "LP.TEX": "lit e prod de texto",
  "REDLEI": "redacao e leitura",
  "REDTEC": "redacao tecnica",
  "MCCOM": "met cient e comunicacao",
  "TEXFIL": "filtextos filosoficos",
};

// Siglas ambíguas (mais de uma disciplina parecida no banco).
// Resolvidas escolhendo a candidata com codigoSae preenchido; se
// nenhuma tiver, usa a primeira da lista (melhor palpite).
const CANDIDATOS_AMBIGUOS: Record<string, string[]> = {
  "E.MARK": ["estrategias de marketing", "estrategia de marketing"],
  "G.PES.": ["lid org e ges de pessoas", "lid e gestao de pessoas"],
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

// [NOVO] Retry automático pra ECONNRESET -- constatado em 2026-07-31
// que o Session Pooler (ou a rede local) às vezes derruba alguma das
// conexões abertas em paralelo pelo Promise.all inicial (professores,
// horarios, etc.), sem relação com senha/credencial -- a query chega
// a rodar e autenticar, só cai no meio da leitura. 3 tentativas com
// pequeno intervalo cobre esse tipo de instabilidade pontual sem
// precisar o usuário rodar o comando de novo manualmente.
async function comRetry<T>(fn: () => Promise<T>, tentativas = 3, descricao = "consulta"): Promise<T> {
  let ultimoErro: unknown;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      const isConnReset = err instanceof Error && (
        err.message.includes("ECONNRESET") || (err.cause instanceof Error && err.cause.message.includes("ECONNRESET"))
      );
      if (!isConnReset || i === tentativas) throw err;
      console.log(`  [retry ${i}/${tentativas - 1}] Conexão caiu em "${descricao}" (ECONNRESET) -- tentando de novo em 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw ultimoErro;
}

function resolverDisciplinaAmbigua(
  abrev: string,
  disciplinaPorNomeNorm: Map<string, { id: number; nome: string; codigoSae: string | null }>,
) {
  const nomesCandidatos = CANDIDATOS_AMBIGUOS[abrev];
  if (!nomesCandidatos) return undefined;
  const candidatas = nomesCandidatos
    .map((n) => disciplinaPorNomeNorm.get(normalizar(n)))
    .filter((d): d is NonNullable<typeof d> => d != null);
  if (candidatas.length === 0) return undefined;
  const comSae = candidatas.find((d) => d.codigoSae);
  return comSae ?? candidatas[0];
}

async function main() {
  // [FIX] Trocado de "escola_default" (valor legado, pré-migração
  // multi-tenant) para o Org ID real da escola piloto (C.E. Prof.
  // Mário B.T. Braga) no Clerk. Constatado em 2026-07-31 que o valor
  // antigo não bate mais com nenhuma linha em turmasTable desde a
  // migração para Clerk Organizations (ver comentário sobre
  // getEscolaId()/orgId no histórico do projeto) -- o script rodava
  // sem erro, mas a busca de turmas sempre voltava vazia, fazendo
  // TODAS as aulas do JSON serem reportadas como "Turma não
  // encontrada", mesmo sendo turmas reais e existentes no banco.
  const escolaId = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
  const AULAS_EXTRAIDAS: Array<{
    professor: string; dia: number; diaLabel: string; numeroAula: number;
    hora: string; turmaCodigo: string; disciplinaAbrev: string;
  }> = JSON.parse(readFileSync(CAMINHO_JSON, "utf-8"));

  // [FIX] Trocado de Promise.all (4 conexões simultâneas) para
  // sequencial -- constatado em 2026-07-31 que a rede local da Simone
  // (provável antivírus/firewall/VPN) reseta alguma das conexões TCP
  // abertas em paralelo pro pooler do Supabase, sempre numa query
  // diferente a cada tentativa. Rodando uma de cada vez (uma única
  // conexão do pool em uso por vez) elimina a concorrência como causa,
  // ao custo de ser um pouco mais lento -- aceitável pra um script que
  // roda manualmente, não em produção.
  const turmasDoTurno = await comRetry(() => db.select().from(turmasTable).where(and(eq(turmasTable.turno, TURNO), eq(turmasTable.escolaId, escolaId))), 3, "turmas");
  const disciplinas = await comRetry(() => db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)), 3, "disciplinas");
  const professores = await comRetry(() => db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)), 3, "professores");
  const horariosAtuais = await comRetry(() => db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)), 3, "horarios");

  const turmaPorNome = new Map(turmasDoTurno.map((t) => [normalizar(t.nome), t]));
  const disciplinaPorNomeNorm = new Map(disciplinas.map((d) => [normalizar(d.nome), d]));
  const professorPorNomeCompleto = new Map(professores.map((p) => [normalizar(p.nome), p]));
  const professorPorPrimeiroNome = new Map<string, typeof professores>();
  for (const p of professores) {
    const primeiro = normalizar(p.nome).split(" ")[0];
    if (!professorPorPrimeiroNome.has(primeiro)) professorPorPrimeiroNome.set(primeiro, []);
    professorPorPrimeiroNome.get(primeiro)!.push(p);
  }

  const turmaIdsDoTurno = new Set(turmasDoTurno.map((t) => t.id));
  const horariosAtuaisDoTurno = horariosAtuais.filter((h) => turmaIdsDoTurno.has(h.turmaId));

  type LinhaResolvida = {
    turmaId: number; disciplinaId: number; professorId: number;
    diaSemana: number; numeroAula: number;
    turmaNome: string; disciplinaNome: string; professorNome: string;
  };
  const resolvidas: LinhaResolvida[] = [];
  const problemas: string[] = [];

  for (const item of AULAS_EXTRAIDAS) {
    const turma = turmaPorNome.get(normalizar(item.turmaCodigo));
    if (!turma) { problemas.push(`Turma "${item.turmaCodigo}" nao encontrada no turno ${TURNO}`); continue; }

    let disc: typeof disciplinas[number] | undefined;
    if (item.disciplinaAbrev === "E.MARK" && normalizar(item.turmaCodigo) === normalizar("2MA ADM")) {
      disc = disciplinaPorNomeNorm.get(normalizar("Estratégia de Marketing"));
    } else if (CANDIDATOS_AMBIGUOS[item.disciplinaAbrev]) {
      disc = resolverDisciplinaAmbigua(item.disciplinaAbrev, disciplinaPorNomeNorm);
    } else {
      const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
      disc = nomeBusca ? disciplinaPorNomeNorm.get(normalizar(nomeBusca)) : undefined;
    }
    if (!disc) { problemas.push(`Disciplina "${item.disciplinaAbrev}" sem mapeamento ou nao encontrada`); continue; }

    const nomeProfNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeProfNorm);
    if (!prof) {
      const mHibrida = item.professor.match(/^HIBRIDA-(.+)$/i);
      if (mHibrida) {
        const alvo = normalizar(`Hibrida (${mHibrida[1]})`);
        prof = professores.find((p) => normalizar(p.nome) === alvo);
      }
    }
    if (!prof) {
      const candidatos = professorPorPrimeiroNome.get(nomeProfNorm.split(" ")[0]) ?? [];
      if (candidatos.length === 1) prof = candidatos[0];
      else if (candidatos.length > 1) {
        problemas.push(`Professor "${item.professor}" ambiguo: ${candidatos.map((c) => c.nome).join(", ")}`);
        continue;
      }
    }
    if (!prof) { problemas.push(`Professor "${item.professor}" nao encontrado`); continue; }

    resolvidas.push({
      turmaId: turma.id, disciplinaId: disc.id, professorId: prof.id,
      diaSemana: item.dia, numeroAula: item.numeroAula,
      turmaNome: turma.nome, disciplinaNome: disc.nome, professorNome: prof.nome,
    });
  }

  console.log("=".repeat(70));
  console.log(`SINCRONIZAÇÃO -- Grade oficial ${TURNO.toUpperCase()}`);
  console.log("=".repeat(70));
  console.log(`Total extraído: ${AULAS_EXTRAIDAS.length} | Resolvido: ${resolvidas.length} | Problemas: ${problemas.length}`);

  if (problemas.length > 0) {
    const agrupados = new Map<string, number>();
    for (const p of problemas) agrupados.set(p, (agrupados.get(p) ?? 0) + 1);
    console.log("\nPROBLEMAS (nada relacionado seria importado):");
    for (const [motivo, qtd] of agrupados) console.log(`  [${qtd}x] ${motivo}`);
    console.log("\nABORTADO. Ajuste o dicionário ABREV_PARA_NOME ou os dados e rode de novo.");
    process.exit(1);
  }

  // [FIX] A chave usada pra identificar cada "aula" precisa incluir o
  // professorId -- não só turma+dia+numeroAula. Sem isso, casos de
  // co-docencia (recomposicao em dupla: titular + apoio dando a MESMA
  // aula, mesmo dia/horario) tinham a segunda linha silenciosamente
  // sobrescrita pela primeira ao entrar num Map (Map nao aceita
  // chaves duplicadas) -- a aula do segundo professor simplesmente
  // desaparecia do resultado final, sem nenhum aviso. Constatado em
  // 2026-07-31 comparando aulas_matutino.json/aulas_vespertino.json
  // contra o PDF real: toda disciplina de recomposicao em dupla tem
  // duas entradas no JSON pro mesmo turma+dia+aula, uma por professor.
  //
  // Efeito colateral corrigido de bonus: `atuaisMap` (comparação com o
  // que já está gravado em horariosTable) tinha o MESMO problema --
  // se já existissem duas linhas no banco pro mesmo slot (dois
  // professores), a chave antiga também colapsava as duas em uma só
  // na hora de montar o Map, o que podia mascarar remoções/alterações
  // indevidas nesses casos.
  const chave = (h: { turmaId: number; diaSemana: number; numeroAula: number; professorId: number }) =>
    `${h.turmaId}-${h.diaSemana}-${h.numeroAula}-${h.professorId}`;
  const atuaisMap = new Map(horariosAtuaisDoTurno.map((h) => [chave(h), h]));
  const novasMap = new Map(resolvidas.map((r) => [chave(r), r]));

  const paraInserir: LinhaResolvida[] = [];
  const paraAtualizar: Array<{ id: number; nova: LinhaResolvida }> = [];
  const paraRemoverIds: number[] = [];

  for (const [k, nova] of novasMap) {
    const atual = atuaisMap.get(k);
    if (!atual) paraInserir.push(nova);
    else if (atual.disciplinaId !== nova.disciplinaId) {
      // professorId já faz parte da chave, então só disciplinaId pode
      // divergir aqui pra uma linha que "bate" no mesmo slot+professor.
      paraAtualizar.push({ id: atual.id, nova });
    }
  }
  for (const [k, atual] of atuaisMap) {
    if (!novasMap.has(k)) paraRemoverIds.push(atual.id);
  }

  // [NOVO] Aviso específico pra duplas de co-docência que aparecem no
  // JSON mas ainda não estavam confirmadas em nenhum lugar do sistema
  // (ver scripts/src/seed.ts -- lista das 6 duplas originais). Não
  // bloqueia a sincronização, só chama atenção pra revisar com a
  // coordenação antes de confirmar.
  const DUPLAS_CONFIRMADAS = new Set([
    "lisiane|pedro", "cecilia|ivanir", "ivanir|silmara",
    "juliana|julio", "julio|matheus", "gilberto|lisiane",
    // Confirmadas com a Simone em 2026-07-31, junto com o fix da
    // chave de dedup (co-docência de recomposição da aprendizagem).
    "andre|lisiane", "andre|pedro",
  ]);
  const grupoPorSlot = new Map<string, LinhaResolvida[]>();
  for (const r of resolvidas) {
    const slotKey = `${r.turmaId}-${r.diaSemana}-${r.numeroAula}`;
    if (!grupoPorSlot.has(slotKey)) grupoPorSlot.set(slotKey, []);
    grupoPorSlot.get(slotKey)!.push(r);
  }
  const duplasNaoConfirmadas: string[] = [];
  for (const linhas of grupoPorSlot.values()) {
    if (linhas.length < 2) continue;
    const nomes = linhas.map((l) => normalizar(l.professorNome).split(" ")[0]).sort();
    const chaveDupla = nomes.join("|");
    if (!DUPLAS_CONFIRMADAS.has(chaveDupla)) {
      const desc = `${linhas[0].turmaNome} | ${["Seg", "Ter", "Qua", "Qui", "Sex"][linhas[0].diaSemana]} aula ${linhas[0].numeroAula} | ${linhas.map((l) => l.professorNome).join(" + ")} (${linhas[0].disciplinaNome})`;
      if (!duplasNaoConfirmadas.includes(desc)) duplasNaoConfirmadas.push(desc);
    }
  }
  if (duplasNaoConfirmadas.length > 0) {
    console.log("\n⚠ DUPLAS DE CO-DOCÊNCIA NÃO CONFIRMADAS (revisar com a coordenação antes de aplicar):");
    for (const d of duplasNaoConfirmadas) console.log(`  ? ${d}`);
  }

  console.log(`\nInserções: ${paraInserir.length} | Atualizações: ${paraAtualizar.length} | Remoções: ${paraRemoverIds.length}`);
  console.log(`Sem mudança: ${resolvidas.length - paraInserir.length - paraAtualizar.length}`);

  if (paraInserir.length === 0 && paraAtualizar.length === 0 && paraRemoverIds.length === 0) {
    console.log("\nNada a fazer -- grade já está sincronizada.");
    process.exit(0);
  }

  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  if (paraInserir.length > 0) {
    console.log("\nInserções:");
    for (const i of paraInserir) console.log(`  + ${i.turmaNome} | ${DIAS[i.diaSemana]} aula ${i.numeroAula} | ${i.disciplinaNome} | ${i.professorNome}`);
  }
  if (paraAtualizar.length > 0) {
    console.log("\nAtualizações:");
    for (const a of paraAtualizar) console.log(`  ~ ${a.nova.turmaNome} | ${DIAS[a.nova.diaSemana]} aula ${a.nova.numeroAula} -> ${a.nova.disciplinaNome} / ${a.nova.professorNome}`);
  }
  if (paraRemoverIds.length > 0) {
    console.log("\nRemoções:");
    for (const id of paraRemoverIds) {
      const h = horariosAtuaisDoTurno.find((x) => x.id === id)!;
      console.log(`  - id ${id} (turmaId ${h.turmaId}, dia ${h.diaSemana}, aula ${h.numeroAula})`);
    }
  }

  const resp = await perguntar("\nAplicar essas mudanças na grade OFICIAL agora? (digite 'sim' para confirmar) ");
  if (normalizar(resp) !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (paraInserir.length > 0) {
      await tx.insert(horariosTable).values(
        paraInserir.map((i) => ({
          escolaId, turmaId: i.turmaId, disciplinaId: i.disciplinaId, professorId: i.professorId,
          diaSemana: i.diaSemana, numeroAula: i.numeroAula,
        })),
      );
    }
    for (const a of paraAtualizar) {
      await tx.update(horariosTable)
        .set({ disciplinaId: a.nova.disciplinaId, professorId: a.nova.professorId })
        .where(eq(horariosTable.id, a.id));
    }
    if (paraRemoverIds.length > 0) {
      await tx.delete(horariosTable).where(inArray(horariosTable.id, paraRemoverIds));
    }
  });

  console.log(`\nPronto! Grade oficial do ${TURNO} sincronizada.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
