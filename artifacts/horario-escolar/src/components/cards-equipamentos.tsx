import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Edit, Loader2, Plus } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useEhGestorReservas } from "@/lib/papeis";

// [RECURSOS-CONFIG] (17/10/2026) Equipamentos contados por unidade (carrinho de tablets) aparecem na tela
// de Salas, no mesmo estilo dos cards de sala. Gestor de reservas nao altera.
// [RECURSOS-CADASTRO] (20/10/2026) a coordenacao cadastra outros equipamentos por quantidade
// (notebooks, kits, caixas de som...), renomeia, muda o total e desativa/reativa.
type RecursoConfig = { id: number; nome: string; quantidadeTotal: number; ativo?: boolean };
const CHAVE = ["recursos-config"] as const;

function DialogEquipamento({ recurso, aberto, onFechar }: { recurso: RecursoConfig | null; aberto: boolean; onFechar: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const novo = !recurso;
  const [nome, setNome] = useState("");
  const [total, setTotal] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setNome(recurso?.nome ?? "");
    setTotal(recurso ? String(recurso.quantidadeTotal) : "");
  }, [aberto, recurso]);

  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: CHAVE });
    queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
  };

  async function enviar(corpo: Record<string, unknown>, titulo: string) {
    setSalvando(true);
    try {
      await customFetch(novo ? "/api/recursos" : `/api/recursos/${recurso!.id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        responseType: "json",
      });
      atualizar();
      toast({ title: titulo });
      onFechar();
    } catch (err: any) {
      toast({ title: "Não foi possível salvar", description: err?.data?.error ?? "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    const quantidadeTotal = Number(total);
    if (nome.trim().length < 2) {
      toast({ title: "Informe o nome do equipamento", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(quantidadeTotal) || quantidadeTotal < 1 || quantidadeTotal > 500) {
      toast({ title: "Quantidade inválida", description: "Informe um número inteiro de 1 a 500.", variant: "destructive" });
      return;
    }
    if (novo) return void enviar({ nome: nome.trim(), quantidadeTotal }, `${nome.trim()} cadastrado`);
    const corpo: Record<string, unknown> = {};
    if (nome.trim() !== recurso!.nome) corpo.nome = nome.trim();
    if (quantidadeTotal !== recurso!.quantidadeTotal) corpo.quantidadeTotal = quantidadeTotal;
    if (Object.keys(corpo).length === 0) return onFechar();
    void enviar(corpo, `${nome.trim()} atualizado`);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{novo ? "Novo equipamento" : `Editar ${recurso!.nome}`}</DialogTitle>
          <DialogDescription>
            Equipamento contado por unidade: em cada aula, vários professores reservam uma quantidade, até o total. Ex.: tablets, notebooks, kits de robótica.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="equip-nome">Nome</Label>
            <Input id="equip-nome" placeholder="Ex.: Notebooks" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equip-total">Quantidade total</Label>
            <Input id="equip-total" type="number" inputMode="numeric" min={1} max={500} placeholder="Ex.: 30" value={total} onChange={(e) => setTotal(e.target.value)} />
            {!novo && <p className="text-xs text-muted-foreground">Para diminuir, não pode haver reservas futuras acima do novo total.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {!novo ? (
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => void enviar({ ativo: recurso!.ativo === false }, recurso!.ativo === false ? `${recurso!.nome} reativado` : `${recurso!.nome} desativado`)}
            >
              {recurso!.ativo === false ? "Reativar" : "Desativar"}
            </Button>
          ) : <span />}
          <Button type="button" disabled={salvando} onClick={salvar}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : novo ? "Cadastrar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardEquipamento({ recurso, onEditar }: { recurso: RecursoConfig; onEditar: () => void }) {
  const inativo = recurso.ativo === false;
  return (
    <Card data-testid={`card-equipamento-${recurso.id}`} className={inativo ? "opacity-60" : undefined}>
      <CardContent className="pt-6 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> {recurso.nome}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline">Equipamento por quantidade</Badge>
              {inativo && <Badge variant="secondary">Desativado</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onEditar} title="Editar" aria-label={`Editar ${recurso.nome}`}>
            <Edit className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Total: {recurso.quantidadeTotal} unidades por aula</p>
      </CardContent>
    </Card>
  );
}

export function CardsEquipamentos({ busca = "" }: { busca?: string }) {
  const ehGestor = useEhGestorReservas();
  const [editando, setEditando] = useState<RecursoConfig | null>(null);
  const [aberto, setAberto] = useState(false);
  const { data: recursos } = useQuery({
    queryKey: CHAVE,
    queryFn: () => customFetch<RecursoConfig[]>("/api/recursos?todos=1", { responseType: "json" }),
    enabled: !ehGestor,
  });
  if (ehGestor || !recursos) return null;
  const termo = busca.trim().toLowerCase();
  const visiveis = recursos
    .filter((r) => !termo || r.nome.toLowerCase().includes(termo))
    .sort((a, b) => Number(a.ativo === false) - Number(b.ativo === false) || a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Equipamentos por quantidade</h2>
        <Button variant="outline" size="sm" onClick={() => { setEditando(null); setAberto(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo equipamento
        </Button>
      </div>
      {visiveis.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visiveis.map((r) => <CardEquipamento key={r.id} recurso={r} onEditar={() => { setEditando(r); setAberto(true); }} />)}
        </div>
      )}
      <DialogEquipamento recurso={editando} aberto={aberto} onFechar={() => setAberto(false)} />
    </section>
  );
}
