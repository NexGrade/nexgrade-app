// [CATALOGO] Aba "Catalogo SEED-PR": todos os cursos da escola (inclusive os do
// catalogo oficial), com a caixa "Ofertado" -- so os ofertados aparecem na aba
// Cursos e na criacao de turmas. Importa o catalogo oficial com um clique.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListCursos, getListCursosQueryKey, customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Download, Search } from "lucide-react";

const NIVEIS = [
  { v: "todos", l: "Todos" },
  { v: "fundamental", l: "Fundamental" },
  { v: "medio", l: "Médio" },
  { v: "tecnico", l: "Técnico" },
  { v: "normal_magisterio", l: "Formação de Docentes" },
];
const NOME_NIVEL: Record<string, string> = {
  fundamental: "Fundamental", medio: "Médio", tecnico: "Técnico", normal_magisterio: "Formação de Docentes",
};
const NOME_FORMA: Record<string, string> = {
  integrada: "Integrada", concomitante_intercomplementar: "Concomitante/Intercomplementar",
};
function semAcento(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function CatalogoSeed() {
  const { data: cursos, isLoading } = useListCursos();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState("todos");
  const [soOfertados, setSoOfertados] = useState(false);
  const [importando, setImportando] = useState(false);
  const [salvando, setSalvando] = useState<number | null>(null);

  const todos = (cursos ?? []) as any[];
  const totalOfertados = todos.filter((c) => c.ofertado !== false).length;
  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    return todos
      .filter((c) => (nivel === "todos" || c.nivel === nivel) && (!soOfertados || c.ofertado !== false) && (!b || semAcento(c.nome).includes(b)))
      .sort((a, z) => Number(z.ofertado !== false) - Number(a.ofertado !== false) || String(a.nome).localeCompare(String(z.nome), "pt-BR"));
  }, [todos, busca, nivel, soOfertados]);

  async function importar() {
    setImportando(true);
    try {
      const r = await customFetch<any>("/api/matrizes-oficiais/semear", { method: "POST", responseType: "json" } as any);
      toast({
        title: "Catálogo oficial importado",
        description: `${r?.cursosCriados ?? 0} cursos, ${r?.matrizesCriadas ?? 0} matrizes e ${r?.disciplinasCriadas ?? 0} disciplinas novas. Marque os cursos que a escola oferece.`,
      });
      queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
    } catch (err: any) {
      toast({ title: "Não foi possível importar", description: err?.data?.error ?? (err instanceof Error ? err.message : "Tente novamente."), variant: "destructive" });
    } finally {
      setImportando(false);
    }
  }

  async function alternar(c: any) {
    setSalvando(c.id);
    try {
      await customFetch<any>(`/api/matrizes-oficiais/cursos/${c.id}/ofertado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofertado: c.ofertado === false }),
        responseType: "json",
      } as any);
      await queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
    } catch (err: any) {
      toast({ title: "Não foi possível salvar", description: err?.data?.error ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="font-medium">Catálogo oficial SEED-PR</p>
          <p className="text-sm text-muted-foreground">
            Marque os cursos que a escola <strong>oferece</strong>. Só eles aparecem na aba Cursos e na criação de turmas.
            {todos.length > 0 && <> · <strong>{totalOfertados}</strong> de {todos.length} cursos ofertados</>}
          </p>
        </div>
        <Button onClick={importar} disabled={importando} variant={todos.length === 0 ? "default" : "outline"} className="shrink-0">
          <Download className="h-4 w-4 mr-2" />
          {importando ? "Importando..." : "Importar catálogo oficial SEED-PR"}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar curso..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {NIVEIS.map((n) => (
            <Button key={n.v} type="button" size="sm" variant={nivel === n.v ? "default" : "outline"} onClick={() => setNivel(n.v)}>
              {n.l}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer">
          <Checkbox checked={soOfertados} onCheckedChange={(v) => setSoOfertados(v === true)} />
          Só ofertados
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : todos.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-muted-foreground">
          Nenhum curso ainda. Clique em <strong>Importar catálogo oficial SEED-PR</strong> para trazer todos os cursos e matrizes oficiais.
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-muted-foreground">Nenhum curso encontrado com esses filtros.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {lista.map((c) => {
            const ofertado = c.ofertado !== false;
            return (
              <label key={c.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 ${ofertado ? "" : "opacity-70"}`}>
                <Checkbox checked={ofertado} disabled={salvando === c.id} onCheckedChange={() => alternar(c)} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${ofertado ? "font-medium" : ""}`}>{c.nome}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-[11px]">{NOME_NIVEL[c.nivel] ?? c.nivel}</Badge>
                    {c.formaOferta && <Badge variant="outline" className="text-[11px]">{NOME_FORMA[c.formaOferta] ?? c.formaOferta}</Badge>}
                    {c.codigoCurso && <Badge variant="outline" className="text-[11px]">código {c.codigoCurso}</Badge>}
                  </div>
                </div>
                <span className={`text-xs font-medium ${ofertado ? "text-primary" : "text-muted-foreground"}`}>{ofertado ? "Ofertado" : "Não ofertado"}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
