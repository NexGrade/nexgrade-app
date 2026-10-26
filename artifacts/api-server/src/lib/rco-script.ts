// [RCO-SCRIPT] (26/10/2026) Script de gravacao da grade no RCO pela tela "Incluir Horario".
//
// Por que existe: o "Incluir via Arquivo" do RCO grava UMA disciplina por horario (fica a
// ultima), entao trio/dupla do IFA nunca entra pelo arquivo. A tela Incluir Horario aceita
// ate 5 disciplinas por horario. Este script, colado no Console (F12) da tela Grade de
// Horario do RCO, abre cada turma "por tras" (carregarInterfaceIncluir), monta o envio igual
// ao botao Salvar (conferido byte a byte com o envio real da 2NC do Mario Braga, 26/10/2026)
// e grava turma por turma, com previa e confirmacao. Funcionou no noturno do Mario Braga.
//
// Os codigos internos do RCO (estabelecimento, periodo letivo, turno, disciplina na turma)
// sao lidos da propria tela -- o NexGrade so manda turma (codigo SERE), horarios e os NOMES
// das disciplinas (nome do RCO quando conhecido, senao o do NexGrade).
//
// O codigo do navegador fica em String.raw sem crase nem "${" dentro (nao e template).

export type CelulaRco = [dia: string, horaInicio: string, disciplinas: string[][]];
export type TurmaRcoScript = { codTurma: string; turma: string; horas: Array<[string, string]>; celulas: CelulaRco[] };
export type DadosScriptRco = { escola: string; turno: string; rotuloRco: string; geradoEm: string; turmas: TurmaRcoScript[] };

