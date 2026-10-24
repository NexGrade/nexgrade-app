import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery as useQueryOcupacao, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarioUI } from "@/components/ui/calendar"; // [CALENDARIO-RESERVA]
import { ptBR as ptBRCalendario } from "react-day-picker/locale"; // [CALENDARIO-RESERVA]
import { format as formatarDataCal } from "date-fns"; // [CALENDARIO-RESERVA]
import { Loader2, Plus } from "lucide-react";
import {
  customFetch as customFetchOcupacao,
  getGetMinhaAgendaReservasQueryKey,
  useGetMinhaAgendaReservas,
  useListSalas,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ehSalaTablets } from "@/lib/reservas-formato"; // tablets agora vao por quantidade (passo proprio)

// [NOVA-RESERVA-COMPARTILHADA] (17/10/2026) A mesma "Nova reserva" serve ao professor (Minha Agenda,
// passa pela aprovacao) e ao gestor de reservas (portal: escolhe o professor, ja nasce confirmada).

function diaSemanaDaData(dataISO: string): number {
  // dataISO no formato YYYY-MM-DD. getUTCDay(): 0=domingo..6=sabado.
  // Convertido para 0=segunda..4=sexta (mesma convencao do backend).
  const d = new Date(`${dataISO}T00:00:00Z`);
  const dow = d.getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

// [RECURSOS-TABLETS] (17/10/2026) Reserva de tablets: secao propria, por QUANTIDADE (carrinho com
// total fixo), sem escolher espaco. Confirma na hora; varios professores na mesma aula ate o total.
export type ReservaTablet = { id: number; data: string; diaSemana: number; numeroAula: number; turno: string; quantidade: number; titulo: string; observacoes: string | null; status: string; recursoNome: string };
type OcupacaoRecursosResp = { data: string; recursos: Array<{ id: number; nome: string; total: number; ocupacao: Array<{ numeroAula: number; turno: string; reservadas: number; bloqueadas?: number }> }> };
export const CHAVE_TABLETS = ["reservas-tablets"] as const;

export function useReservasTablets(enabled: boolean) {
  return useQueryOcupacao({
    queryKey: CHAVE_TABLETS,
    queryFn: () => customFetchOcupacao<ReservaTablet[]>("/api/minha-agenda/recursos/reservas", { responseType: "json" }),
    enabled,
  });
}

// [RESERVA-LOTE] (17/10/2026) Nova reserva: dia, periodo (turno) e as aulas daquele turno com o
// horario; pode escolher varias aulas e varios espacos (cada espaco com as suas aulas) num pedido so.
// So aparecem para escolher as aulas do proprio professor (a reserva e para a aula dele).
const NOME_PERIODO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ORDEM_PERIODO = ["matutino", "vespertino", "noturno"];
type ItemReserva = { salaId: number; numerosAula: number[] };
type OcupacaoDiaResp = { data: string; maxAula: number; ocupacao: Array<{ salaId: number; numeroAula: number; status: string; turno: string | null; motivo?: string }> };

// fora do componente: definido dentro dele, o campo de texto perdia o foco a cada letra
function Passo({ n, titulo: t, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1565C0] text-[11px] text-white">{n}</span>
        {t}
      </h3>
      {children}
    </section>
  );
}

type ProfessorOpcao = { id: number; nome: string; ativo?: boolean | null };

