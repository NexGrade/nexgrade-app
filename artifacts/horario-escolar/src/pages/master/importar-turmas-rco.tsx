// [IMPORTAR-TURMAS-RCO] (31/10/2026) Painel Master: criar as turmas de uma escola nova a partir do
// arquivo do RCO que ela enviou (o que antes era lib/db/importar-turmas-do-rco.cjs no terminal).
// Primeiro a prévia (não grava); só grava com "Aplicar" confirmado.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListEscolasMasterQueryKey, getGetMasterMetricsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

type TurmaNaPrevia = {
  rco: string; codigoSere: number; codigoSereIf: number | null; nome: string; turno: string; serie: string;
  disciplinas: number; aulas: number; espanholaFora: number; jaExiste: boolean;
};
type DisciplinaNaPrevia = {
  codigo: number; nomeRco: string; disciplinaId: number | null; nome: string;
  como: "codigo externo" | "SAE" | "nome" | "nova"; gravarCodigo: boolean; sigla: string | null;
};
type Previa = {
  ano: number; comEspanhola: boolean; espanholaNoArquivo: boolean;
  turmas: TurmaNaPrevia[]; puladas: string[]; fora: string[]; repetidos: string[];
  disciplinas: DisciplinaNaPrevia[]; avisos: string[];
  resumo: { turmasNovas: number; vinculos: number; disciplinasNovas: number; codigosAGravar: number };
  bloqueio: string | null;
  arquivo: { nomeArquivo: string; enviadoEm: string | null };
};

const TURNOS = [["matutino", "Manhã"], ["vespertino", "Tarde"], ["noturno", "Noite"]] as const;
const COMO: Record<DisciplinaNaPrevia["como"], string> = { "codigo externo": "Código Externo", SAE: "SAE", nome: "nome", nova: "nova" };
const erroDe = (err: unknown) => {
  const e = err as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? "Tente novamente.";
};

