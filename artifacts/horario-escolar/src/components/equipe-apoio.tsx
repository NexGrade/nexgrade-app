// [EQUIPE-APOIO] (12/11/2026) Cadastro da equipe de apoio que assina o Ponto Diário (pedagogos, PAEE,
// intérpretes, PAC e Sala de Recursos). Ficam fora do cadastro de professores: não entram na grade,
// na hora-atividade nem no arquivo do RCO. Na folha saem num bloco depois dos professores, nos dias e
// turnos marcados aqui. API: /api/pedagogia/equipe-apoio.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mensagemErro } from "@/lib/presenca";

type Turno = "matutino" | "vespertino" | "noturno";
type Expediente = { dia: number; turno: Turno };
type Pessoa = { id: number; nome: string; funcao: string; complemento: string | null; expediente: Expediente[] };
type Lista = { pessoas: Pessoa[]; migracaoPendente: boolean };

const URL_API = "/api/pedagogia/equipe-apoio";
const FUNCOES: Array<{ valor: string; rotulo: string }> = [
  { valor: "pedagogo", rotulo: "Pedagogia" },
  { valor: "paee", rotulo: "PAEE" },
  { valor: "interprete", rotulo: "Intérprete" },
  { valor: "pac", rotulo: "PAC" },
  { valor: "sala_recursos", rotulo: "Sala de Recursos" },
];
const ROTULO_FUNCAO = Object.fromEntries(FUNCOES.map((f) => [f.valor, f.rotulo]));
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNOS: Array<{ valor: Turno; rotulo: string }> = [
  { valor: "matutino", rotulo: "Manhã" },
  { valor: "vespertino", rotulo: "Tarde" },
  { valor: "noturno", rotulo: "Noite" },
];

/** "Manhã: seg a sex · Tarde: ter, qui" */
function resumoExpediente(exp: Expediente[]): string {
  return TURNOS.map((t) => {
    const dias = exp.filter((e) => e.turno === t.valor).map((e) => e.dia).sort();
    if (!dias.length) return null;
    const texto = dias.length === 5 ? "seg a sex" : dias.map((d) => DIAS[d]!.toLowerCase()).join(", ");
    return `${t.rotulo}: ${texto}`;
  }).filter(Boolean).join(" · ");
}

type Form = { id?: number; nome: string; funcao: string; complemento: string; expediente: Set<string> };
const chave = (dia: number, turno: string) => `${dia}|${turno}`;
const formVazio = (): Form => ({ nome: "", funcao: "pedagogo", complemento: "", expediente: new Set() });