// [RESERVA-GESTOR-GRADE] (24/10/2026) Depois de escolher o professor, o gestor ve a grade da semana
// dele (turma em cada aula). Clicar numa aula ja escolhe o proximo dia com essa aula, o periodo e a aula.
const DIAS_GRADE = ["Seg", "Ter", "Qua", "Qui", "Sex"];
function GradeDoProfessor({ aulas, horarios, dataSel, turnoSel, aulasSel, onEscolher }: {
  aulas: Array<{ diaSemana: number; numeroAula: number; turno: string; turmaNome: string; disciplinaNome: string }>;
  horarios: Array<{ turno: string; numeroAula: number; horaInicio: string }>;
  dataSel: string; turnoSel: string | null; aulasSel: number[];
  onEscolher: (diaSemana: number, turno: string, numeroAula: number) => void;
}) {
  const turnos = ORDEM_PERIODO.filter((t) => aulas.some((a) => a.turno === t));
  if (!turnos.length) return <p className="text-sm text-muted-foreground">Este professor não tem aulas na grade oficial.</p>;
  const diaSel = /^\d{4}-\d{2}-\d{2}$/.test(dataSel) ? diaSemanaDaData(dataSel) : -1;
  return (
    <div className="space-y-3">
      {turnos.map((t) => {
        const nums = [...new Set([...horarios.filter((h) => h.turno === t).map((h) => h.numeroAula), ...aulas.filter((a) => a.turno === t).map((a) => a.numeroAula)])].sort((x, y) => x - y);
        return (
          <div key={t} className="overflow-x-auto">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{NOME_PERIODO[t] ?? t}</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-12 border bg-muted/50 px-1 py-0.5 text-left font-medium">Aula</th>
                  {DIAS_GRADE.map((d) => <th key={d} className="border bg-muted/50 px-1 py-0.5 font-medium">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {nums.map((n) => {
                  const hora = horarios.find((h) => h.turno === t && h.numeroAula === n)?.horaInicio?.slice(0, 5) ?? "";
                  return (
                    <tr key={n}>
                      <td className="border px-1 py-0.5 tabular-nums text-muted-foreground">{n}ª{hora ? <span className="block text-[10px]">{hora}</span> : null}</td>
                      {DIAS_GRADE.map((_, d) => {
                        const a = aulas.find((x) => x.turno === t && x.diaSemana === d && x.numeroAula === n);
                        if (!a) return <td key={d} className="border bg-muted/20" />;
                        const marcada = d === diaSel && turnoSel === t && aulasSel.includes(n);
                        return (
                          <td key={d} className="border p-0">
                            <button
                              type="button"
                              onClick={() => onEscolher(d, t, n)}
                              title={`${a.turmaNome} · ${a.disciplinaNome} — reservar nesta aula`}
                              className={`block w-full px-1 py-1 text-center font-medium transition-colors ${marcada ? "bg-[#1565C0] text-white" : "bg-[#E3F2FD] text-[#0D47A1] hover:bg-[#BBDEFB]"}`}
                            >
                              {a.turmaNome}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Clique numa aula para reservar no próximo dia em que ela acontece, ou escolha a data no calendário abaixo.</p>
    </div>
  );
}

// proxima data (a partir de hoje, ou da semana da data ja escolhida) que cai no dia da semana pedido
function proximaDataDoDia(diaSemana: number, base: string): string {
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(base) && base >= hojeISO ? base : hojeISO;
  const d = new Date(`${ref}T12:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - (dow > 4 ? dow - 7 : dow) + diaSemana); // segunda da semana de ref (fim de semana -> proxima)
  let iso = d.toISOString().slice(0, 10);
  if (iso < hojeISO) { d.setUTCDate(d.getUTCDate() + 7); iso = d.toISOString().slice(0, 10); }
  return iso;
}


// [QUADRO-SEMANA] (24/10/2026) abrir ja preenchido a partir de uma celula do quadro da semana
export type PreenchimentoReserva = { data: string; turno: string; numeroAula: number; salaId?: number };

export function NovaReservaDialog({ modo = "professor", professores = [], aoCriar, abrirCom = null, aoFechar, semBotao = false }: {
  modo?: "professor" | "gestor"; professores?: ProfessorOpcao[]; aoCriar?: () => void;
  abrirCom?: PreenchimentoReserva | null; aoFechar?: () => void; semBotao?: boolean;
}) {
  const gestor = modo === "gestor";
  const BASE = gestor ? "/api/reservas/gestor" : "/api/minha-agenda";
  const off = gestor ? 1 : 0; // no gestor o passo 1 e escolher o professor
  const [professorSel, setProfessorSel] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: salas } = useListSalas();
  const { data: minhasReservas } = useGetMinhaAgendaReservas({ query: { queryKey: getGetMinhaAgendaReservasQueryKey(), enabled: !gestor } }); // [RESERVA-NO-CALENDARIO]
  const { data: minhasReservasTablets } = useReservasTablets(!gestor); // [RECURSOS-TABLETS]
  // grade do professor: o logado (Minha Agenda) ou o escolhido pelo gestor
  const { data: dadosHorarioApi } = useQueryOcupacao({
    queryKey: ["horario-reserva", modo, professorSel],
    queryFn: () => customFetchOcupacao<unknown>(`${BASE}/horario${gestor ? `?professorId=${professorSel}` : ""}`, { responseType: "json" }),
    enabled: !gestor || professorSel > 0,
  });
  // a API devolve tambem turno e horarios (fora do tipo gerado)
  const dadosHorario = dadosHorarioApi as unknown as {
    aulas: Array<{ diaSemana: number; numeroAula: number; turno: string; turmaNome: string; disciplinaNome: string }>;
    horarios: Array<{ turno: string; numeroAula: number; horaInicio: string }>;
  } | undefined;

  const [data, setData] = useState("");
  const [turno, setTurno] = useState<string | null>(null);
  const [aulasSel, setAulasSel] = useState<number[]>([]);
  const [salaAtual, setSalaAtual] = useState(0);
  const [itens, setItens] = useState<ItemReserva[]>([]);
  const [titulo, setTitulo] = useState("");
  const [tituloEditado, setTituloEditado] = useState(false); // [RESERVA-LOTE] enquanto nao editar, preenche com turma e disciplina
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  // [RECURSOS-TABLETS] passo opcional: quantidade de tablets por aula (carrinho com total fixo, sem espaco)
  const [quantidade, setQuantidade] = useState("");
  // [RESERVA-EQUIPAMENTOS] (20/10/2026) qualquer equipamento por quantidade (nao so tablets):
  // o escolhido agora e a lista de "equipamento + aula + quantidade" do pedido
  const [recursoAtualId, setRecursoAtualId] = useState(0);
  const [equip, setEquip] = useState<Array<{ recursoId: number; numeroAula: number; quantidade: number }>>([]);

  const limpar = () => { setProfessorSel(0); setData(""); setTurno(null); setAulasSel([]); setSalaAtual(0); setItens([]); setTitulo(""); setTituloEditado(false); setObservacoes(""); setQuantidade(""); setEquip([]); setRecursoAtualId(0); };
  // [QUADRO-SEMANA] celula escolhida no quadro: abre com dia, periodo, aula e espaco
  const preenchido = useRef<PreenchimentoReserva | null>(null);
  useEffect(() => {
    if (!abrirCom) return;
    preenchido.current = abrirCom;
    setData(abrirCom.data); setTurno(abrirCom.turno); setAulasSel([abrirCom.numeroAula]); setSalaAtual(abrirCom.salaId ?? 0); setItens([]); setEquip([]);
    setOpen(true);
  }, [abrirCom]);
  const diaSemana = /^\d{4}-\d{2}-\d{2}$/.test(data) ? diaSemanaDaData(data) : -1;

  // aulas do professor no dia escolhido, por turno
  const minhasAulasDoDia = useMemo(
    () => (dadosHorario?.aulas ?? []).filter((a) => a.diaSemana === diaSemana),
    [dadosHorario, diaSemana],
  );
  const turnosDoDia = ORDEM_PERIODO.filter((t) => minhasAulasDoDia.some((a) => a.turno === t));
  // so um periodo com aula no dia: ja escolhe e mostra as aulas
  const unicoTurno = turnosDoDia.length === 1 ? turnosDoDia[0]! : null;
  useEffect(() => { if (data && !turno && unicoTurno) setTurno(unicoTurno); }, [data, turno, unicoTurno]);
  const horariosDoTurno = useMemo(() => {
    if (!turno) return [];
    const nums = new Set<number>([
      ...(dadosHorario?.horarios ?? []).filter((h) => h.turno === turno).map((h) => h.numeroAula),
      ...minhasAulasDoDia.filter((a) => a.turno === turno).map((a) => a.numeroAula),
    ]);
    return [...nums].sort((x, y) => x - y).map((n) => ({
      numeroAula: n,
      hora: (dadosHorario?.horarios ?? []).find((h) => h.turno === turno && h.numeroAula === n)?.horaInicio?.slice(0, 5) ?? "",
      aula: minhasAulasDoDia.find((a) => a.turno === turno && a.numeroAula === n) ?? null,
    }));
  }, [turno, dadosHorario, minhasAulasDoDia]);

  const { data: ocupacao } = useQueryOcupacao({
    queryKey: ["ocupacao-salas", data],
    queryFn: () => customFetchOcupacao<OcupacaoDiaResp>(`${BASE}/ocupacao?data=` + encodeURIComponent(data), { responseType: "json" }),
    enabled: diaSemana >= 0 && diaSemana <= 4,
  });
  // [BLOQUEIOS] "bloqueada" (manutencao, limpeza...) tem prioridade sobre reserva na mesma aula
  const linhasSala = (salaId: number, numeroAula: number) =>
    ocupacao?.ocupacao.filter((o) => o.salaId === salaId && o.numeroAula === numeroAula && (!o.turno || o.turno === turno)) ?? [];
  const statusSala = (salaId: number, numeroAula: number) => {
    const l = linhasSala(salaId, numeroAula);
    return l.find((o) => o.status === "bloqueada")?.status ?? l[0]?.status ?? null;
  };
  const motivoBloqueio = (salaId: number, numeroAula: number) => linhasSala(salaId, numeroAula).find((o) => o.status === "bloqueada")?.motivo ?? "";

  const { data: ocupacaoRecursos } = useQueryOcupacao({
    queryKey: ["ocupacao-recursos", data],
    queryFn: () => customFetchOcupacao<OcupacaoRecursosResp>(`${BASE}/recursos/ocupacao?data=` + encodeURIComponent(data), { responseType: "json" }),
    enabled: diaSemana >= 0 && diaSemana <= 4,
  });
  const listaRecursos = ocupacaoRecursos?.recursos ?? [];
  const recurso = listaRecursos.find((r) => r.id === recursoAtualId) ?? listaRecursos[0] ?? null;
  const nomeRecurso = (id: number) => listaRecursos.find((r) => r.id === id)?.nome ?? "Equipamento";
  const restamTablets = (numeroAula: number) =>
    recurso ? Math.max(0, recurso.total - recurso.ocupacao.filter((o) => o.numeroAula === numeroAula && o.turno === turno).reduce((n, o) => n + o.reservadas + (o.bloqueadas ?? 0), 0)) : 0; // [BLOQUEIOS] bloqueadas saem do saldo
  const menorSaldo = aulasSel.length ? Math.min(...aulasSel.map(restamTablets)) : (recurso?.total ?? 0);
  const qtd = Number(quantidade);
  const qtdValida = Number.isInteger(qtd) && qtd >= 1 && qtd <= menorSaldo;
  const comTablets = quantidade !== "" && aulasSel.length > 0;
  const podeAddTablets = comTablets && qtdValida;

  // [RESERVA-VARIOS-ESPACOS] a mesma aula pode ir para outro espaco (turma dividida);
  // so fica travada a aula que ja esta na lista PARA O ESPACO escolhido agora
  const espacosDaAula = (n: number) => itens.filter((i) => i.numerosAula.includes(n)).map((i) => i.salaId);
  const ocupadasNaSala = salaAtual ? aulasSel.filter((n) => statusSala(salaAtual, n) === "confirmada" || statusSala(salaAtual, n) === "bloqueada") : [];
  const bloqueadasNaSala = salaAtual ? ocupadasNaSala.filter((n) => statusSala(salaAtual, n) === "bloqueada") : []; // [BLOQUEIOS]
  const podeAddSala = salaAtual > 0 && aulasSel.length > 0 && ocupadasNaSala.length === 0;
  // o botao serve para espaco, tablets ou os dois juntos (as mesmas aulas marcadas)
  const podeAdicionar = (podeAddSala || (salaAtual === 0 && podeAddTablets)) && (quantidade === "" || qtdValida);
  const nomeSala = (id: number) => salas?.find((s) => s.id === id)?.nome ?? "Espaço";
  // [ESPACO-SO-LIVRES] espacos ocupados (confirmada) ou bloqueados em alguma aula marcada saem da lista;
  // "em análise" (pendente) continua, marcado. O espaco ja escolhido fica sempre (aviso abaixo do campo).
  const espacosAtivos = (salas ?? []).filter((s) => s.ativa !== false && !ehSalaTablets(s.nome));
  const espacosParaEscolher = aulasSel.length === 0
    ? espacosAtivos
    : espacosAtivos.filter((s) => s.id === salaAtual || aulasSel.every((n) => { const st = statusSala(s.id, n); return st !== "confirmada" && st !== "bloqueada"; }));
  const espacosOcultos = espacosAtivos.length - espacosParaEscolher.length;
  const rotuloAula = (n: number) => {
    const h = horariosDoTurno.find((x) => x.numeroAula === n);
    return `${n}ª${h?.hora ? ` (${h.hora})` : ""}`;
  };

  function adicionar() {
    if (!podeAdicionar) return;
    if (podeAddSala) {
      setItens((l) => {
        const ja = l.find((i) => i.salaId === salaAtual);
        if (ja) return l.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])].sort((x, y) => x - y) } : i));
        return [...l, { salaId: salaAtual, numerosAula: [...aulasSel].sort((x, y) => x - y) }];
      });
    }
    if (podeAddTablets && recurso) setEquip((l) => [...l.filter((e) => !(e.recursoId === recurso.id && aulasSel.includes(e.numeroAula))), ...aulasSel.map((n) => ({ recursoId: recurso.id, numeroAula: n, quantidade: qtd }))]);
    setAulasSel([]);
    setSalaAtual(0);
    setQuantidade("");
  }

  const itensFinais: ItemReserva[] = podeAddSala
    ? (() => {
        const ja = itens.find((i) => i.salaId === salaAtual);
        return ja
          ? itens.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])] } : i))
          : [...itens, { salaId: salaAtual, numerosAula: aulasSel }];
      })()
    : itens;
  const totalAulas = itensFinais.reduce((n, i) => n + i.numerosAula.length, 0);
  // equipamentos que vao no pedido: os da lista mais a selecao atual, se estiver valida
  const equipFinais = podeAddTablets && recurso
    ? [...equip.filter((e) => !(e.recursoId === recurso.id && aulasSel.includes(e.numeroAula))), ...aulasSel.map((n) => ({ recursoId: recurso.id, numeroAula: n, quantidade: qtd }))]
    : equip;
  const aulasComTablets = [...new Set(equipFinais.map((e) => e.numeroAula))].sort((x, y) => x - y);
  const nomeTablets = (recurso?.nome ?? "Equipamento").toLowerCase();
  // turma e disciplina das aulas escolhidas (vem da grade do professor no dia)
  const aulaDe = (n: number) => horariosDoTurno.find((x) => x.numeroAula === n)?.aula ?? null;
  const descreverAulas = (nums: number[]) =>
    [...new Set(nums.map(aulaDe).filter((a): a is NonNullable<typeof a> => !!a).map((a) => `${a.disciplinaNome} · ${a.turmaNome}`))].join("; ");
  const tituloAuto = descreverAulas([...new Set([...itensFinais.flatMap((i) => i.numerosAula), ...aulasComTablets])]);
  useEffect(() => { if (!tituloEditado) setTitulo(tituloAuto); }, [tituloAuto, tituloEditado]);

  async function enviar() {
    if (!turno || !data || (totalAulas === 0 && aulasComTablets.length === 0) || !titulo.trim() || (comTablets && !qtdValida)) return;
    setEnviando(true);
    let espacosFeitos = false;
    const atualizar = () => {
      queryClient.invalidateQueries({ queryKey: getGetMinhaAgendaReservasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-salas"] });
      queryClient.invalidateQueries({ queryKey: ["quadro-semana"] }); // [QUADRO-SEMANA]
      queryClient.invalidateQueries({ queryKey: ["ocupacao-mes"] });
      queryClient.invalidateQueries({ queryKey: CHAVE_TABLETS });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
      aoCriar?.();
    };
    try {
      let r: { criadas: number; confirmadas: number; pendentes: number } | null = null;
      if (itensFinais.length > 0) {
        r = await customFetchOcupacao<{ criadas: number; confirmadas: number; pendentes: number }>(gestor ? `${BASE}/lote` : `${BASE}/reservas/lote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(gestor ? { professorId: professorSel } : {}), data, turno, itens: itensFinais, titulo: titulo.trim(), observacoes: observacoes.trim() || undefined }),
          responseType: "json",
        });
        espacosFeitos = true;
      }
      // um pedido por equipamento
      for (const recursoId of [...new Set(equipFinais.map((e) => e.recursoId))]) {
        const doRecurso = equipFinais.filter((e) => e.recursoId === recursoId).sort((x, y) => x.numeroAula - y.numeroAula);
        await customFetchOcupacao(gestor ? `${BASE}/recursos` : `${BASE}/recursos/reservas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(gestor ? { professorId: professorSel } : {}), recursoId, data, turno, itens: doRecurso.map((e) => ({ numeroAula: e.numeroAula, quantidade: e.quantidade })), titulo: titulo.trim(), observacoes: observacoes.trim() || undefined }),
          responseType: "json",
        });
      }
      atualizar();
      const textoTablets = [...new Set(equipFinais.map((e) => e.recursoId))]
        .map((id) => `${nomeRecurso(id)} confirmados (${equipFinais.filter((e) => e.recursoId === id).sort((x, y) => x.numeroAula - y.numeroAula).map((e) => `${e.numeroAula}ª aula: ${e.quantidade}`).join(", ")}).`)
        .join(" ");
      toast(r ? {
        title: r.pendentes === 0 ? (r.criadas > 1 ? `${r.criadas} reservas confirmadas` : "Reserva confirmada") : r.confirmadas === 0 ? "Solicitação enviada" : `${r.confirmadas} confirmada(s), ${r.pendentes} aguardando`,
        description: [r.pendentes > 0 ? "As reservas pendentes entraram na fila de aprovação da coordenação." : gestor ? "Reservas confirmadas e o professor foi avisado." : "Tudo certo, as reservas já estão na sua agenda.", textoTablets].filter(Boolean).join(" "),
      } : { title: new Set(equipFinais.map((e) => e.recursoId)).size === 1 ? `${nomeRecurso(equipFinais[0]!.recursoId)} reservados` : "Equipamentos reservados", description: textoTablets });
      setOpen(false);
      limpar(); preenchido.current = null; aoFechar?.();
    } catch (err: any) {
      atualizar();
      if (espacosFeitos) {
        // os espacos ja foram gravados: nao deixa tentar de novo tudo junto (daria conflito com a propria reserva)
        toast({ title: "Espaços reservados, mas os equipamentos não", description: `${err?.data?.error ?? "Não foi possível reservar os equipamentos."} Abra Nova reserva e tente só os equipamentos.`, variant: "destructive" });
        setOpen(false);
        limpar(); preenchido.current = null; aoFechar?.();
      } else {
        toast({ title: "Não foi possível reservar", description: err?.data?.error ?? "Verifique os horários e tente de novo.", variant: "destructive" });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { limpar(); preenchido.current = null; aoFechar?.(); } }}>
      {!semBotao && (
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nova reserva</span><span className="sm:hidden">Reservar</span>
        </Button>
      </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{gestor ? "Nova reserva para professor" : "Reservar espaço"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {gestor && (
            <Passo n={1} titulo="Professor">
              <Select
                value={professorSel ? String(professorSel) : undefined}
                onValueChange={(v) => {
                  setProfessorSel(Number(v)); setItens([]); setEquip([]); setQuantidade(""); setTituloEditado(false);
                  const p = preenchido.current; // [QUADRO-SEMANA] veio do quadro: mantem dia, periodo, aula e espaco
                  if (p) { setData(p.data); setTurno(p.turno); setAulasSel([p.numeroAula]); setSalaAtual(p.salaId ?? 0); }
                  else { setData(""); setTurno(null); setAulasSel([]); setSalaAtual(0); }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Para qual professor?" /></SelectTrigger>
                <SelectContent>
                  {professores.filter((p) => p.ativo !== false).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A reserva já nasce confirmada e o professor recebe um aviso. Só aparecem as aulas dele naquele dia.</p>
              {professorSel > 0 && dadosHorario && (
                <GradeDoProfessor
                  aulas={dadosHorario.aulas ?? []}
                  horarios={dadosHorario.horarios ?? []}
                  dataSel={data}
                  turnoSel={turno}
                  aulasSel={aulasSel}
                  onEscolher={(d, t, n) => {
                    const iso = proximaDataDoDia(d, data);
                    if (iso !== data || turno !== t) { setData(iso); setTurno(t); setAulasSel([n]); setItens([]); setEquip([]); return; }
                    setAulasSel((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]));
                  }}
                />
              )}
            </Passo>
          )}

          {(!gestor || professorSel > 0) && (
          <Passo n={1 + off} titulo="Dia">
            <CalendarioReserva
              base={BASE}
              diasComReserva={[...new Set([...(minhasReservas ?? []), ...(minhasReservasTablets ?? [])].map((r) => String(r.data).slice(0, 10)))]}
              salaId={salaAtual}
              value={data}
              onChange={(iso) => { setData(iso); setTurno(null); setAulasSel([]); setItens([]); }}
            />
          </Passo>
          )}

          {data && (
            <Passo n={2 + off} titulo="Período">
              {turnosDoDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">{gestor ? "Este professor não tem aula neste dia. A reserva é feita para as aulas dele: escolha outro dia." : "Você não tem aula neste dia. A reserva é feita para as suas aulas: escolha outro dia."}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ORDEM_PERIODO.map((t) => {
                    const n = minhasAulasDoDia.filter((a) => a.turno === t).length;
                    if (!n) return null;
                    const sel = turno === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTurno(t); setAulasSel([]); setItens([]); }}
                        className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${sel ? "border-[#1565C0] bg-[#1565C0] text-white" : "hover:bg-muted"}`}
                      >
                        <span className="block font-semibold">{NOME_PERIODO[t] ?? t}</span>
                        <span className={`text-xs ${sel ? "text-white/80" : "text-muted-foreground"}`}>{n} aula{n === 1 ? "" : "s"} sua{n === 1 ? "" : "s"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {turnosDoDia.length > 1 && !turno && <p className="text-xs text-muted-foreground">Toque no período para ver as suas aulas.</p>}
            </Passo>
          )}

          {turno && (
            <Passo n={3 + off} titulo="Aulas (pode marcar mais de uma)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {horariosDoTurno.map(({ numeroAula, hora, aula }) => {
                  const naLista = espacosDaAula(numeroAula);
                  const sel = aulasSel.includes(numeroAula);
                  const st = salaAtual ? statusSala(salaAtual, numeroAula) : null;
                  const desab = !aula || (salaAtual > 0 && naLista.includes(salaAtual));
                  return (
                    <button
                      key={numeroAula}
                      type="button"
                      disabled={desab}
                      onClick={() => setAulasSel((l) => (l.includes(numeroAula) ? l.filter((x) => x !== numeroAula) : [...l, numeroAula]))}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        desab ? "cursor-not-allowed bg-muted/40 text-muted-foreground/70"
                        : sel ? "border-[#1565C0] bg-[#1565C0]/10 ring-2 ring-[#1565C0]"
                        : "hover:bg-muted"}`}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="text-sm font-semibold">{numeroAula}ª aula</span>
                        {hora && <span className="tabular-nums text-muted-foreground">{hora}</span>}
                      </span>
                      {aula ? (
                        <>
                          <span className="block truncate font-medium">{aula.turmaNome}</span>
                          <span className="block truncate text-muted-foreground">{aula.disciplinaNome}</span>
                        </>
                      ) : <span className="block">{gestor ? "Sem aula dele" : "Sem aula sua"}</span>}
                      {naLista.length > 0 && (
                        <span className="mt-0.5 block truncate font-medium text-[#1565C0]" title={naLista.map(nomeSala).join(", ")}>
                          Na lista: {naLista.map(nomeSala).join(", ")}
                        </span>
                      )}
                      {sel && st === "confirmada" && <span className="block font-medium text-destructive">Espaço ocupado</span>}
                      {sel && st === "bloqueada" && <span className="block font-medium text-destructive">Espaço bloqueado{motivoBloqueio(salaAtual, numeroAula) ? ` (${motivoBloqueio(salaAtual, numeroAula)})` : ""}</span>}
                      {sel && st === "pendente" && <span className="block font-medium text-amber-700">Espaço em análise</span>}
                    </button>
                  );
                })}
              </div>
            </Passo>
          )}

          {turno && (
            <Passo n={4 + off} titulo="Espaço">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={salaAtual ? String(salaAtual) : undefined} onValueChange={(v) => setSalaAtual(Number(v))}>
                  <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Escolha o espaço" /></SelectTrigger>
                  <SelectContent>
                    {/* [ESPACO-SO-LIVRES] (24/10) com aula marcada, so os espacos livres em todas as aulas marcadas */}
                    {espacosParaEscolher.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nome}{aulasSel.some((n) => statusSala(s.id, n) === "pendente") ? " (em análise)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={adicionar} disabled={!podeAdicionar}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar à lista
                </Button>
              </div>
              {salaAtual > 0 && aulasSel.length > 0 && (
                <p className={`text-xs ${ocupadasNaSala.length ? "text-destructive" : "text-muted-foreground"}`}>
                  {ocupadasNaSala.length
                    ? bloqueadasNaSala.length
                      ? `${nomeSala(salaAtual)} está bloqueado na ${bloqueadasNaSala.map(rotuloAula).join(", ")} aula${motivoBloqueio(salaAtual, bloqueadasNaSala[0]!) ? ` (${motivoBloqueio(salaAtual, bloqueadasNaSala[0]!)})` : ""}. Desmarque essa aula ou escolha outro espaço.`
                      : `${nomeSala(salaAtual)} já está reservado na ${ocupadasNaSala.map(rotuloAula).join(", ")} aula. Desmarque essa aula ou escolha outro espaço.`
                    : `${nomeSala(salaAtual)}: ${aulasSel.sort((x, y) => x - y).map((n) => `${rotuloAula(n)} ${statusSala(salaAtual, n) === "pendente" ? "em análise" : "livre"}`).join(" · ")}`}
                </p>
              )}
              {aulasSel.length > 0 && (
                <p className="text-xs text-muted-foreground">{/* [ESPACO-SO-LIVRES] */}
                  {espacosParaEscolher.length === 0
                    ? "Nenhum espaço livre nas aulas marcadas. Desmarque alguma aula ou escolha outro dia."
                    : `Aparecem só os espaços livres nas aulas marcadas (${espacosParaEscolher.length}${espacosOcultos > 0 ? `; ${espacosOcultos} ocupado${espacosOcultos > 1 ? "s" : ""} ou bloqueado${espacosOcultos > 1 ? "s" : ""}` : ""}).`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Precisa de outro espaço? Adicione à lista e escolha o próximo, nas mesmas aulas (turma dividida) ou em outras. Só precisa de equipamento (tablets etc.)? Deixe o espaço em branco e use o passo dos equipamentos.</p>
            </Passo>
          )}

          {turno && recurso && (
            <Passo n={5 + off} titulo={listaRecursos.length > 1 ? "Equipamentos (opcional)" : `${recurso.nome} (opcional)`}>
              {listaRecursos.length > 1 && (
                <Select value={String(recurso.id)} onValueChange={(v) => { setRecursoAtualId(Number(v)); setQuantidade(""); }}>
                  <SelectTrigger aria-label="Equipamento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {listaRecursos.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.nome} ({r.total})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="space-y-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(menorSaldo, 1)}
                  placeholder={`${recurso.nome} (opcional): quantos?`}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
                <p className={`text-xs ${comTablets && !qtdValida ? "text-destructive" : "text-muted-foreground"}`}>
                  {aulasSel.length === 0
                    ? `Marque as aulas acima. A escola tem ${recurso.total} (${nomeTablets}).`
                    : comTablets && !qtdValida
                      ? menorSaldo < 1 ? `Não há ${nomeTablets} livres nessas aulas.` : `Informe de 1 a ${menorSaldo}.`
                      : `Livres nas aulas marcadas: ${menorSaldo} de ${recurso.total}. Você leva para a sua sala; confirma na hora.`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Entra no pedido ao solicitar. Para mais de um equipamento, ou espaço e equipamento em aulas diferentes, use &quot;Adicionar à lista&quot; a cada vez.</p>
            </Passo>
          )}

          {(itens.length > 0 || equip.length > 0) && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Na lista</p>
              <ul className="space-y-1">
                {itens.map((i) => (
                  <li key={i.salaId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <strong>{nomeSala(i.salaId)}</strong> · {i.numerosAula.map(rotuloAula).join(", ")} aula
                      <span className="block text-xs text-muted-foreground">{descreverAulas(i.numerosAula)}</span>
                    </span>
                    <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setItens((l) => l.filter((x) => x.salaId !== i.salaId))}>Tirar</button>
                  </li>
                ))}
                {[...new Set(equip.map((e) => `${e.recursoId}|${e.quantidade}`))].map((chave) => {
                  const [rid, q] = chave.split("|").map(Number) as [number, number];
                  const aulasQ = equip.filter((e) => e.recursoId === rid && e.quantidade === q).map((e) => e.numeroAula).sort((x, y) => x - y);
                  return (
                    <li key={`equip-${chave}`} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <strong>{nomeRecurso(rid)}</strong> · {q} {q === 1 ? "unidade" : "unidades"} · {aulasQ.map(rotuloAula).join(", ")} aula
                      </span>
                      <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setEquip((l) => l.filter((e) => !(e.recursoId === rid && e.quantidade === q)))}>Tirar</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {turno && (
            <Passo n={6 + off} titulo="Objetivo">
              <Input placeholder="Ex.: Prova, Aula prática..." value={titulo} onChange={(e) => { setTitulo(e.target.value); setTituloEditado(true); }} />
              <p className="text-xs text-muted-foreground">Turma e disciplina já vêm da sua grade. Pode completar, ex.: &quot;Prova&quot;, &quot;Aula prática&quot;.</p>
              <Textarea placeholder="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </Passo>
          )}

          <Button type="button" className="w-full" disabled={enviando || (gestor && !professorSel) || !turno || (totalAulas === 0 && aulasComTablets.length === 0) || !titulo.trim() || (comTablets && !qtdValida)} onClick={() => void enviar()}>
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {totalAulas === 0 ? (new Set(equipFinais.map((e) => e.recursoId)).size === 1 ? `Reservar ${nomeRecurso(equipFinais[0]!.recursoId).toLowerCase()}` : "Reservar equipamentos") : aulasComTablets.length > 0 ? "Solicitar reservas" : totalAulas > 1 ? `Solicitar ${totalAulas} reservas` : "Solicitar reserva"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// [CALENDARIO-RESERVA] calendario do mes com a ocupacao do espaco escolhido.
// verde = livre | ambar = parcialmente ocupado | cinza = lotado (nao escolhe).
// Dias passados e fins de semana desabilitados. Sem nomes de quem reservou.
type OcupacaoMesResp = { mes: string; maxAula: number; dias: Record<string, { confirmadas: number; pendentes: number }> };

function CalendarioReserva({ base, salaId, value, onChange, diasComReserva = [] }: { base: string; salaId: number; value: string; onChange: (iso: string) => void; diasComReserva?: string[] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const selecionada = /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : undefined;
  const [mesVisivel, setMesVisivel] = useState<Date>(selecionada ?? hoje);
  const mesISO = formatarDataCal(mesVisivel, "yyyy-MM");
  const { data: oc } = useQueryOcupacao({
    queryKey: ["ocupacao-mes", base, salaId, mesISO],
    queryFn: () => customFetchOcupacao<OcupacaoMesResp>(
      base + "/ocupacao-mes?salaId=" + salaId + "&mes=" + mesISO,
      { responseType: "json" },
    ),
    enabled: salaId > 0,
  });

  const livre: Date[] = [];
  const parcial: Date[] = [];
  const lotado: Date[] = [];
  if (oc) {
    const ano = mesVisivel.getFullYear();
    const mes = mesVisivel.getMonth();
    const total = new Date(ano, mes + 1, 0).getDate();
    for (let d = 1; d <= total; d++) {
      const dia = new Date(ano, mes, d);
      const dow = dia.getDay();
      if (dow === 0 || dow === 6 || dia < hoje) continue;
      const info = oc.dias[formatarDataCal(dia, "yyyy-MM-dd")];
      if (!info || info.confirmadas + info.pendentes === 0) livre.push(dia);
      else if (info.confirmadas >= oc.maxAula) lotado.push(dia);
      else parcial.push(dia);
    }
  }

  return (
    <div className="space-y-2">
      <CalendarioUI
        mode="single"
        locale={ptBRCalendario}
        selected={selecionada}
        onSelect={(d) => { if (d) onChange(formatarDataCal(d, "yyyy-MM-dd")); }}
        month={mesVisivel}
        onMonthChange={setMesVisivel}
        disabled={[{ before: hoje }, { dayOfWeek: [0, 6] }, ...lotado]}
        modifiers={{ livre, parcial, lotado, minhaReserva: diasComReserva.map((iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))) }}
        modifiersClassNames={{
          // [RESERVA-NO-CALENDARIO] dia em que o professor ja tem reserva: sublinhado azul
          minhaReserva: "[&>button]:font-bold [&>button]:underline [&>button]:decoration-[#1565C0] [&>button]:decoration-2 [&>button]:underline-offset-4",
          livre: "[&>button]:bg-emerald-50 [&>button]:text-emerald-800",
          parcial: "[&>button]:bg-amber-100 [&>button]:text-amber-900",
          lotado: "[&>button]:bg-muted [&>button]:text-muted-foreground [&>button]:line-through",
        }}
        className="rounded-md border"
      />
      {salaId > 0 ? (
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" /> Livre</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" /> Algumas aulas reservadas</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-muted ring-1 ring-border" /> Lotado</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Depois de escolher o espaço, os dias ficam coloridos com a ocupação dele.</p>
      )}
      {diasComReserva.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-bold text-foreground underline decoration-[#1565C0] decoration-2 underline-offset-4">12</span> dia em que você já tem reserva
        </p>
      )}
    </div>
  );
}
