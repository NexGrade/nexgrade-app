// [CATALOGO] Aba "Catalogo SEED-PR": os cursos do catalogo oficial (e os proprios da escola),
// com a caixa "Ofertado" -- so os ofertados aparecem na aba Cursos e na criacao de turmas.
// [CATALOGO-SOB-DEMANDA] (28/10/2026) o catalogo nao e mais importado inteiro: ao marcar um
// curso, entram so ele, as matrizes e as disciplinas dele. Desmarcar so desliga (nada e apagado).
// [CATALOGO-SALVAR] (28/10/2026) marcar/desmarcar so muda na tela; grava tudo no botao "Salvar".
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getListCursosQueryKey, getListDisciplinasQueryKey, customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Save, Search, Undo2 } from "lucide-react";

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

type ItemCatalogo = {
  chave: string | null; // null = curso proprio da escola (fora do catalogo)
  cursoId: number | null;
  nome: string; nivel: string; codigoCurso: string | null; formaOferta: string | null;
  ofertado: boolean; series?: string[];
};
const CHAVE_CATALOGO = ["/matrizes-oficiais/catalogo-cursos"];

export default function CatalogoSeed() {
  const { data, isLoading } = useQuery({
    queryKey: CHAVE_CATALOGO,
    queryFn: () => customFetch<{ modelos: ItemCatalogo[]; proprios: ItemCatalogo[] }>("/api/matrizes-oficiais/catalogo-cursos", { responseType: "json" } as any),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState("todos");
  const [soOfertados, setSoOfertados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendentes, setPendentes] = useState<Record<string, boolean>>({}); // id -> ofertado desejado

  const todos = useMemo<ItemCatalogo[]>(
    () => [...(data?.modelos ?? []), ...(data?.proprios ?? []).map((p) => ({ ...p, chave: null }))],
    [data],
  );
  const idDe = (c: ItemCatalogo) => c.chave ?? `curso-${c.cursoId}`;
  const desejado = (c: ItemCatalogo) => pendentes[idDe(c)] ?? c.ofertado;
  const alterados = todos.filter((c) => pendentes[idDe(c)] !== undefined && pendentes[idDe(c)] !== c.ofertado);
  const totalOfertados = todos.filter((c) => desejado(c)).length;
  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    return todos
      .filter((c) => (nivel === "todos" || c.nivel === nivel) && (!soOfertados || c.ofertado || desejado(c)) && (!b || semAcento(c.nome).includes(b)))
      .sort((a, z) => Number(z.ofertado) - Number(a.ofertado) || String(a.nome).localeCompare(String(z.nome), "pt-BR"));
  }, [todos, busca, nivel, soOfertados, pendentes]);

  function alternar(c: ItemCatalogo) {
    const id = idDe(c);
    setPendentes((p) => {
      const novo = { ...p };
      const valor = !(p[id] ?? c.ofertado);
      if (valor === c.ofertado) delete novo[id]; else novo[id] = valor;
      return novo;
    });
  }

  async function gravar(c: ItemCatalogo, ofertar: boolean): Promise<string | null> {
    if (ofertar && c.chave) {
      // traz (ou religa) o curso do catalogo com as matrizes e disciplinas dele
      const r = await customFetch<any>("/api/matrizes-oficiais/catalogo-cursos/ofertar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: c.chave }),
        responseType: "json",
      } as any);
      return c.cursoId == null ? `${c.nome}: ${r?.matrizesCriadas ?? 0} matriz(es), ${r?.disciplinasCriadas ?? 0} disciplina(s) nova(s)` : null;
    }
    await customFetch<any>(`/api/matrizes-oficiais/cursos/${c.cursoId}/ofertado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ofertado: ofertar }),
      responseType: "json",
    } as any);
    return null;
  }

  async function salvar() {
    setSalvando(true);
    const detalhes: string[] = [];
    let erros = 0;
    for (const c of alterados) {
      try {
        const d = await gravar(c, !c.ofertado);
        if (d) detalhes.push(d);
        setPendentes((p) => { const n = { ...p }; delete n[idDe(c)]; return n; });
      } catch (err: any) {
        erros++;
        toast({ title: `Não foi possível salvar: ${c.nome}`, description: err?.data?.error ?? "Tente novamente.", variant: "destructive" });
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CHAVE_CATALOGO }),
      queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ["/matrizes-oficiais/disciplinas-em-uso"] }),
    ]);
    setSalvando(false);
    if (erros === 0) toast({ title: "Cursos salvos", description: detalhes.join(" · ") || "Oferta dos cursos atualizada." });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="font-medium">Catálogo oficial SEED-PR</p>
          <p className="text-sm text-muted-foreground">
            Marque os cursos que a escola <strong>oferece</strong> e clique em <strong>Salvar</strong>. Ao salvar, entram só o curso, as matrizes e as disciplinas dele.
            Desmarcar apenas tira o curso da aba Cursos e da criação de turmas (nada é apagado).
            {todos.length > 0 && <> · <strong>{totalOfertados}</strong> curso(s) ofertado(s)</>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {alterados.length > 0 && (
            <Button variant="outline" onClick={() => setPendentes({})} disabled={salvando}>
              <Undo2 className="h-4 w-4 mr-2" /> Descartar
            </Button>
          )}
          <Button onClick={salvar} disabled={salvando || alterados.length === 0}>
            <Save className="h-4 w-4 mr-2" />
            {salvando ? "Salvando..." : alterados.length > 0 ? `Salvar (${alterados.length})` : "Salvo"}
          </Button>
        </div>
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
      ) : lista.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-muted-foreground">Nenhum curso encontrado com esses filtros.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {lista.map((c) => {
            const ofertado = desejado(c);
            const id = idDe(c);
            const mudou = ofertado !== c.ofertado;
            return (
              <label key={id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 ${ofertado ? "" : "opacity-70"} ${mudou ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <Checkbox checked={ofertado} disabled={salvando} onCheckedChange={() => alternar(c)} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${ofertado ? "font-medium" : ""}`}>{c.nome}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-[11px]">{NOME_NIVEL[c.nivel] ?? c.nivel}</Badge>
                    {c.formaOferta && <Badge variant="outline" className="text-[11px]">{NOME_FORMA[c.formaOferta] ?? c.formaOferta}</Badge>}
                    {c.codigoCurso && <Badge variant="outline" className="text-[11px]">código {c.codigoCurso}</Badge>}
                    {c.chave === null && <Badge variant="secondary" className="text-[11px]">curso da escola</Badge>}
                  </div>
                </div>
                <span className={`text-xs font-medium ${mudou ? "text-amber-700" : ofertado ? "text-primary" : "text-muted-foreground"}`}>
                  {mudou ? (ofertado ? "Ofertar (não salvo)" : "Tirar oferta (não salvo)") : ofertado ? "Ofertado" : "Não ofertado"}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
