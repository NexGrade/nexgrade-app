// [CONFIRMAR-NEXGRADE] (27/11/2026) Janela de confirmacao do proprio NexGrade, no lugar do confirm() do navegador
// (pedido da dona: as janelas do navegador destoavam do sistema, assustavam no celular e travavam testes e gravacoes).
//
// Uso:  const confirmar = useConfirmar();
//       if (!(await confirmar({ titulo: "Descartar o rascunho?", texto: "...", confirmar: "Descartar", perigo: true }))) return;
// Tambem aceita so o texto (como o confirm antigo): await confirmar("Remover a logo da escola?")
// O texto respeita quebras de linha ("\n") e linhas com "• " viram lista.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type OpcoesConfirmar = {
  /** titulo curto em negrito; sem ele, a primeira linha do texto vira titulo */
  titulo?: string;
  texto?: string;
  /** rotulo do botao que confirma (padrao "Continuar") */
  confirmar?: string;
  /** rotulo do botao que cancela (padrao "Cancelar") */
  cancelar?: string;
  /** acao que apaga ou nao tem volta: botao vermelho */
  perigo?: boolean;
};

type Pendente = OpcoesConfirmar & { resolver: (ok: boolean) => void };
const Ctx = createContext<((o: OpcoesConfirmar | string) => Promise<boolean>) | null>(null);

/** Separa "titulo" e "texto" quando so veio uma frase longa (como no confirm antigo). */
function normalizar(o: OpcoesConfirmar | string): OpcoesConfirmar {
  if (typeof o !== "string") return o;
  const partes = o.split(/\n\n/);
  return partes.length > 1 ? { titulo: partes[0], texto: partes.slice(1).join("\n\n") } : { titulo: o };
}

function Texto({ texto }: { texto: string }) {
  const blocos = texto.split(/\n\n/);
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      {blocos.map((b, i) => {
        const linhas = b.split("\n").filter((l) => l.trim());
        const lista = linhas.length > 0 && linhas.every((l) => /^\s*[•-]\s/.test(l));
        return lista ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">{linhas.map((l, j) => <li key={j}>{l.replace(/^\s*[•-]\s/, "")}</li>)}</ul>
        ) : (
          <p key={i} className="whitespace-pre-line">{b}</p>
        );
      })}
    </div>
  );
}

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const resolvido = useRef(false);
  const confirmar = useCallback((o: OpcoesConfirmar | string) => new Promise<boolean>((resolver) => {
    resolvido.current = false;
    setPendente({ ...normalizar(o), resolver });
  }), []);
  const fechar = (ok: boolean) => {
    if (pendente && !resolvido.current) { resolvido.current = true; pendente.resolver(ok); }
    setPendente(null);
  };
  return (
    <Ctx.Provider value={confirmar}>
      {children}
      <AlertDialog open={!!pendente} onOpenChange={(aberto) => { if (!aberto) fechar(false); }}>
        <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base leading-snug">{pendente?.titulo ?? "Confirmar"}</AlertDialogTitle>
            {pendente?.texto && <AlertDialogDescription asChild><div><Texto texto={pendente.texto} /></div></AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => fechar(false)}>{pendente?.cancelar ?? "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(pendente?.perigo && "bg-red-600 text-white hover:bg-red-700")}
              onClick={() => fechar(true)}
            >
              {pendente?.confirmar ?? "Continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

/** Devolve `confirmar(opcoes)`, que abre a janela e resolve true (confirmou) ou false (cancelou/fechou). */
export function useConfirmar() {
  const c = useContext(Ctx);
  // fora do provider (nao deveria acontecer): cai no confirm do navegador para nunca travar a acao
  return c ?? ((o: OpcoesConfirmar | string) => {
    const n = normalizar(o);
    return Promise.resolve(window.confirm([n.titulo, n.texto].filter(Boolean).join("\n\n")));
  });
}
