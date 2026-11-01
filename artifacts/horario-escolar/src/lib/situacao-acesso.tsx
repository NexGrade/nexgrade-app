// [TRAVA-AVALIACAO] (01/11/2026) Situação de acesso da escola: fim dos 30 dias de cortesia sem
// assinatura (ou escola suspensa no Painel Master) bloqueia o sistema para todos da escola.
// A regra fica no servidor (api-server/src/lib/situacao-escola.ts); aqui só a tela e o aviso.
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Lock, Mail, Clock, MessageCircle } from "lucide-react";

export type SituacaoAcesso = {
  bloqueada: boolean;
  motivo: "avaliacao_encerrada" | "suspensa" | null;
  avaliacaoAte: string | null;
  diasRestantes: number | null;
  master: boolean;
};

// contato mostrado na tela de bloqueio, no aviso e no rodape do login
// [WHATSAPP-NEXUS] (01/11/2026) WhatsApp da Nexus Core: (41) 99818-0353
export const CONTATO_NEXUS = { email: "contato@nexuscoretecnologia.com.br", whatsapp: "5541998180353", whatsappRotulo: "(41) 99818-0353" };
/** Link que abre a conversa no WhatsApp com a mensagem pronta. */
export const linkWhatsApp = (mensagem: string) => `https://wa.me/${CONTATO_NEXUS.whatsapp}?text=${encodeURIComponent(mensagem)}`;
const MSG_ASSINATURA = "Olá! Quero efetivar a assinatura do NexGrade da minha escola.";

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

export function useSituacaoAcesso(habilitado = true) {
  return useQuery({
    queryKey: ["situacao-acesso"],
    queryFn: () => customFetch<SituacaoAcesso>("/api/situacao-acesso"),
    enabled: habilitado,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
}

/** Tela no lugar do sistema quando a escola está bloqueada (o "Sair" fica na barra do topo). */
export function TelaBloqueio({ situacao }: { situacao: SituacaoAcesso }) {
  const avaliacao = situacao.motivo === "avaliacao_encerrada";
  const assunto = encodeURIComponent(avaliacao ? "NexGrade: efetivar a assinatura" : "NexGrade: acesso suspenso");
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Lock className="mx-auto h-10 w-10 text-[#1565C0]" />
        <h1 className="mt-3 text-xl font-bold text-slate-900 font-heading">
          {avaliacao ? "O período de avaliação terminou" : "Acesso suspenso"}
        </h1>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          {avaliacao
            ? <>Os 30 dias de cortesia do NexGrade terminaram{situacao.avaliacaoAte ? <> em <strong className="text-slate-900">{dataBR(situacao.avaliacaoAte)}</strong></> : null}. Para continuar usando o sistema, entre em contato com a Nexus Core para efetivar a assinatura.</>
            : <>O acesso desta escola ao NexGrade está suspenso. Entre em contato com a Nexus Core para regularizar.</>}
        </p>
        <p className="mt-2 text-sm text-slate-500">Os dados da escola continuam guardados: assim que a assinatura for efetivada, tudo volta como estava.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a
            href={linkWhatsApp(avaliacao ? MSG_ASSINATURA : "Olá! O acesso da minha escola ao NexGrade está suspenso.")}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1EBE5A]"
          >
            <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
          </a>
          <a
            href={`mailto:${CONTATO_NEXUS.email}?subject=${assunto}`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Mail className="h-4 w-4" /> Enviar e-mail
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">WhatsApp {CONTATO_NEXUS.whatsappRotulo} · {CONTATO_NEXUS.email}</p>
      </div>
    </div>
  );
}

/** Faixa dos últimos dias da avaliação (direção, coordenação e secretaria). */
export function AvisoFimAvaliacao({ situacao }: { situacao: SituacaoAcesso | undefined }) {
  if (!situacao || situacao.bloqueada || situacao.diasRestantes == null) return null;
  const n = situacao.diasRestantes;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <Clock className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-[12rem]">
        {n <= 1 ? "Último dia" : `Faltam ${n} dias`} do período de avaliação do NexGrade (até {dataBR(situacao.avaliacaoAte)}).
        Entre em contato com a Nexus Core para efetivar a assinatura e não perder o acesso.
      </span>
      <a href={linkWhatsApp(MSG_ASSINATURA)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline hover:text-amber-950">
        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp {CONTATO_NEXUS.whatsappRotulo}
      </a>
      <a href={`mailto:${CONTATO_NEXUS.email}?subject=${encodeURIComponent("NexGrade: efetivar a assinatura")}`} className="font-medium underline hover:text-amber-950">
        {CONTATO_NEXUS.email}
      </a>
    </div>
  );
}