export function CardEquipeApoio() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: [URL_API], queryFn: () => customFetch<Lista>(URL_API) });
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const pessoas = data?.pessoas ?? [];

  const abrir = (p?: Pessoa) => setForm(p
    ? { id: p.id, nome: p.nome, funcao: p.funcao, complemento: p.complemento ?? "", expediente: new Set(p.expediente.map((e) => chave(e.dia, e.turno))) }
    : formVazio());

  const alternar = (k: string) => setForm((f) => {
    if (!f) return f;
    const s = new Set(f.expediente);
    if (s.has(k)) s.delete(k); else s.add(k);
    return { ...f, expediente: s };
  });
  // clicar no nome do turno marca ou desmarca a semana inteira nesse turno
  const alternarTurno = (turno: Turno) => setForm((f) => {
    if (!f) return f;
    const s = new Set(f.expediente);
    const todos = DIAS.every((_, d) => s.has(chave(d, turno)));
    DIAS.forEach((_, d) => (todos ? s.delete(chave(d, turno)) : s.add(chave(d, turno))));
    return { ...f, expediente: s };
  });

  const salvar = async () => {
    if (!form) return;
    setSalvando(true);
    try {
      const expediente = [...form.expediente].map((k) => { const [d, t] = k.split("|"); return { dia: Number(d), turno: t }; });
      const corpo = JSON.stringify({ nome: form.nome, funcao: form.funcao, complemento: form.complemento, expediente });
      await customFetch(form.id ? `${URL_API}/${form.id}` : URL_API, { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: corpo });
      await qc.invalidateQueries({ queryKey: [URL_API] });
      toast({ title: form.id ? "Cadastro atualizado" : "Pessoa cadastrada", description: form.nome });
      setForm(null);
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: mensagemErro(e), variant: "destructive" });
    } finally { setSalvando(false); }
  };

  const remover = async (p: Pessoa) => {
    if (!window.confirm(`Tirar ${p.nome} da equipe de apoio? Ela deixa de sair no Ponto Diário.`)) return;
    setRemovendo(p.id);
    try {
      await customFetch(`${URL_API}/${p.id}`, { method: "DELETE", responseType: "json" } as never);
      await qc.invalidateQueries({ queryKey: [URL_API] });
    } catch (e) {
      toast({ title: "Não foi possível remover", description: mensagemErro(e), variant: "destructive" });
    } finally { setRemovendo(null); }
  };

  const podeSalvar = !!form && form.nome.trim().length > 0 && form.expediente.size > 0 && !salvando;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UsersRound className="w-4 h-4" /> Equipe de apoio no ponto</CardTitle>
        <CardDescription>
          Pedagogos, PAEE, intérpretes, PAC e Sala de Recursos que assinam o Ponto Diário. Saem no fim da folha, depois dos professores, nos dias e turnos marcados aqui.
          Quem também dá aula continua no cadastro de professores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.migracaoPendente && (
          <p className="text-sm text-amber-700 dark:text-amber-400">Este cadastro ainda não está disponível: falta atualizar o banco de dados. Avise o suporte do NexGrade.</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</p>
        ) : pessoas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém cadastrado. A folha sai só com os professores.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {pessoas.map((p) => (
              <li key={p.id} className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROTULO_FUNCAO[p.funcao] ?? p.funcao}{p.complemento ? ` · ${p.complemento}` : ""} · {resumoExpediente(p.expediente)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Editar ${p.nome}`} onClick={() => abrir(p)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={`Remover ${p.nome}`} disabled={removendo === p.id} onClick={() => remover(p)}>
                  {removendo === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" disabled={!!data?.migracaoPendente} onClick={() => abrir()}><Plus className="w-4 h-4 mr-2" /> Cadastrar pessoa</Button>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(aberto) => { if (!aberto) setForm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar cadastro" : "Cadastrar na equipe de apoio"}</DialogTitle>
            <DialogDescription>Marque os dias e turnos em que a pessoa assina o ponto.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="equipe-nome">Nome</Label>
                <Input id="equipe-nome" value={form.nome} maxLength={120} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Função</Label>
                  <Select value={form.funcao} onValueChange={(v) => setForm({ ...form, funcao: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FUNCOES.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="equipe-complemento">Complemento (opcional)</Label>
                  <Input id="equipe-complemento" placeholder="ex.: 2ºA" value={form.complemento} maxLength={40} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dias e turnos</Label>
                <div className="overflow-x-auto">
                  <table className="text-sm">
                    <thead>
                      <tr>
                        <th />
                        {DIAS.map((d) => <th key={d} className="px-2 py-1 font-medium text-muted-foreground">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {TURNOS.map((t) => (
                        <tr key={t.valor}>
                          <td className="pr-2 py-1">
                            <button type="button" className="underline-offset-2 hover:underline" title="Marcar ou desmarcar a semana inteira" onClick={() => alternarTurno(t.valor)}>{t.rotulo}</button>
                          </td>
                          {DIAS.map((d, i) => (
                            <td key={d} className="px-2 py-1 text-center">
                              <Checkbox aria-label={`${t.rotulo}, ${d}`} checked={form.expediente.has(chave(i, t.valor))} onCheckedChange={() => alternar(chave(i, t.valor))} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">Clique no nome do turno para marcar a semana inteira.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={!podeSalvar} onClick={salvar}>{salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
