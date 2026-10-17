import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tablet } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEhGestorReservas } from "@/lib/papeis";

// [RECURSOS-CONFIG] (17/10/2026) A coordenacao ajusta o total de equipamentos contados por unidade
// (carrinho de tablets). O gestor de reservas nao ve este botao: ele so reserva.
type RecursoConfig = { id: number; nome: string; quantidadeTotal: number };

export function BotaoConfigurarTablets() {
  const ehGestor = useEhGestorReservas();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [salvando, setSalvando] = useState<number | null>(null);
  const { data: recursos, isLoading } = useQuery({
    queryKey: ["recursos-config"],
    queryFn: () => customFetch<RecursoConfig[]>("/api/recursos", { responseType: "json" }),
    enabled: !ehGestor && aberto,
  });
  useEffect(() => {
    if (recursos) setValores(Object.fromEntries(recursos.map((r) => [r.id, String(r.quantidadeTotal)])));
  }, [recursos]);
  if (ehGestor) return null;

  async function salvar(r: RecursoConfig) {
    const quantidadeTotal = Number(valores[r.id]);
    if (!Number.isInteger(quantidadeTotal) || quantidadeTotal < 1 || quantidadeTotal > 500) {
      toast({ title: "Quantidade inválida", description: "Informe um número inteiro de 1 a 500.", variant: "destructive" });
      return;
    }
    setSalvando(r.id);
    try {
      await customFetch(`/api/recursos/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidadeTotal }),
        responseType: "json",
      });
      queryClient.invalidateQueries({ queryKey: ["recursos-config"] });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
      toast({ title: `${r.nome}: total atualizado`, description: `Agora são ${quantidadeTotal} unidades por aula.` });
    } catch (err: any) {
      toast({ title: "Não foi possível alterar", description: err?.data?.error ?? "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button data-testid="button-config-tablets" variant="outline">
          <Tablet className="mr-2 h-4 w-4" /> Tablets
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Equipamentos por quantidade</DialogTitle>
          <DialogDescription>
            Quantas unidades a escola tem. Em cada aula, os professores reservam até esse total.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !recursos || recursos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado.</p>
        ) : (
          <div className="space-y-4">
            {recursos.map((r) => (
              <div key={r.id} className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor={`total-${r.id}`}>{r.nome}</label>
                <div className="flex gap-2">
                  <Input
                    id={`total-${r.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    value={valores[r.id] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [r.id]: e.target.value }))}
                  />
                  <Button type="button" disabled={salvando === r.id || valores[r.id] === String(r.quantidadeTotal)} onClick={() => void salvar(r)}>
                    {salvando === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Total atual: {r.quantidadeTotal} unidades. Para diminuir, não pode haver reservas futuras acima do novo total.</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
