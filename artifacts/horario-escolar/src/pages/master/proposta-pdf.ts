// [PROPOSTA-PDF] (05/11/2026) Modelo da proposta comercial (o mesmo de docs/propostas/proposta-colegio-planta-deodoro.html,
// aprovado pela Simone em 05/11) montado a partir do Simulador de proposta do Painel Master.
// O PDF sai pelo próprio navegador: abre a proposta numa janela nova e chama a impressão
// ("Salvar como PDF"); o título da janela vira o nome do arquivo. Não passa pela API.

export type DadosProposta = {
  escola: string;
  contato: string;
  tratamento: "Prezada" | "Prezado" | "Olá";
  turmas: number;
  precoTurma: number;
  implTurma: number;
  comImpl: boolean;
  hoje?: Date;
};

const CNPJ = "48.542.365/0001-74";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, "&nbsp;");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function tituloProposta(escola: string): string {
  return `Proposta NexGrade${escola.trim() ? " - " + escola.trim() : ""}`;
}

export function montarPropostaHtml(d: DadosProposta, origem: string): string {
  const hoje = d.hoje ?? new Date();
  const validade = new Date(hoje.getTime() + 30 * 86400000);
  const dataLonga = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const dataValidade = validade.toLocaleDateString("pt-BR");
  const escola = d.escola.trim();
  const contato = d.contato.trim();
  const primeiroNome = contato.split(/\s+/)[0] ?? "";
  const t = d.turmas;
  const turmasTxt = `${t} ${t === 1 ? "turma" : "turmas"}`;
  const assin = Math.round(t * d.precoTurma * 100) / 100;
  const implV = d.comImpl ? Math.round(t * d.implTurma * 100) / 100 : 0;
  const total = assin + implV;
  const saudacao = primeiroNome ? `${d.tratamento} ${esc(primeiroNome)},` : d.tratamento === "Olá" ? "Olá!" : "Prezados,";
  const td = "padding:10px 8px; border-bottom:1px solid #e2e7f0;";
  const th = "background:#1e3a8a; color:#ffffff; font-weight:bold; padding:10px 8px;";
  const item = (titulo: string, texto: string) =>
    `<tr><td valign="top" style="width:22px; color:#2562eb; font-weight:bold; padding:4px 0;">&#10003;</td><td style="padding:4px 0;"><strong>${titulo}</strong> ${texto}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(tituloProposta(escola))}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 0; background: #ffffff; }
  tr, table.bloco { break-inside: avoid; }
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:100%; max-width:720px; margin:0 auto; font-family:Arial, Helvetica, sans-serif; color:#1e293b;">
  <tr>
    <td style="background:#0e1729; padding:22px 24px; border-radius:10px 10px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
        <td valign="middle" style="padding-right:14px;"><img src="${esc(origem)}/icon-192.png" width="52" height="52" alt="NexGrade" style="display:block; width:52px; height:52px; border:0; border-radius:12px;"></td>
        <td valign="middle">
          <div style="font-size:21px; font-weight:bold; color:#ffffff; line-height:25px;">NexGrade</div>
          <div style="font-size:13px; color:#93c5fd; line-height:18px;">Proposta comercial · ${esc(dataLonga)}</div>
          <div style="font-size:12px; color:#cbd5e1; line-height:17px;">Nexus Core Tecnologia · CNPJ ${CNPJ}</div>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 24px 6px; font-size:16px; line-height:25px;">
      ${escola ? `<p style="margin:0 0 2px; font-size:14px; color:#475569;">Ao</p><p style="margin:0 0 2px;"><strong>${esc(escola)}</strong></p>` : ""}
      ${contato ? `<p style="margin:0 0 18px;">A/C: <strong>${esc(contato)}</strong></p>` : `<div style="height:16px"></div>`}
      <p style="margin:0 0 14px;">${saudacao}</p>
      <p style="margin:0 0 14px;">Agradecemos o interesse no <strong>NexGrade</strong>. Segue a nossa proposta para ${escola ? "o colégio" : "a escola"}, considerando <strong>${turmasTxt}</strong> no ano letivo (somando todos os turnos), no <strong>plano anual</strong>.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:4px 24px 8px;">
      <table class="bloco" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; font-size:15px; line-height:21px;">
        <tr>
          <td style="${th} padding-left:12px;">Item</td>
          <td align="center" style="${th}">Turmas</td>
          <td align="right" style="${th}">Valor por turma</td>
          <td align="right" style="${th} padding-right:12px;">Total</td>
        </tr>
        <tr>
          <td style="${td} padding-left:12px;"><strong>Assinatura anual</strong><br><span style="font-size:13px; color:#475569;">12 meses de uso, tudo incluído</span></td>
          <td align="center" style="${td}">${t}</td>
          <td align="right" style="${td}">${brl(d.precoTurma)}</td>
          <td align="right" style="${td} padding-right:12px;">${brl(assin)}</td>
        </tr>
        ${d.comImpl ? `<tr>
          <td style="${td} padding-left:12px;"><strong>Implantação</strong><br><span style="font-size:13px; color:#475569;">pagamento único</span></td>
          <td align="center" style="${td}">${t}</td>
          <td align="right" style="${td}">${brl(d.implTurma)}</td>
          <td align="right" style="${td} padding-right:12px;">${brl(implV)}</td>
        </tr>` : ""}
        <tr>
          <td colspan="3" style="background:#eff5ff; padding:12px; font-weight:bold; color:#1e3a8a;">${d.comImpl ? "Total do primeiro ano" : "Total por ano"}</td>
          <td align="right" style="background:#eff5ff; padding:12px; font-weight:bold; color:#1e3a8a; font-size:17px;">${brl(total)}</td>
        </tr>
      </table>
      ${d.comImpl ? `<p style="margin:8px 0 0; font-size:13px; line-height:19px; color:#475569;">Nos anos seguintes, só a assinatura anual (a implantação não se repete).</p>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:18px 24px 4px; font-size:15px; line-height:23px;">
      <div style="font-size:18px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">O que está incluído na assinatura</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${item("Geração da grade", "pelas regras SEED-PR 2026: aulas assíncronas, trio e co-docência, com menos janelas para os professores.")}
        ${item("Hora-atividade pela tabela oficial", "(Res. 7.200/2025).")}
        ${item("Arquivo para o RCO", "por turno, que a secretaria inclui no RCO, sem redigitar aula por aula.")}
        ${item("Modo Experimental:", "nenhuma grade vira oficial sem a coordenação aprovar, e sempre dá para voltar à anterior.")}
        ${item("O ano inteiro:", "agenda no celular do professor, presença, licenças com substituto, comunicados, reservas de espaços, relatórios em PDF e Excel e Assistente de IA.")}
        ${item("Atualizações e suporte:", "quando a SEED muda as regras, atualizamos o sistema sem perder a grade nem o histórico.")}
      </table>
    </td>
  </tr>
  ${d.comImpl ? `<tr>
    <td style="padding:14px 24px 4px; font-size:15px; line-height:23px;">
      <div style="font-size:18px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">O que está incluído na implantação</div>
      Montagem do banco de dados ${escola ? "do colégio" : "da escola"} (cadastro a partir do arquivo do RCO, professores, turmas e matrizes), parametrização, treinamento da coordenação e acompanhamento da primeira grade oficial.
    </td>
  </tr>` : ""}
  <tr>
    <td style="padding:18px 24px 4px;">
      <table class="bloco" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background:#eff5ff; border-left:4px solid #2562eb;">
        <tr><td style="padding:14px 16px; font-size:15px; line-height:23px;">
          <div style="font-size:18px; font-weight:bold; color:#1e3a8a; margin-bottom:4px;">Condições</div>
          &bull; <strong>Plano:</strong> anual (12 meses a partir da contratação).<br>
          &bull; <strong>Pagamento:</strong> à vista ou parcelado conforme os repasses, pela APMF ou pelo Fundo Rotativo.<br>
          &bull; <strong>Documentação:</strong> emitimos nota fiscal e contrato.<br>
          &bull; <strong>Dados:</strong> do professor, o sistema guarda só nome, e-mail e telefone; cada escola tem base própria, com cópia de segurança diária.<br>
          &bull; <strong>Validade desta proposta:</strong> 30 dias (até ${esc(dataValidade)}).
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 24px 6px; font-size:16px; line-height:25px;">
      <p style="margin:0 0 16px;">Fico à disposição para tirar dúvidas ou ajustar a proposta ao calendário ${escola ? "do colégio" : "da escola"}. Para aceitar, basta responder a este e-mail que enviamos o contrato.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
        <td style="background:#16a34a; border-radius:8px;"><a href="https://wa.me/5541998180353?text=${encodeURIComponent(`Olá, Simone! Sobre a proposta do NexGrade${escola ? " para " + escola : ""}.`)}" target="_blank" style="display:inline-block; padding:14px 26px; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px;">Falar pelo WhatsApp</a></td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 24px 18px; font-size:15px; line-height:22px; border-bottom:1px solid #e2e7f0;">
      Atenciosamente,<br><br>
      <strong>Simone Barros</strong><br>
      NexGrade · Nexus Core Tecnologia<br>
      CNPJ ${CNPJ}<br>
      WhatsApp (41) 99818-0353 · <a href="mailto:simone@nexuscoretecnologia.com.br" style="color:#2562eb;">simone@nexuscoretecnologia.com.br</a><br>
      <a href="https://nexgrade.nexuscoretecnologia.com.br" style="color:#2562eb;">nexgrade.nexuscoretecnologia.com.br</a>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 24px 20px; font-size:12px; line-height:18px; color:#64748b;">
      Nexus Core Tecnologia — CNPJ ${CNPJ} — <a href="https://nexuscoretecnologia.com.br" style="color:#64748b;">nexuscoretecnologia.com.br</a>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Abre a proposta numa janela nova e chama a impressão (Salvar como PDF). Devolve false se o navegador bloqueou a janela. */
export function abrirPropostaPdf(d: DadosProposta): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(montarPropostaHtml(d, window.location.origin));
  w.document.close();
  const imprimir = () => { w.focus(); w.print(); };
  // espera a logo carregar para ela sair no PDF
  const img = w.document.images[0];
  if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; } else setTimeout(imprimir, 100);
  return true;
}
