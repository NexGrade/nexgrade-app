/**
 * gerar-xml-sere.cjs
 * MODELO -- gera o arquivo IMPORT_URANIA.XML (formato de exportacao do
 * Urania, o mesmo que o RCO importa direto) a partir dos dados reais do
 * NexGrade (turma_disciplinas + horarios + professores + disciplinas).
 *
 * Estrutura do XML confirmada contra 2 exportacoes reais (E.E. Romario
 * Martins, manha e tarde, 770 registros no total):
 *   <IMPORT_URANIA><CODESCOLA>...</CODESCOLA><HORARIO>
 *     <REGISTRO>
 *       <CODTURMA>..</CODTURMA><TIPOTURMA>..</TIPOTURMA><DIA>..</DIA>
 *       <HOR>..</HOR><HORA_INICIO>..</HORA_INICIO><HORA_FIM>..</HORA_FIM>
 *       <CODPROF>..</CODPROF><CODDISC>..</CODDISC>
 *       [<TIPODISC>Trilha Aprofundamento</TIPODISC>]  -- OPCIONAL, so
 *       quando o componente e uma trilha de aprofundamento do Novo
 *       Ensino Medio (itinerario formativo). Ordem dos campos importa.
 *     </REGISTRO>
 *   </HORARIO></IMPORT_URANIA>
 *
 * IMPORTANTE -- leia antes de rodar em producao:
 * 1. So mapeia disciplinas cujo nome bate com o DICIONARIO_CODDISC_
 *    NUCLEO_COMUM abaixo (confirmado via cruzamento com dados reais do
 *    E.E. Romario Martins) OU que ja tem codigo_sae valido no banco
 *    (tecnico/EPT, validado contra os documentos oficiais da SEED em
 *    03/09/2026). Qualquer disciplina que nao bater nenhum dos dois gera
 *    aviso e NAO entra no XML -- nunca chuta um codigo.
 * 2. CODPROF e CODTURMA sao atribuidos AQUI, sequencialmente por
 *    exportacao -- confirmamos que o Urania NAO usa um ID fixo por
 *    pessoa/turma entre exportacoes diferentes (o mesmo professor pode
 *    ter numeros diferentes no export da manha e da tarde).
 * 3. TIPOTURMA e configuravel por escola (campo tipoTurmaPadrao) --
 *    confirmamos que e constante (=1) nos 770 registros do Romario
 *    Martins, cobrindo Fundamental E Medio/Tecnico/trilhas, mas pode
 *    variar em outra escola/config do Urania. Nao assuma 1 sem checar.
 * 4. TIPODISC so e emitido pra componentes marcados como trilha de
 *    aprofundamento em NOMES_TRILHA_APROFUNDAMENTO abaixo -- lista por
 *    NOME porque o banco ainda nao tem uma coluna dedicada pra isso
 *    (tipo_componente ou similar). Recomendado adicionar essa coluna em
 *    disciplinas quando o Mario Braga confirmar quais componentes do
 *    Novo Ensino Medio sao trilha (ver TODO no fim do arquivo).
 * 5. Horarios de inicio/fim de cada aula vem de horario_slots (nao mais
 *    fixo) -- funciona pra qualquer turno/escola que tenha essa tabela
 *    preenchida corretamente.
 *
 * [XML-CODIGOS-DO-BANCO] (06/10/2026) Os codigos agora vem do BANCO:
 *   - CODDISC  = disciplinas.codigo_externo_rco; se vazio, codigos_rco_disciplina
 *                pelo codigo_sae; se ainda vazio, o mapa antigo (so Romario noturno).
 *   - CODTURMA = turmas.codigo_sere (parte FGB / formacao geral) e
 *                turmas.codigo_sere_if (parte IF), quando a turma tem dois codigos.
 *   - Divisao FGB x IF e conferencia: dados-rco/grades-seed.json (grade SEED de
 *     cada turma, pelo codigo SERE). Disciplina fora da grade SEED da turma gera
 *     aviso -- e o erro mais comum do RCO segundo a GEHA.
 *   - So entram aulas da grade oficial (versao_grade = 'oficial').
 *
 * Uso:
 *   node gerar-xml-sere.cjs --escola=mario-braga --turno=matutino [--aplicar]
 *   (sem --aplicar: so mostra o relatorio de disciplinas sem mapeamento --
 *    nao escreve arquivo. Assim como os outros scripts do projeto.)
 *
 * Para cadastrar uma escola nova: adicionar uma entrada em ESCOLAS
 * abaixo (escolaId do NexGrade + codescola oficial INEP/SERE +
 * tipoTurmaPadrao, geralmente 1 mas confirmar se possivel).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// ============ CADASTRO DE ESCOLAS ============
// Adicionar uma entrada aqui pra cada escola nova. Todos os campos sao
// obrigatorios pra gerar de verdade (--aplicar); sem eles o script erra
// de proposito em vez de gerar algo errado.
const ESCOLAS = {
  "mario-braga": {
    escolaId: "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
    // Codigo INEP oficial (confirmado na tela "Dados da Escola" do
    // NexGrade em 03/09/2026).
    codescola: "41136225",
    // Confirmado constante =1 no Romario Martins (Fundamental E
    // Medio/Tecnico/trilhas, 770 registros). Ate confirmar o XML real
    // do Mario Braga, assumimos o mesmo valor.
    tipoTurmaPadrao: 1,
  },
  arlinda: {
    escolaId: "org_3HCLFry0r48pfutN7ChZIip3IWL",
    // INEP conhecido (memoria do projeto) -- confirmar se e o mesmo
    // numero que o SERE/RCO espera em CODESCOLA antes de usar.
    codescola: "41136306",
    tipoTurmaPadrao: 1,
  },
  romario: {
    // C.E. Romario Martins -- INEP informado pela Simone em 05/10/2026.
    escolaId: "org_3JxLX0hl4xYxiHbrUIIabRHaAO9",
    codescola: "41136233",
    // =1 confirmado nos 770 registros das exportacoes reais desta escola.
    tipoTurmaPadrao: 1,
    // [XML-TURMA-FGB-IF] no RCO o 3o ano (matriz antiga) e DUAS turmas: "FGB" e "IF".
    // Disciplina com categoria FGB na matriz vai p/ a turma FGB; as demais p/ a IF.
    dividirFgbIf: ["3A-HUM", "3B-HUM", "3C-EXATAS"],
    // [XML-CODTURMA-SERE] CODTURMA = codigo da turma no SERE (buscarTurma) -- o RCO
    // recusa numero sequencial (NullPointerException). Lido do SERE em 05/10/2026.
    codTurmaRco: {
      "1NA": 2640495, // ENSINO MEDIO IFA LGG/CHS 1a serie Noite A
      "1NB": 2675533, // ENSINO MEDIO IFA MAT/CNT 1a serie Noite B
      "2NA-HUM": 2640477, // ENSINO MEDIO IFA LGG/CHS 2a serie Noite A
      "2M.AMB": 2639831, // TEC EM MEIO AMBIENTE - ET AS 2a serie Noite F
      "3A-HUM (FGB)": 2640584, "3A-HUM (IF)": 2640583, // FGB / IF LGG/CHS L INGL 3a Noite A
      "3B-HUM (FGB)": 2640596, "3B-HUM (IF)": 2640595, // FGB / IF LGG/CHS L INGL 3a Noite B
      "3C-EXATAS (FGB)": 2696009, "3C-EXATAS (IF)": 2696008, // FGB / IF MAT/CNT 3a Noite C
    },
    // [XML-CODDISC-NO-MATRIZ] CODDISC = "No" da disciplina na matriz da turma no SERE
    // (Consultar Matriz Curricular), NAO o codigo SAE. Mapa por turma: SAE -> No.
    // Lido das telas do SERE em 05/10/2026. Turma sem mapa fica fora do XML.
    coddiscSere: true, // [XML-CODDISC-SERE] ver CODDISC_SERE_LEGADO (substitui o mapa por No de matriz abaixo)
    codDiscRco: (() => {
      const m200s1 = { 704: 1, 601: 2, 1347: 3, 106: 4, 401: 6, 201: 9, 299: 10, 6507: 11, 6254: 11, 801: 13, 1001: 14, 508: 15, 403: 16, 780: 17 };
      const m201s1 = { 704: 1, 601: 2, 1347: 3, 106: 4, 401: 6, 201: 9, 299: 10, 6507: 11, 6254: 11, 801: 13, 1001: 14, 6559: 15, 6561: 16, 6560: 17 };
      const m200s2 = { 704: 1, 601: 2, 1347: 3, 106: 4, 2201: 5, 501: 7, 2301: 8, 201: 9, 299: 10, 901: 12, 6572: 18, 6551: 19, 6552: 20 };
      const m51s3 = { 601: 2, 106: 4, 201: 9, 901: 10 };
      const m2343s3 = { 594: 1, 299: 2, 6210: 4, 6211: 5, 215: 9, 1002: 10, 1194: 11, 903: 12, 3444: 13 };
      const m2539s2 = { 106: 1, 601: 3, 1347: 4, 201: 5, 299: 6, 901: 9, 501: 12, 2301: 13, 2201: 14, 6622: 16, 1519: 17, 6620: 20, 6623: 22, 1928: 23, 871: 26, 6713: 27 };
      return {
        "1NA": m200s1, "1NB": m201s1, "2NA-HUM": m200s2, "2M.AMB": m2539s2,
        "3A-HUM (FGB)": m51s3, "3B-HUM (FGB)": m51s3, "3C-EXATAS (FGB)": m51s3, "3C-EXATAS (IF)": m2343s3,
        // "3A-HUM (IF)" e "3B-HUM (IF)": matriz do curso 2341 ainda nao lida
      };
    })(),
  },
};

// [DESCOBERTA 03/09] O codigo_sae que ja existe no banco (tabela
// disciplinas) e o codigo SAE REAL para disciplinas TECNICAS/EPT --
// validado cruzando contra os documentos oficiais da SEED (Instrucoes
// Normativas 001/2026 e 005/2026): 48/61 disciplinas do Mario Braga e
// 14/27 da Arlinda bateram nome por nome. Esse script usa codigo_sae
// diretamente para essas.
//
// Para o NUCLEO COMUM (Portugues, Matematica, Geografia etc.), o
// codigo_sae que esta no banco (101, 201, 701...) parece ser um
// PLACEHOLDER inventado -- nao bate com nenhum documento oficial nem
// com os codigos reais confirmados via E.E. Romario Martins. Por isso,
// pro nucleo comum usamos este dicionario por NOME em vez do
// codigo_sae do banco.
// [CORRIGIDO 03/09 tarde -- ERRO GRAVE ENCONTRADO E CORRIGIDO] Os
// numeros pequenos que estavam aqui antes (1, 2, 3, 4, 6, 9, 21...)
// NAO sao Codigo SAE -- sao um sistema INTERNO do Urania, usado so no
// arquivo de exportacao de horario do Romario Martins, diferente do
// Codigo SAE oficial de verdade (confirmado no portal SERE, que e
// PADRAO/universal entre todas as escolas). O codigo_sae que ja existe
// no banco (coluna disciplinas.codigo_sae) foi corrigido pra ter o
// Codigo SAE real (201, 106, 401, 501, 601, 801, 704, 901...) -- esse
// dicionario fixo NAO E MAIS NECESSARIO pro nucleo comum basico, ja
// que resolverCoddisc() cai automaticamente pro codigo_sae do banco
// quando a disciplina nao esta neste dicionario. So fica aqui o que
// ainda nao foi confirmado como Codigo SAE oficial (Ensino Religioso,
// Educacao Ambiental) ate serem checados no portal SERE tambem.
// [XML-CODDISC-SERE] SAE -> codigo SERE (so onde diferem). Fonte: XML do Urania aceito pelo RCO.
// Atualizado 06/10: "Disciplinas cadastradas / Codigo Externo" do Urania da NOITE (Romario).
// Chave = SAE (como esta no NexGrade); valor = Codigo Externo que o RCO aceita.
const CODDISC_SERE_LEGADO = {
  106: 1, 201: 2, 401: 3, 501: 4, 601: 6, 704: 21, // LP, MAT, GEO, HIST, ED FIS, ARTE
  1001: 11, 901: 10, 801: 9, 2201: 27, 2301: 29, // BIOLOGIA, FISICA, QUIMICA, FILOSOFIA, SOCIOLOGIA
  1347: 3798, 1394: 3826, 299: 3482, 6507: 6254, 6254: 6254, 594: 3780, 6211: 6039, 6210: 6038, // LI, ESP, ED FIN, ED DIG, PROJ VIDA, REC MAT, REC LP
  6551: 6318, 6552: 6319, 6572: 2997, // trio 2NA-HUM: FILOSOFIA ANALISE TEXTOS, SOCIOLOGIA GOV CID, LITERATURA E PRODUCAO
  780: 22, 403: 36, 508: 37, // trio 1NA: ARTE PARANAENSE, GEOGRAFIA DO PARANA, HISTORIA DO PARANA
  6561: 6325, 6559: 6323, 6560: 6324, // trio 1NB: BIOLOGIA SUSTENT, MATEMATICA RESOL, QUIMICA E TECNOCIENCIA
  732: 1909, 2385: 3807, 2384: 3811, 2390: 4052, 3865: 3808, // grade 2025: ARTE II, GEO I, HIST I, SOCIOLOGIA I, LI I
  1002: 136, 903: 129, 3444: 4641, 215: 81, 1194: 211, // grade 2025: BIOLOGIA II, FISICA II, FISICA III, MAT II, QUIMICA I
  6620: 6352, 6623: 6354, 1928: 1354, 6713: 1054, 6622: 6353, 871: 1300, 1519: 802, // tecnico Meio Ambiente
};

const DICIONARIO_CODDISC_NUCLEO_COMUM = {
  "Ensino Religioso": 33,
  "Educação Ambiental": 89,
  // [ADICIONADO 03/09 -- validado por match exato/quase-exato contra os
  // documentos oficiais 001/2026 e 005/2026, ou ja confirmado na Arlinda
  // com o mesmo codigo_sae]
  "Liderança Organizacional e Gestão de Pessoas": 5034,
  "Recursos Humanos": 4450,
  "Finanças Empresariais": 5033,
  "Comunicação e Vendas": 5020,
  "Técnicas Integradas": 6509,
  "Informática Empresarial": 5015,
  "Princípios Econômicos": 5031,
  "Gestão de Resíduos": 1928,
  "Banco de Dados I": 5400,
  "Farmacologia I": 5513,
  "Banco de Dados II": 5600,
  "Lógica Computacional": 1348,
  "Empreendedorismo": 2334,
  "Redação Técnica": 126,
  "Informática Aplicada": 4420,
  "Farmacologia II": 5514,
  "Toxicologia": 3511,
  "Ciências de Dados": 4763,
  "Programação Mobile": 4491,
  "Saúde Pública": 3228,
  "Farmácia Hospitalar": 5319,
  "Biossegurança e Seg Trab": 4290,
  "Educação Ambiental I": 6622,
  // [ADICIONADO 03/09 tarde -- confirmado pelo XML REAL do Urania do
  // Mario Braga, a fonte mais confiavel que existe. O conflito antigo
  // do 3798 pra Ingles esta resolvido: o codigo certo de Lingua
  // Inglesa e 1347, nao 3798 (que era mesmo de outra coisa).]
  "Língua Inglesa": 1347,
  "Física": 901,
  "Biologia": 1001,
  "Filosofia": 2201,
  "Sociologia": 2301,
  "Rec. Aprend. Matemática": 6211,
  "Rec. Aprend. L. Port": 6210,
  "Redação e Leitura": 367,
  "Educação Financeira": 299,
  "Prog no Des de Sistemas": 4762,
  "In Tec e Empreendedorismo": 5999,
  "Língua Inglesa I": 3865,
  "Análise Proj de Sistemas": 4759,
  "História do Paraná": 508,
  "Geografia do Paraná": 403,
  "Arte Paranaense": 780,
  "Estratégias de Marketing": 5019,
  "Soc.gov.cidad e Sociedade": 6552,
  "Fil.textos Filosóficos": 6551,
  "Lit. e Prod. de Texto": 6572,
  "Tecno. e Fer. de Gestão": 4767,
  "Negociação e Vendas": 4393,
  "Noções de Direito": 4024,
  "Adm Financ e Orçamentária": 4191,
  "Projeto de Vida": 594,
  "Controladoria e Finanças": 4770,
  "Sociologia I": 2390,
  "História I": 2384,
  "Arte II": 732,
  "Geografia I": 2385,
  "Computação Gráfica": 735,
};

// [TIPODISC] Nomes de disciplinas que sao "Trilha Aprofundamento"
// (itinerario formativo do Novo Ensino Medio) -- confirmado pelo padrao
// visto no Romario Martins (Robotica, Ciencia de Dados, Aprofundamento
// Quimica etc. sao tipicamente trilhas). Ajustar/completar quando o
// Mario Braga confirmar quais componentes do EM sao trilha de verdade.
// TODO real: adicionar uma coluna tipo_componente (ou similar) na
// tabela disciplinas em vez de manter essa lista por nome aqui -- mais
// seguro pra escalar pra novas escolas sem editar codigo toda hora.
const NOMES_TRILHA_APROFUNDAMENTO = new Set([
  // preencher conforme confirmado -- vazio por enquanto, nao assumir
  // nada sem confirmacao (evita marcar TIPODISC errado)
]);

const DIA_SEMANA_MAP = { 0: "SEG", 1: "TER", 2: "QUA", 3: "QUI", 4: "SEX" }; // [FIX 03/09] dia_semana no banco e 0-indexado (0=Segunda), nao 1-5

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL; // usa a mesma conexao dos outros scripts quando ja definida
  const envPath = path.join(__dirname, ".env");
  const envPathAlt = path.join("lib", "db", ".env");
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, "utf8");
  const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL não encontrada no .env");
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return {
    escola: args.escola ?? "mario-braga",
    turno: args.turno ?? "matutino",
    aplicar: !!args.aplicar,
    comAssincronas: !!args["com-assincronas"], // [XML-SEM-ASSINC] padrao: assincrona NAO vai pro RCO
    turmaFiltro: typeof args.turma === "string" ? args.turma : null, // [XML-TESTE-TURMA] gera so 1 turma, p/ teste
  };
}

function formatarHoraHHMM(valor) {
  // horario_slots pode guardar como "07:30:00" (TIME do postgres) ou
  // ja como string "07:30" -- normaliza pros dois casos.
  if (!valor) return "00:00";
  return String(valor).slice(0, 5);
}

async function main() {
  const { escola, turno, aplicar, comAssincronas, turmaFiltro } = parseArgs();
  const config = ESCOLAS[escola];
  if (!config) {
    console.error(`Escola "${escola}" não reconhecida. Opções: ${Object.keys(ESCOLAS).join(", ")}`);
    console.error(`Pra cadastrar uma escola nova, edite o objeto ESCOLAS no topo do script.`);
    process.exit(1);
  }

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    // dados reais: turma + disciplina + professor + horario (grade final,
    // nao a matriz -- precisamos do horario JA GERADO, nao so a exigencia)
    const r = await client.query(
      `SELECT h.dia_semana, h.numero_aula, h.assincrona, t.nome AS turma_nome, d.nome AS disciplina_nome,
              d.codigo_sae, p.nome AS professor_nome, t.id AS turma_id, p.id AS professor_id,
              im.categoria_curricular::text AS cat_matriz,
              d.codigo_externo_rco, rco.codigo_externo AS ext_sae, -- [XML-CODIGOS-DO-BANCO]
              t.codigo_sere, t.codigo_sere_if
       FROM horarios h
       JOIN turmas t ON t.id = h.turma_id
       JOIN disciplinas d ON d.id = h.disciplina_id
       JOIN professores p ON p.id = h.professor_id
       LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = h.disciplina_id
       LEFT JOIN codigos_rco_disciplina rco ON rco.codigo_sae::text = d.codigo_sae
       WHERE t.escola_id = $1 AND t.turno = $2
         AND COALESCE(h.versao_grade, 'oficial') = 'oficial'
       ORDER BY t.nome, h.dia_semana, h.numero_aula`,
      [config.escolaId, turno]
    );

    // [XML-SEM-ASSINC] aula assincrona nao ocupa a turma -- no RCO ela cairia por cima
    // de outra aula no mesmo horario da turma. Fica fora, salvo --com-assincronas.
    const totalComAssinc = r.rows.length;
    if (!comAssincronas) r.rows = r.rows.filter((row) => !row.assincrona);
    if (totalComAssinc !== r.rows.length) console.log(`Assincronas fora do XML: ${totalComAssinc - r.rows.length} (use --com-assincronas para incluir)`);
    if (turmaFiltro) { r.rows = r.rows.filter((row) => row.turma_nome === turmaFiltro); console.log(`Somente a turma ${turmaFiltro} (teste).`); }
    // [XML-CODIGOS-DO-BANCO] grade SEED por turma (codigo SERE -> Codigos Externos)
    const arqGrades = path.join(__dirname, "dados-rco", "grades-seed.json");
    const gradesSeed = fs.existsSync(arqGrades) ? JSON.parse(fs.readFileSync(arqGrades, "utf8")).turmas : {};
    const gradeDe = (cod) => (cod != null && gradesSeed[String(cod)] ? new Set(gradesSeed[String(cod)]) : null);
    // [XML-TURMA-FGB-IF] chave/nome da turma no RCO (3o ano dividido em FGB e IF)
    const dividir = new Set(config.dividirFgbIf ?? []);
    const foraDaGradeSeed = new Map();
    for (const row of r.rows) {
      const cod = resolverCoddisc(row);
      let parte = null;
      if (row.codigo_sere_if != null || dividir.has(row.turma_nome)) {
        const gP = gradeDe(row.codigo_sere), gI = gradeDe(row.codigo_sere_if);
        if (cod != null && gP && gP.has(cod)) parte = "FGB";
        else if (cod != null && gI && gI.has(cod)) parte = "IF";
        else {
          parte = row.cat_matriz === "FGB" ? "FGB" : "IF"; // regra antiga, pela categoria na matriz
          if (gP || gI) foraDaGradeSeed.set(`${row.turma_nome}: ${row.disciplina_nome} (${cod ?? "sem codigo"})`, (foraDaGradeSeed.get(`${row.turma_nome}: ${row.disciplina_nome} (${cod ?? "sem codigo"})`) ?? 0) + 1);
        }
      } else {
        const g = gradeDe(row.codigo_sere);
        if (g && cod != null && !g.has(cod)) foraDaGradeSeed.set(`${row.turma_nome}: ${row.disciplina_nome} (${cod})`, (foraDaGradeSeed.get(`${row.turma_nome}: ${row.disciplina_nome} (${cod})`) ?? 0) + 1);
      }
      row.parte = parte;
      row.turma_chave = parte ? `${row.turma_id}|${parte}` : String(row.turma_id);
      row.turma_rco = parte ? `${row.turma_nome} (${parte})` : row.turma_nome;
    }
    if (r.rows.length === 0) {
      console.error(`Nenhum horário encontrado para ${escola}/${turno}. A grade foi gerada?`);
      process.exit(1);
    }

    // horarios reais de inicio/fim de cada numero_aula, direto do banco
    // (nao mais fixo em codigo -- funciona pra qualquer escola/turno)
    // horario_slots so guarda hora_inicio + duracao_minutos (nao tem
    // coluna hora_fim) -- calculamos o fim somando os minutos.
    const slotsR = await client.query(
      `SELECT numero_aula, hora_inicio, duracao_minutos FROM horario_slots
       WHERE escola_id = $1 AND turno = $2 AND letivo = true`,
      [config.escolaId, turno]
    );
    function somarMinutos(horaInicioStr, minutos) {
      const [h, m] = horaInicioStr.slice(0, 5).split(":").map(Number);
      const totalMin = h * 60 + m + (minutos ?? 0);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    const horarioPorSlot = new Map();
    for (const s of slotsR.rows) {
      if (!horarioPorSlot.has(s.numero_aula)) {
        const inicio = formatarHoraHHMM(s.hora_inicio);
        const fim = somarMinutos(s.hora_inicio, s.duracao_minutos);
        horarioPorSlot.set(s.numero_aula, [inicio, fim]);
      }
    }
    const semHorarioSlot = new Set();

    function resolverCoddisc(row) { // [XML-CODDISC-NO-MATRIZ]
      // [XML-CODIGOS-DO-BANCO] 1) codigo gravado na disciplina; 2) tabela padrao pelo SAE
      if (row.codigo_externo_rco != null) return Number(row.codigo_externo_rco);
      if (row.ext_sae != null) return Number(row.ext_sae);
      if (!config.coddiscSere) return null; // sem codigo no banco: fica fora (nunca chuta)
      const sae = resolverSae(row);
      // [XML-CODDISC-SERE] o RCO usa o codigo da disciplina no SERE. Para quase todas e o
      // proprio SAE; as classicas tem codigo antigo (confirmado no arquivo do Urania aceito
      // pelo RCO, Romario tarde 05/10/2026: LP=1, MAT=2, GEO=3, HIST=4, ED FIS=6, ARTE=21).
      if (config.coddiscSere) {
        if (sae == null) return null;
        return CODDISC_SERE_LEGADO[sae] ?? sae;
      }
      if (!config.codDiscRco) return sae;
      const mapa = config.codDiscRco[row.turma_rco];
      return mapa && sae != null ? (mapa[sae] ?? null) : null;
    }
    function resolverSae(row) {
      // [FIX 03/09] Nucleo comum (dicionario validado via Romario
      // Martins) tem prioridade sobre o codigo_sae do banco, porque o
      // codigo_sae do nucleo comum (101, 201, 701...) e um PLACEHOLDER
      // nao confirmado -- nao bate com documento oficial nenhum.
      if (row.disciplina_nome in DICIONARIO_CODDISC_NUCLEO_COMUM) return DICIONARIO_CODDISC_NUCLEO_COMUM[row.disciplina_nome];
      // Bloqueia explicitamente esses placeholders conhecidos mesmo se
      // vierem preenchidos no codigo_sae do banco.
      const PLACEHOLDERS_SUSPEITOS = new Set([101, 701, 1101, 1501, 1901, 2001]);
      if (row.codigo_sae != null && !PLACEHOLDERS_SUSPEITOS.has(Number(row.codigo_sae))) {
        return Number(row.codigo_sae);
      }
      return null;
    }

    function resolverTipoDisc(row) {
      return NOMES_TRILHA_APROFUNDAMENTO.has(row.disciplina_nome) ? "Trilha Aprofundamento" : null;
    }

    // disciplinas sem mapeamento -- relatorio de bloqueio
    const semMapeamento = new Map();
    for (const row of r.rows) {
      if (resolverCoddisc(row) === null) {
        const chaveSem = config.codDiscRco ? `${row.turma_rco}: ${row.disciplina_nome} (SAE ${resolverSae(row) ?? "-"})` : row.disciplina_nome; // [XML-CODDISC-NO-MATRIZ]
        semMapeamento.set(chaveSem, (semMapeamento.get(chaveSem) ?? 0) + 1);
      }
      if (!horarioPorSlot.has(row.numero_aula)) semHorarioSlot.add(row.numero_aula);
    }

    if (semMapeamento.size > 0) {
      console.log(`\n⚠ ${semMapeamento.size} disciplina(s) SEM código CODDISC confirmado:\n`);
      for (const [nome, qtd] of [...semMapeamento.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${nome}  (${qtd} aulas/semana no total)`);
      }
      console.log(`\nEssas disciplinas NÃO entram no XML até termos o código confirmado.`);
      console.log(`Preencha disciplinas.codigo_externo_rco (ou o SAE + codigos_rco_disciplina) dessas disciplinas.`);
    }

    if (semHorarioSlot.size > 0) {
      console.log(`\n⚠ Número(s) de aula sem horário cadastrado em horario_slots: ${[...semHorarioSlot].sort().join(", ")}`);
      console.log(`Essas aulas vão usar "00:00-00:00" como placeholder até horario_slots ser corrigido.`);
    }

    // atribui CODPROF e CODTURMA sequenciais (por essa exportacao, nao
    // um ID externo fixo -- confirmado que o Urania nao usa ID fixo
    // entre exportacoes diferentes)
    const codTurmaMap = new Map();
    const codProfMap = new Map();
    let proximoTurma = 1;
    let proximoProf = 1;
    for (const row of r.rows) {
      if (!codTurmaMap.has(row.turma_chave)) { // [XML-TURMA-FGB-IF] [XML-CODTURMA-SERE] [XML-CODIGOS-DO-BANCO]
        const doBanco = row.parte === "IF" ? row.codigo_sere_if : row.codigo_sere;
        codTurmaMap.set(row.turma_chave, doBanco ?? (config.codTurmaRco ? (config.codTurmaRco[row.turma_rco] ?? null) : null));
      }
      if (!codProfMap.has(row.professor_id)) codProfMap.set(row.professor_id, proximoProf++);
    }

    // [XML-CODTURMA-SERE] sem codigo SERE da turma o RCO quebra -- para aqui
    const semCodTurma = [...new Set(r.rows.filter((row) => codTurmaMap.get(row.turma_chave) == null).map((row) => row.turma_rco))];
    if (semCodTurma.length > 0) {
      console.error(`\nTurma(s) sem codigo SERE (turmas.codigo_sere / codigo_sere_if): ${semCodTurma.join(", ")}. Nada gerado.`);
      process.exit(1);
    }
    if (foraDaGradeSeed.size > 0) { // [XML-CODIGOS-DO-BANCO]
      console.log(`\n⚠ ${foraDaGradeSeed.size} disciplina(s) FORA da grade SEED da turma (o RCO deve recusar):`);
      for (const [k, q] of foraDaGradeSeed) console.log(`  ${k}  (${q} aulas)`);
    }
    // [RCO-LINHA-UNICA] mesma disciplina no mesmo horario da turma (2 professores) = 1 linha so
    const vistosRco = new Set();
    let linhasRepetidas = 0;
    const registrosValidos = r.rows.filter((row) => {
      const cod = resolverCoddisc(row);
      if (cod === null) return false;
      const k = `${row.turma_chave}|${row.dia_semana}|${row.numero_aula}|${cod}`;
      if (vistosRco.has(k)) { linhasRepetidas++; return false; }
      vistosRco.add(k);
      return true;
    });
    if (linhasRepetidas) console.log(`\n(${linhasRepetidas} aula(s) com 2 professores na mesma disciplina e horario: 1 linha so no arquivo)`);
    const comTipoDisc = registrosValidos.filter((row) => resolverTipoDisc(row) !== null);

    console.log(`\nTotal de aulas na grade: ${r.rows.length}`);
    console.log(`Aulas que ENTRARIAM no XML (com código confirmado): ${registrosValidos.length}`);
    if (comTipoDisc.length > 0) console.log(`  (das quais ${comTipoDisc.length} marcadas como Trilha Aprofundamento)`);
    console.log(`Turmas: ${codTurmaMap.size} | Professores: ${codProfMap.size}`);
    console.log(`TIPOTURMA usado: ${config.tipoTurmaPadrao}`);

    if (!aplicar) {
      console.log(`\n[DRY-RUN] Nenhum arquivo gerado. Rode com --aplicar quando o dicionário estiver completo.`);
      return;
    }

    const linhas = [`<IMPORT_URANIA>`, `<CODESCOLA>${config.codescola}</CODESCOLA>`, `<HORARIO>`];
    for (const row of registrosValidos) {
      const [horaInicio, horaFim] = horarioPorSlot.get(row.numero_aula) ?? ["00:00", "00:00"];
      const tipoDisc = resolverTipoDisc(row);
      const campos = [
        `<REGISTRO>`,
        `<CODTURMA>${codTurmaMap.get(row.turma_chave)}</CODTURMA>`,
        `<TIPOTURMA>${config.tipoTurmaPadrao}</TIPOTURMA>`,
        `<DIA>${DIA_SEMANA_MAP[row.dia_semana]}</DIA>`,
        `<HOR>${String(row.numero_aula).padStart(2, "0")}</HOR>`,
        `<HORA_INICIO>${horaInicio}</HORA_INICIO>`,
        `<HORA_FIM>${horaFim}</HORA_FIM>`,
        `<CODPROF>${codProfMap.get(row.professor_id)}</CODPROF>`,
        `<CODDISC>${resolverCoddisc(row)}</CODDISC>`,
      ];
      if (tipoDisc) campos.push(`<TIPODISC>${tipoDisc}</TIPODISC>`); // OPCIONAL, so quando aplicavel
      campos.push(`</REGISTRO>`);
      linhas.push(...campos);
    }
    linhas.push(`</HORARIO>`, `</IMPORT_URANIA>`);

    const sufixo = turmaFiltro ? `-teste-${turmaFiltro}` : "";
    const nomeArquivo = `export-sere-${escola}-${turno}${sufixo}-${new Date().toISOString().slice(0, 10)}.xml`;
    fs.writeFileSync(nomeArquivo, linhas.join("\r\n"), "utf8");
    console.log(`\nArquivo gerado: ${nomeArquivo}`);
    // [XML-LEGENDA] de-para dos codigos sequenciais, p/ conferir e mapear no RCO
    const nomeTurma = new Map(r.rows.map((row) => [row.turma_chave, row.turma_rco])); // [XML-TURMA-FGB-IF]
    const nomeProf = new Map(r.rows.map((row) => [row.professor_id, row.professor_nome]));
    const leg = ["tipo;codigo;nome"];
    for (const [id, cod] of codTurmaMap) leg.push(`TURMA;${cod};${nomeTurma.get(id)}`);
    for (const [id, cod] of codProfMap) leg.push(`PROFESSOR;${cod};${nomeProf.get(id)}`);
    fs.writeFileSync(nomeArquivo.replace(/\.xml$/, "-legenda.csv"), "\ufeff" + leg.join("\r\n"), "utf8");
    console.log(`Legenda: ${nomeArquivo.replace(/\.xml$/, "-legenda.csv")}`);
    // [XML-SLOT-DUPLO] avisa horario de turma com mais de 1 registro (trio/co-docencia)
    const porSlot = new Map();
    for (const row of registrosValidos) { const k = `${row.turma_rco} ${DIA_SEMANA_MAP[row.dia_semana]} ${row.numero_aula}a`; porSlot.set(k, [...(porSlot.get(k) ?? []), row.disciplina_nome]); }
    const duplos = [...porSlot].filter(([, v]) => v.length > 1);
    if (duplos.length) { console.log(`\nHorarios de turma com mais de 1 registro (${duplos.length}):`); for (const [k, v] of duplos) console.log(`  ${k}: ${v.join(" + ")}`); }
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
