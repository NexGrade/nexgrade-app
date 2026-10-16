// [PROGRESSO-GERACAO] (16/10/2026) Mostra o andamento da geracao com o motor CP-SAT:
// cada etapa com o tempo que levou, a etapa atual com um relogio correndo.
// Os dados vem de GET /api/horarios/gerar-cpsat-status/:jobId (campo `etapas`).
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EtapaGeracao {
  id: string;
  rotulo: string;
  inicioMs: number;
  fimMs?: number;
  detalhe?: string;
}

// [PROGRESSO-MOTOR] andamento do proprio motor: fase e cada grade melhor encontrada
export interface SolucaoMotor { t: number; fase: string; janelasProfessor?: number; janelasTurma?: number; haFaltando?: number }
export interface ProgressoMotor { fase: string; decorridoS: number; parar?: boolean; solucoes: SolucaoMotor[] }

/** [PARAR-MOTOR] acoes durante o calculo */
export interface AcoesGeracao { onParar: () => void; onCancelar: () => void; parando: boolean }

export interface ProgressoGeracaoDados {
  etapas: EtapaGeracao[];
  motor?: ProgressoMotor | null;
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

/** Linha das janelas de professor (ou de turma, quando o motor ainda nao mede as de professor) a cada grade melhor. */
function LinhaJanelas({ pontos }: { pontos: Array<{ t: number; v: number }> }) {
  if (pontos.length < 2) return null;
  const L = 240, A = 44, M = 4;
  const tMax = Math.max(...pontos.map((p) => p.t)) || 1;
  const vMax = Math.max(...pontos.map((p) => p.v), 1);
  const x = (t: number) => M + (t / tMax) * (L - 2 * M);
  const y = (v: number) => M + (1 - v / vMax) * (A - 2 * M);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ultimo = pontos[pontos.length - 1]!;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="mt-1 h-11 w-full max-w-[240px] text-primary" role="img" aria-label={`Janelas: de ${pontos[0]!.v} para ${ultimo.v}`}>
      <line x1={M} x2={L - M} y1={A - M} y2={A - M} className="stroke-border" strokeWidth={1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.v)} r={i === pontos.length - 1 ? 4 : 2.5} className="fill-current stroke-background" strokeWidth={1.5}>
          <title>{`${p.v} janela(s) aos ${Math.round(p.t)}s`}</title>
        </circle>
      ))}
    </svg>
  );
}

function PainelMotor({ motor }: { motor: ProgressoMotor }) {
  const sol = motor.solucoes;
  const comProf = sol.filter((s) => s.janelasProfessor != null);
  const serie = (comProf.length >= 2 ? comProf.map((s) => ({ t: s.t, v: s.janelasProfessor! })) : sol.filter((s) => s.janelasTurma != null).map((s) => ({ t: s.t, v: s.janelasTurma! })));
  const ultimaProf = [...sol].reverse().find((s) => s.janelasProfessor != null)?.janelasProfessor;
  const ultimaTurma = [...sol].reverse().find((s) => s.janelasTurma != null)?.janelasTurma;
  const ultimaHa = [...sol].reverse().find((s) => s.haFaltando != null)?.haFaltando;
  return (
    <div className="mt-1.5 rounded border bg-background/60 px-2 py-1.5">
      <div className="text-xs font-medium">{motor.fase}</div>
      {sol.length === 0 ? (
        <div className="text-xs text-muted-foreground">Procurando a primeira grade que respeite todas as regras…</div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {sol.length} grade(s) melhor(es) encontrada(s)
            {ultimaProf != null && <> · <span className="font-medium text-foreground">{ultimaProf}</span> janela(s) de professor</>}
            {ultimaTurma != null && <> · {ultimaTurma} de turma</>}
            {ultimaHa != null && ultimaHa > 0 && <> · HA sem espaço: {ultimaHa}</>}
          </div>
          <LinhaJanelas pontos={serie} />
        </>
      )}
    </div>
  );
}

export function ProgressoGeracao({ dados, terminou = false, acoes }: { dados: ProgressoGeracaoDados | null; terminou?: boolean; acoes?: AcoesGeracao }) {
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

  const ultimoCalculo = dados.etapas.map((e) => e.id).lastIndexOf("calculo"); // [PROGRESSO-MOTOR]
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
                {e.id === "calculo" && i === ultimoCalculo && dados.motor && <PainelMotor motor={dados.motor} />}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatarTempo(duracao)}</span>
            </li>
          );
        })}
      </ol>
      {acoes && !terminou && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={acoes.onParar}
            disabled={acoes.parando || !(dados.motor && dados.motor.solucoes.length > 0)}
            title={dados.motor && dados.motor.solucoes.length > 0 ? "O motor para agora e o NexGrade salva a melhor grade encontrada até aqui." : "Disponível quando o motor encontrar a primeira grade."}
          >
            {acoes.parando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Square className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
            {acoes.parando ? "Parando e salvando…" : "Parar e usar a melhor até agora"}
          </Button>
          <Button size="sm" variant="ghost" onClick={acoes.onCancelar} disabled={acoes.parando}>
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Cancelar sem salvar
          </Button>
        </div>
      )}
    </div>
  );
}
