import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Loader2, Tablet } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEhGestorReservas } from "@/lib/papeis";

// [RECURSOS-CONFIG] (17/10/2026) Equipamentos contados por unidade (carrinho de tablets) aparecem na tela
// de Salas, no mesmo estilo dos cards de sala; o botao de editar ajusta o total. Gestor de reservas nao altera.
type RecursoConfig = { id: number; nome: string; quantidadeTotal: number };

function CardEquipamento({ recurso }: { recurso: RecursoConfig }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(String(recurso.quantidadeTotal));
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setValor(String(recurso.quantidadeTotal)); }, [recurso.quantidadeTotal, aberto]);

  async function salvar() {
    const quantidadeTotal = Number(valor);
    if (!Number.isInteger(quantidadeTotal) || quantidadeTotal < 1 || quantidadeTotal > 500) {
      toast({ title: "Quantidade inválida", description: "Informe um número inteiro de 1 a 500.", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      await customFetch(`/api/recursos/${recurso.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidadeTotal }),
        responseType: "json",
      });
      queryClient.invalidateQueries({ queryKey: ["recursos-config"] });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
      toast({ title: `${recurso.nome}: total atualizado`, description: `Agora são ${quantidadeTotal} unidades por aula.` });
      setAberto(false);
    } catch (err: any) {
      toast({ title: "Não foi possível alterar", description: err?.data?.error ?? "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Card data-testid={`card-equipamento-${recurso.id}`}>
        <CardContent className="pt-6 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2"><Tablet className="h-4 w-4 text-primary" /> {recurso.nome}</h3>
              <Badge variant="outline" className="mt-1">Equipamento por quantidade</Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setAberto(true)} title="Editar total" aria-label={`Editar total de ${recurso.nome}`}>
              <Edit className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Total: {recurso.quantidadeTotal} unidades por aula</p>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {recurso.nome}</DialogTitle>
            <DialogDescription>
              Quantas unidades a escola tem. Em cada aula, os professores reservam até esse total. Para diminuir, não pode haver reservas futuras acima do novo total.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input type="number" inputMode="numeric" min={1} max={500} value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Total de ${recurso.nome}`} />
            <Button type="button" disabled={salvando || valor === String(recurso.quantidadeTotal)} onClick={() => void salvar()}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CardsEquipamentos({ busca = "" }: { busca?: string }) {
  const ehGestor = useEhGestorReservas();
  const { data: recursos } = useQuery({
    queryKey: ["recursos-config"],
    queryFn: () => customFetch<RecursoConfig[]>("/api/recursos", { responseType: "json" }),
    enabled: !ehGestor,
  });
  if (ehGestor || !recursos) return null;
  const termo = busca.trim().toLowerCase();
  const visiveis = recursos.filter((r) => !termo || r.nome.toLowerCase().includes(termo));
  if (visiveis.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {visiveis.map((r) => <CardEquipamento key={r.id} recurso={r} />)}
    </div>
  );
}