export function ImportarTurmasRcoDialog({ escola, onOpenChange }: { escola: { id: string; nome: string }; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [comEspanhola, setComEspanhola] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const url = "/api/master/escolas/" + encodeURIComponent(escola.id) + "/arquivo-rco/importar-turmas";

  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: [url, ano, comEspanhola],
    queryFn: () => customFetch<Previa>(url + `?ano=${ano}&comEspanhola=${comEspanhola ? 1 : 0}`, { responseType: "json" } as any),
    enabled: ano >= 2020 && ano <= 2100,
    retry: false,
  });

  async function aplicar() {
    if (!p) return;
    const r = p.resumo;
    if (!window.confirm(
      `Gravar em ${escola.nome} (ano letivo ${ano})?\n\n` +
      `• ${r.turmasNovas} turma(s) nova(s), ${r.vinculos} vínculos turma × disciplina\n` +
      `• ${r.disciplinasNovas} disciplina(s) nova(s), ${r.codigosAGravar} Código(s) Externo(s) gravado(s) em disciplinas da escola\n` +
      (p.comEspanhola ? "• com Língua Espanhola\n" : "") +
      `\nNão mexe em professores, grade nem em turmas que já existem.`)) return;
    setAplicando(true);
    try {
      const res = await customFetch<{ mensagem?: string }>(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano, comEspanhola }), responseType: "json",
      } as any);
      toast({ title: "Turmas importadas do RCO", description: res?.mensagem });
      queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMasterMetricsQueryKey() });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Não foi possível importar", description: erroDe(err), variant: "destructive" });
      refetch();
    } finally {
      setAplicando(false);
    }
  }

  const novas = p?.disciplinas.filter((d) => d.disciplinaId == null) ?? [];
  const ligadas = p?.disciplinas.filter((d) => d.disciplinaId != null) ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar turmas do arquivo do RCO — {escola.nome}</DialogTitle>
          <DialogDescription>
            Cria uma turma por turma do RCO (com código SERE e a parte IF do 3º ano na mesma turma) e as disciplinas de cada uma com as aulas por semana do arquivo.
            Nada é gravado até você clicar em Aplicar. Professores, grade e turmas que já existem não são alterados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-4 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="imp-ano">Ano letivo das turmas</Label>
            <Input id="imp-ano" type="number" className="h-8 w-28" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={comEspanhola} onCheckedChange={setComEspanhola} />
            <span>
              Incluir Língua Espanhola
              <span className="block text-xs text-muted-foreground">Optativa; fica de fora se desligado.{p && !p.espanholaNoArquivo ? " (Este arquivo não tem Espanhola.)" : ""}</span>
            </span>
          </label>
          {p && <p className="ml-auto text-xs text-muted-foreground">Arquivo: {p.arquivo.nomeArquivo}{p.arquivo.enviadoEm ? ` · enviado em ${new Date(p.arquivo.enviadoEm).toLocaleString("pt-BR")}` : ""}</p>}
        </div>

        {isLoading && <div className="space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40 w-full" /></div>}
        {error && <p className="text-sm text-destructive">{erroDe(error)}</p>}

        {p && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{p.resumo.turmasNovas} turma(s) nova(s)</Badge>
              <Badge variant="secondary">{p.resumo.vinculos} vínculos turma × disciplina</Badge>
              <Badge variant="secondary">{p.resumo.disciplinasNovas} disciplina(s) nova(s)</Badge>
              <Badge variant="secondary">{p.resumo.codigosAGravar} Código(s) Externo(s) a gravar</Badge>
            </div>

            {(p.avisos.length > 0 || p.repetidos.length > 0) && (
              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> Atenção (impede o Aplicar)</p>
                {p.repetidos.length > 0 && <p>Nomes repetidos no mesmo turno: {p.repetidos.join(", ")}</p>}
                <ul className="list-disc pl-5">{p.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Turmas</p>
              {TURNOS.map(([turno, rotulo]) => {
                const l = p.turmas.filter((t) => t.turno === turno);
                if (!l.length) return null;
                return (
                  <div key={turno}>
                    <p className="font-medium">{rotulo} ({l.length})</p>
                    <ul className="mt-1 space-y-0.5">
                      {l.map((t) => (
                        <li key={t.codigoSere} className={t.jaExiste ? "text-muted-foreground line-through" : undefined}>
                          <span className="inline-block w-16 font-medium">{t.nome}</span>
                          <span className="inline-block w-20">{t.serie}</span>
                          SERE {t.codigoSere}{t.codigoSereIf ? ` / IF ${t.codigoSereIf}` : ""} · {t.disciplinas} disciplinas, {t.aulas} aulas/semana
                          <span className="text-xs text-muted-foreground"> ({t.rco})</span>
                          {t.espanholaFora > 0 && <span className="text-xs text-amber-700"> · Espanhola {t.espanholaFora} fora</span>}
                          {t.jaExiste && <span className="text-xs no-underline"> · já existe, será pulada</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {p.puladas.length > 0 && <p className="text-xs text-muted-foreground">Já existem e serão puladas: {p.puladas.join(", ")}</p>}
            </section>

            {p.fora.length > 0 && (
              <section className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fora desta importação ({p.fora.length})</p>
                <ul className="list-disc pl-5 text-muted-foreground">{p.fora.map((f) => <li key={f}>{f}</li>)}</ul>
              </section>
            )}

            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disciplinas ligadas a disciplinas da escola ({ligadas.length})</p>
              <ul className="space-y-0.5">
                {ligadas.map((d) => (
                  <li key={d.codigo}>
                    <span className="inline-block w-14 text-muted-foreground">{d.codigo}</span>
                    {d.nomeRco} → <span className="font-medium">{d.nome}</span> <span className="text-xs text-muted-foreground">#{d.disciplinaId} (por {COMO[d.como]})</span>
                    {d.gravarCodigo && <span className="text-xs text-emerald-700"> + Código Externo</span>}
                  </li>
                ))}
              </ul>
            </section>

            {novas.length > 0 && (
              <section className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disciplinas novas ({novas.length})</p>
                <ul className="space-y-0.5">
                  {novas.map((d) => (
                    <li key={d.codigo}>
                      <span className="inline-block w-14 text-muted-foreground">{d.codigo}</span>
                      {d.nomeRco} → <span className="font-medium">{d.nome}</span> <span className="text-xs text-muted-foreground">sigla {d.sigla}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-xs text-muted-foreground">
              Depois de importar, a padronização de nome/sigla das disciplinas que vieram do catálogo e a limpeza do que não é usado continuam pelo script padronizar-disciplinas.cjs.
            </p>
          </div>
        )}

        <DialogFooter className="items-center gap-2">
          {p?.bloqueio && <p className="mr-auto text-sm text-amber-800">{p.bloqueio}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={aplicar} disabled={!p || !!p.bloqueio || aplicando || isLoading}>
            {aplicando ? "Gravando..." : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