const CORPO = String.raw`
  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  const URL_BASE = "/rcdig/manterHorario.do";
  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const enc = (o) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v).replace(/%20/g, "+")).join("&");
  const post = async (action, corpo) => {
    const r = await fetch(URL_BASE + "?action=" + action, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "";
    const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || "iso-8859-1";
    return { ok: r.ok, html: new TextDecoder(cs).decode(buf) };
  };
  const lerCampo = (raiz, n) => {
    const e = raiz.getElementsByName(n)[0];
    if (!e) return { valor: "", texto: "" };
    if (e.tagName === "SELECT") {
      const o = e.options[e.selectedIndex] || e.options[0];
      return { valor: e.value || (o && o.value) || "", texto: o ? o.text.trim() : "" };
    }
    return { valor: e.value || "", texto: e.value || "" };
  };

  // tela Grade de Horario: turmas (nome no RCO) e escola / periodo / turno escolhidos
  const comboTurma = document.getElementsByName("codTurma")[0];
  const nomeRco = {};
  if (comboTurma && comboTurma.options) [...comboTurma.options].forEach((o) => { if (o.value) nomeRco[String(o.value)] = o.text.trim(); });
  const est = lerCampo(document, "codEstabelecimento"), per = lerCampo(document, "codPeriodoLetivo"), tur = lerCampo(document, "codTurno");
  if (!Object.keys(nomeRco).length || !est.valor || !per.valor || !tur.valor) {
    alert("Rode este script na tela Grade de Horario do RCO, com o Periodo Letivo e o Turno " + DADOS.rotuloRco + " escolhidos (a lista de turmas precisa estar carregada).");
    return;
  }
  if (tur.texto && norm(tur.texto) !== norm(DADOS.rotuloRco) &&
      !confirm("No RCO esta escolhido o turno \"" + tur.texto + "\", mas este script e do turno " + DADOS.rotuloRco + ". Continuar mesmo assim?")) return;
  // "Quantidade de Aulas no Turno" da tela Grade de Horario e digitada pela pessoa e fica com o valor
  // da ultima consulta (ex.: 11 do Integral com o turno Noite escolhido) -- nao serve. A turma vai
  // com o numero de linhas do NexGrade.
  const BASE = { grupo: "A,B", codEstabelecimento: est.valor, codTurno: tur.valor, codPeriodoLetivo: per.valor };
  const faltam = DADOS.turmas.filter((t) => !nomeRco[t.codTurma]).map((t) => t.turma + " (" + t.codTurma + ")");
  if (faltam.length) console.log("Turmas do NexGrade que nao aparecem na lista do RCO deste turno: " + faltam.join(", "));
  const disponiveis = DADOS.turmas.filter((t) => nomeRco[t.codTurma]);
  if (!disponiveis.length) { alert("Nenhuma turma deste script aparece na lista do RCO. Confira o Periodo Letivo e o Turno escolhidos.\nTurmas do script: " + faltam.join(", ")); return; }
  const escolha = (prompt("Quais turmas gravar no RCO? Escreva TODAS, ou os nomes separados por virgula.\nTurmas: " + disponiveis.map((t) => t.turma).join(", "), "TODAS") || "").trim();
  if (!escolha) return;
  const alvo = norm(escolha) === "TODAS" ? disponiveis : disponiveis.filter((t) => escolha.split(",").some((e) => norm(e) && norm(t.turma).startsWith(norm(e))));
  if (!alvo.length) { alert("Nenhuma turma reconhecida em: " + escolha); return; }

  // disciplina: nome exato (sem acento/maiusculas; depois so letras e numeros) entre os nomes conhecidos; senao, um unico nome do RCO que comeca igual
  const compacto = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
  const achar = (valor, nomes) => {
    for (const n of nomes) { const v = valor[norm(n)]; if (v) return { v, nome: n }; }
    for (const n of nomes) { const k = Object.keys(valor).find((x) => compacto(x) === compacto(n)); if (k) return { v: valor[k], nome: k }; }
    // nome abreviado do RCO: cada palavra do RCO e o comeco de uma palavra do NexGrade, na ordem, e as
    // palavras do NexGrade que sobram sao so "de/da/do/para/e..." (ex.: "MAT BASICA ANOS INICIAIS" =
    // "Matematica Basica para Anos Iniciais"; "TRABALHO PEDAG.NA EDUC.INFANTI" = "Trabalho Pedagogico na
    // Educacao Infantil"). So vale se uma unica disciplina da turma casar.
    const LIGA = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "PARA", "NA", "NO", "NAS", "NOS", "A", "O", "EM", "COM"]);
    const palavras = (s) => norm(s).split(/[^A-Z0-9]+/).filter(Boolean);
    const abreviado = (rco, nex) => {
      const r = palavras(rco), x = palavras(nex);
      let i = 0;
      for (const w of x) {
        if (i < r.length && w.startsWith(r[i])) { i++; continue; }
        if (!LIGA.has(w)) return false;
      }
      return i === r.length && r.length > 0;
    };
    for (const n of nomes) {
      const hits = Object.keys(valor).filter((k) => abreviado(k, n));
      if (hits.length === 1) return { v: valor[hits[0]], nome: hits[0], aprox: n };
    }
    for (const n of nomes) {
      const a = norm(n); if (a.length < 4) continue;
      const hits = Object.keys(valor).filter((k) => k.startsWith(a) || a.startsWith(k));
      if (hits.length === 1) return { v: valor[hits[0]], nome: hits[0], aprox: n };
    }
    return null;
  };

  const planos = []; const previa = []; let problemas = 0;
  for (const T of alvo) {
    const abrir = { ...BASE, descrTurma: nomeRco[T.codTurma] || "", codTurma: T.codTurma };
    abrir.qtdeAula = String(T.horas.length);
    const tela = await post("carregarInterfaceIncluir", enc(abrir));
    const doc = new DOMParser().parseFromString(tela.html, "text/html");
    const s0 = doc.getElementsByName("dtos[0].codClassDiscSeg[0]")[0];
    if (!tela.ok || !s0) { previa.push(T.turma + ": ERRO ao abrir a tela da turma no RCO (sessao expirada?)."); problemas++; continue; }
    const valor = {}; [...s0.options].forEach((o) => { if (o.value && norm(o.text) !== "-") valor[norm(o.text)] = o.value; });
    const campo = (n) => lerCampo(doc, n).valor;
    const descrTurma = campo("descrTurma") || nomeRco[T.codTurma] || "";
    const dataInicio = campo("dataInicio");
    const qtdeAula = String(T.horas.length);
    const quer = {}; for (const [d, h, ds] of T.celulas) quer[d + "|" + h] = ds;
    const dados = { grupo: BASE.grupo, acao: "incluir", codTurmaHorario: campo("codTurmaHorario"), codEstabelecimento: campo("codEstabelecimento") || BASE.codEstabelecimento,
      codTurno: campo("codTurno") || BASE.codTurno, codPeriodoLetivo: campo("codPeriodoLetivo") || BASE.codPeriodoLetivo, codTurma: T.codTurma, qtdeAula,
      nomeCompletoEstab: campo("nomeCompletoEstab") || est.texto, descrTurno: campo("descrTurno") || tur.texto,
      codDescPeriodoLetivo: campo("codDescPeriodoLetivo") || per.texto, descrTurma, dataInicio };
    const erros = []; const aprox = [];
    const linhas = T.horas.length;
    for (let r = 0; r < linhas; r++) {
      const [ini, fim] = T.horas[r] || ["", ""];
      dados["dtos[" + r + "].horaInicio"] = ini; dados["dtos[" + r + "].horaFim"] = fim;
      for (const d of DIAS) {
        const ds = ini ? (quer[d + "|" + ini] || []) : [];
        ds.forEach((nomes, k) => {
          const a = achar(valor, nomes);
          if (!a) erros.push(d + " " + ini + ": \"" + nomes[0] + "\" nao esta na lista de disciplinas da turma no RCO");
          else if (a.aprox) aprox.push(a.aprox + " = " + a.nome);
          dados["dtos[" + r + "].codClassDisc" + d + "[" + k + "]"] = a ? a.v : "";
        });
        dados["dtos[" + r + "].codClassDisc" + d + "[" + ds.length + "]"] = "";
      }
      dados["dtos[" + r + "].horaInicioSab"] = ""; dados["dtos[" + r + "].horaFimSab"] = ""; dados["dtos[" + r + "].codClassDiscSab[0]"] = "";
    }
    const multi = T.celulas.filter((c) => c[2].length > 1).map((c) => c[0] + " " + c[1] + " (" + c[2].length + ")");
    const aproxUnicos = [...new Set(aprox)];
    previa.push(T.turma + " -> RCO \"" + descrTurma + "\", inicio " + dataInicio + ": " + T.celulas.length + " horarios" +
      (multi.length ? ", varias disciplinas em " + multi.join(", ") : "") +
      (aproxUnicos.length ? "\n   NOMES PARECIDOS (confira): " + aproxUnicos.join("; ") : "") +
      (erros.length ? "\n   ERROS: " + [...new Set(erros)].join("; ") : ""));
    if (erros.length) console.log(T.turma + " - disciplinas da turma no RCO: " + Object.keys(valor).join(" | "));
    if (erros.length || !descrTurma) { problemas++; continue; }
    planos.push({ T, corpo: enc(dados) });
  }
  console.log(previa.join("\n"));
  if (problemas) { alert("Previa com problemas, nada foi gravado:\n\n" + previa.join("\n") + "\n\n(a lista de disciplinas de cada turma no RCO esta no Console)"); return; }
  if (!confirm("PREVIA (nada gravado ainda):\n\n" + previa.join("\n") + "\n\nGravar estas " + planos.length + " turma(s) no RCO agora? A grade atual de cada uma sera substituida.")) return;
  const res = [];
  for (const p of planos) {
    const r = await post("incluir", p.corpo);
    const txt = new DOMParser().parseFromString(r.html, "text/html").body.textContent || "";
    const okMsg = /realizada com sucesso/i.test(txt);
    res.push(p.T.turma + ": " + (okMsg ? "GRAVADO" : "ERRO - " + (txt.match(/[^\n]*(erro|invalid|obrigat|nao foi|não foi)[^\n]*/i) || ["resposta inesperada (veja o Console)"])[0].trim()));
    if (!okMsg) { console.log(r.html); break; }
  }
  console.log(res.join("\n")); alert(res.join("\n") + "\n\nConfira no Exibir Horario.");
`;

/** Texto do script (JavaScript para o Console do navegador). */
export function gerarScriptRco(d: DadosScriptRco): string {
  const json = JSON.stringify(d).replace(/</g, "\\u003c");
  return [
    `// NexGrade -> RCO: grava a grade do turno ${d.rotuloRco} de ${d.escola} (gerado em ${d.geradoEm}).`,
    `// Como usar: RCO > Grade de Horario, escolha o Periodo Letivo e o Turno ${d.rotuloRco}; aperte F12, aba Console;`,
    "// cole este texto inteiro e aperte Enter. O script pergunta as turmas, mostra a PREVIA e so grava se voce confirmar.",
    "// Cada turma gravada tem a grade inteira substituida (igual ao Salvar da tela Incluir Horario).",
    "(async () => {",
    `  const DADOS = ${json};`,
    CORPO.replace(/^\n/, ""),
    "})();",
    "",
  ].join("\n");
}
