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
  };
}

function formatarHoraHHMM(valor) {
  // horario_slots pode guardar como "07:30:00" (TIME do postgres) ou
  // ja como string "07:30" -- normaliza pros dois casos.
  if (!valor) return "00:00";
  return String(valor).slice(0, 5);
}

async function main() {
  const { escola, turno, aplicar } = parseArgs();
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
      `SELECT h.dia_semana, h.numero_aula, t.nome AS turma_nome, d.nome AS disciplina_nome,
              d.codigo_sae, p.nome AS professor_nome, t.id AS turma_id, p.id AS professor_id
       FROM horarios h
       JOIN turmas t ON t.id = h.turma_id
       JOIN disciplinas d ON d.id = h.disciplina_id
       JOIN professores p ON p.id = h.professor_id
       WHERE t.escola_id = $1 AND t.turno = $2
       ORDER BY t.nome, h.dia_semana, h.numero_aula`,
      [config.escolaId, turno]
    );

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

    function resolverCoddisc(row) {
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
        semMapeamento.set(row.disciplina_nome, (semMapeamento.get(row.disciplina_nome) ?? 0) + 1);
      }
      if (!horarioPorSlot.has(row.numero_aula)) semHorarioSlot.add(row.numero_aula);
    }

    if (semMapeamento.size > 0) {
      console.log(`\n⚠ ${semMapeamento.size} disciplina(s) SEM código CODDISC confirmado:\n`);
      for (const [nome, qtd] of [...semMapeamento.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${nome}  (${qtd} aulas/semana no total)`);
      }
      console.log(`\nEssas disciplinas NÃO entram no XML até termos o código confirmado.`);
      console.log(`Edite DICIONARIO_CODDISC_NUCLEO_COMUM no topo do script pra adicionar, quando souber (ou preencha codigo_sae no banco, se for tecnico/EPT).`);
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
      if (!codTurmaMap.has(row.turma_id)) codTurmaMap.set(row.turma_id, proximoTurma++);
      if (!codProfMap.has(row.professor_id)) codProfMap.set(row.professor_id, proximoProf++);
    }

    const registrosValidos = r.rows.filter((row) => resolverCoddisc(row) !== null);
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
        `<CODTURMA>${codTurmaMap.get(row.turma_id)}</CODTURMA>`,
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

    const nomeArquivo = `export-sere-${escola}-${turno}-${new Date().toISOString().slice(0, 10)}.xml`;
    fs.writeFileSync(nomeArquivo, linhas.join("\r\n"), "utf8");
    console.log(`\nArquivo gerado: ${nomeArquivo}`);
    console.log(`Legenda de códigos (CODTURMA/CODPROF) salva junto seria uma boa adição futura,`);
    console.log(`pra facilitar conferência manual antes de importar no RCO.`);
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
