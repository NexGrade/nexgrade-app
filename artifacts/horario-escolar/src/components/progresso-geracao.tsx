// [PROGRESSO-GERACAO] (16/10/2026) Mostra o andamento da geracao com o motor CP-SAT:
// cada etapa com o tempo que levou, a etapa atual com um relogio correndo.
// Os dados vem de GET /api/horarios/gerar-cpsat-status/:jobId (campo `etapas`).
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface EtapaGeracao {
  id: string;
  rotulo: string;
  inicioMs: number;
  fimMs?: number;
  detalhe?: string;
}

export interface ProgressoGeracaoDados {
  etapas: EtapaGeracao[];
  /** relogio do servidor no momento da resposta, para acertar a diferenca de horario */
  agoraMs: number;
  /** Date.now() do navegador quando a resposta chegou */
  recebidoEm: number;
}

function formatarTempo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`;
}

export function ProgressoGeracao({ dados, terminou = false }: { dados: ProgressoGeracaoDados | null; terminou?: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (terminou) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [terminou]);

  if (!dados) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Iniciando a geração…
      </div>
    );
  }

  // horario do servidor "agora", estimado a partir da ultima resposta
  const agoraServidor = dados.agoraMs + (agora - dados.recebidoEm);
  const inicio = dados.etapas[0]?.inicioMs;
  const total = inicio != null ? (terminou ? (dados.etapas[dados.etapas.length - 1]?.fimMs ?? agoraServidor) : agoraServidor) - inicio : 0;

  return (
    <div className="rounded-md border bg-muted/40 p-3" role="status" aria-live="polite">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{terminou ? "Geração concluída" : "Andamento da geração"}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{formatarTempo(total)}</span>
      </div>
      <ol className="space-y-2">
        {dados.etapas.map((e, i) => {
          const emAndamento = e.fimMs == null && !terminou;
          const duracao = (e.fimMs ?? agoraServidor) - e.inicioMs;
          return (
            <li key={`${e.id}-${i}`} className="flex items-start gap-2">
              {emAndamento
                ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${emAndamento ? "font-medium" : "text-muted-foreground"}`}>{e.rotulo}</div>
                {e.detalhe && <div className="text-xs text-muted-foreground">{e.detalhe}</div>}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatarTempo(duracao)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
