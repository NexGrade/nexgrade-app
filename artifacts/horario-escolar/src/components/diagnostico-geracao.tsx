import { AlertTriangle, Lightbulb, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// [DIAGNOSTICO-GERACAO] (01/11/2026) Quadro "Por que não gerou": o que está errado e como corrigir, montado no
// servidor (api-server/src/lib/diagnostico-geracao.ts). Antes a tela mostrava so a frase do erro num aviso que sumia.

export type ProblemaGeracao = { oQue: string; sugestao?: string };
export type DiagnosticoGeracao = { titulo: string; resumo?: string; problemas: ProblemaGeracao[]; avisos: ProblemaGeracao[] };

/** O diagnostico que veio numa resposta (sucesso ou erro da API). */
export function diagnosticoDe(valor: unknown): DiagnosticoGeracao | null {
  const v = valor as { diagnostico?: DiagnosticoGeracao; data?: { diagnostico?: DiagnosticoGeracao } } | null;
  const d = v?.diagnostico ?? v?.data?.diagnostico;
  return d && Array.isArray(d.problemas) && Array.isArray(d.avisos) ? d : null;
}

function Item({ p, tipo }: { p: ProblemaGeracao; tipo: "problema" | "aviso" }) {
  return (
    <li className={`rounded-md border p-2.5 text-sm ${tipo === "problema" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-2">
        {tipo === "problema"
          ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
        <span className={tipo === "problema" ? "text-red-900" : "text-amber-900"}>{p.oQue}</span>
      </div>
      {p.sugestao && (
        <div className="mt-1.5 flex items-start gap-2 pl-6 text-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><span className="font-medium">Como corrigir:</span> {p.sugestao}</span>
        </div>
      )}
    </li>
  );
}

export function DiagnosticoGeracaoDialog({ diagnostico, onClose }: { diagnostico: DiagnosticoGeracao | null; onClose: () => void }) {
  return (
    <Dialog open={!!diagnostico} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {diagnostico && (
          <>
            <DialogHeader>
              <DialogTitle>{diagnostico.titulo}</DialogTitle>
              {diagnostico.resumo && <DialogDescription>{diagnostico.resumo}</DialogDescription>}
            </DialogHeader>
            {diagnostico.problemas.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold">O que está errado</h4>
                <ul className="space-y-1.5">{diagnostico.problemas.map((p, i) => <Item key={`p${i}`} p={p} tipo="problema" />)}</ul>
              </div>
            )}
            {diagnostico.avisos.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold">{diagnostico.problemas.length ? "Também vale conferir" : "Avisos"}</h4>
                <ul className="space-y-1.5">{diagnostico.avisos.map((p, i) => <Item key={`a${i}`} p={p} tipo="aviso" />)}</ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Entendi</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
