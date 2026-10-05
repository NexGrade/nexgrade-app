import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListProfessores,
  useListDisponibilidade,
  useSetDisponibilidadeLote,
  useListHorarioSlots,
  useListHorarios,
  getListDisponibilidadeQueryKey,
  getListHorariosQueryKey,
  getListHorarioSlotsQueryKey,
  useListAulasFixas, // [AULA-FIXA-DISP]
  useCriarAulaFixa,
  useDeleteAulaFixa,
  getListAulasFixasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Save, RotateCcw, Lock, CheckCircle2, Info, GraduationCap, BookOpen, Pin, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeletorBusca } from "@/components/seletor-busca";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"; // [AULA-FIXA-DISP]

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_ABREV = ["SEG", "TER", "QUA", "QUI", "SEX"];

const TURNOS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "noturno", label: "Noturno" },
] as const;

type Turno = (typeof TURNOS)[number]["value"];

type CelulaEstado = "disponivel" | "bloqueado" | "ha_obrigatoria" | "ha_fixa" | "atividade"; // [HA-FIXA] [ATIVIDADE-FORA-DE-SALA]
type CelulaState = Record<string, CelulaEstado>;

// [ATIVIDADE-FORA-DE-SALA] (05/10/2026) a escola passa a cadastrar no NexGrade
// (nao mais no Urania) as atividades fora de sala. Gravadas como bloqueio com
// "(ocupado: ROTULO)" no motivo -- o mesmo formato que Conflitos, HA, PDF e a
// tela Grade ja entendem (horario ocupado, nao janela, com o rotulo visivel).
const ATIVIDADES_SUGERIDAS = [
  { rotulo: "FORM", descricao: "Formação" },
  { rotulo: "COORD", descricao: "Coordenação" },
  { rotulo: "PAEE", descricao: "Atendimento educacional especializado" },
  { rotulo: "PAC", descricao: "PAC" },
  { rotulo: "LAB", descricao: "Laboratório" },
  { rotulo: "TEATR", descricao: "Teatro" },
  { rotulo: "REP", descricao: "Reposição" },
];
const RE_ATIVIDADE = /\(ocupado:\s*([^)]+?)\s*\)/;
function rotuloDoMotivo(motivo: string | null | undefined): string | undefined {
  const m = RE_ATIVIDADE.exec(motivo ?? "");
  return m ? m[1] : undefined;
}
function limparRotulo(r: string): string {
  return r.replace(/[()]/g, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 12);
}

function cellKey(dia: number, numeroAula: number) {
  return `${dia}-${numeroAula}`;
}

function proximoEstado(atual: CelulaEstado): CelulaEstado {
  if (atual === "disponivel") return "bloqueado";
  if (atual === "bloqueado") return "ha_obrigatoria";
  if (atual === "ha_obrigatoria") return "ha_fixa"; // [HA-FIXA]
  return "disponivel"; // ha_fixa e atividade voltam para disponivel
}

function formatHora(horaInicio: string) {
  return horaInicio.slice(0, 5);
}

export default function DisponibilidadePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [professorId, setProfessorId] = useState<string>("");
  const [turno, setTurno] = useState<Turno>("matutino");
  const [matriz, setMatriz] = useState<CelulaState>({});
  const [original, setOriginal] = useState<CelulaState>({});
  const [rotulos, setRotulos] = useState<Record<string, string>>({}); // [ATIVIDADE-FORA-DE-SALA]
  const [rotulosOriginais, setRotulosOriginais] = useState<Record<string, string>>({});
  const [modoAtividade, setModoAtividade] = useState(false);
  const [celulaAtividade, setCelulaAtividade] = useState<{ dia: number; numeroAula: number } | null>(null);
  const [rotuloEscolhido, setRotuloEscolhido] = useState("");

  // Permite chegar nesta página já com um professor pré-selecionado,
  // via link tipo /disponibilidade?professorId=42 — usado pelo botão
  // "Gerenciar disponibilidade" na tela de edição do professor, pra não
  // duplicar essa lógica em dois lugares diferentes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get("professorId");
    if (idFromUrl) setProfessorId(idFromUrl);
  }, []);

  const { data: professores = [], isLoading: carregandoProfessores } = useListProfessores();

  const { data: slots = [], isLoading: carregandoSlots } = useListHorarioSlots(
    // No matutino, sempre pede o esquema "medio_tecnico" (6 aulas) em
    // vez de "fundamental" (5 aulas) -- os 5 primeiros horarios sao
    // IDENTICOS entre os dois esquemas (07:30 a 11:05), a 6a aula
    // (11:55) e a unica exclusiva do Medio/Tecnico. Usar sempre o
    // superconjunto garante a grade completa pra qualquer professor,
    // sem precisar de um seletor de nivel nesta tela (um professor que
    // so da aula pro Fundamental simplesmente nunca marca nada na 6a
    // linha).
    { turno, nivelEnsino: turno === "matutino" ? "medio_tecnico" : undefined },
    { query: { queryKey: getListHorarioSlotsQueryKey({ turno, nivelEnsino: turno === "matutino" ? "medio_tecnico" : undefined }) } },
  );

  const slotsOrdenados = useMemo(
    () => [...slots].sort((a, b) => a.numeroAula - b.numeroAula),
    [slots],
  );

  const professorIdNum = professorId ? Number(professorId) : undefined;

  const { data: disponibilidadeRows = [], isLoading: carregandoDisponibilidade } = useListDisponibilidade(
    { professorId: professorIdNum },
    { query: { enabled: !!professorIdNum, queryKey: getListDisponibilidadeQueryKey({ professorId: professorIdNum }) } },
  );

  // [NOVO] Aulas reais do professor (de `horarios`), pra mostrar na
  // própria grade de disponibilidade quais horários ele já dá aula de
  // verdade -- só informativo, não interfere no estado editável
  // (disponível/bloqueado/HA) da célula.
  const { data: horariosProf = [], isLoading: carregandoHorarios } = useListHorarios(
    professorIdNum ? { professorId: professorIdNum } : {},
    { query: { enabled: !!professorIdNum, queryKey: getListHorariosQueryKey(professorIdNum ? { professorId: professorIdNum } : {}) } },
  );
  const horariosDoTurno = useMemo(
    () => horariosProf.filter((h: any) => h.turma?.turno === turno),
    [horariosProf, turno],
  );

  // [AULA-FIXA-DISP] Fixar aula direto na disponibilidade: grava no mesmo
  // cadastro de Aulas Fixas da aba Esquema (o CP-SAT respeita as duas origens).
  const anoLetivoAtual = new Date().getFullYear();
  const [modoFixarAula, setModoFixarAula] = useState(false);
  const [celulaFixar, setCelulaFixar] = useState<{ dia: number; numeroAula: number } | null>(null);
  const [opcaoFixar, setOpcaoFixar] = useState("");
  const { data: todasAulasFixas = [] } = useListAulasFixas(undefined, { query: { queryKey: getListAulasFixasQueryKey(undefined) } });
  const criarAulaFixa = useCriarAulaFixa();
  const apagarAulaFixa = useDeleteAulaFixa();
  const opcoesTurmaDisc = useMemo(() => {
    const m = new Map<string, { turmaId: number; disciplinaId: number; rotulo: string }>();
    for (const h of horariosDoTurno as any[]) {
      const tId = h.turmaId ?? h.turma?.id;
      const dId = h.disciplinaId ?? h.disciplina?.id;
      if (tId == null || dId == null) continue;
      m.set(`${tId}-${dId}`, { turmaId: tId, disciplinaId: dId, rotulo: `${h.turma?.nome ?? `Turma ${tId}`} — ${h.disciplina?.nome ?? `Disciplina ${dId}`}` });
    }
    return [...m.values()].sort((x, y) => x.rotulo.localeCompare(y.rotulo));
  }, [horariosDoTurno]);
  const turmaIdsDoTurno = useMemo(() => new Set(opcoesTurmaDisc.map((o) => o.turmaId)), [opcoesTurmaDisc]);
  const rotuloTurmaDisc = useMemo(() => new Map(opcoesTurmaDisc.map((o) => [`${o.turmaId}-${o.disciplinaId}`, o.rotulo])), [opcoesTurmaDisc]);
  function aulaFixaNaCelula(dia: number, numeroAula: number): any {
    return (todasAulasFixas as any[]).find((af) =>
      af.professorId === professorIdNum && af.anoLetivo === anoLetivoAtual &&
      af.diaSemana === dia && af.numeroAula === numeroAula && turmaIdsDoTurno.has(af.turmaId));
  }
  function aulaReal(dia: number, numeroAula: number) {
    return horariosDoTurno.find((h: any) => h.diaSemana === dia && h.numeroAula === numeroAula);
  }

  const salvarLote = useSetDisponibilidadeLote();

  const carregarMatriz = () => {
    const m: CelulaState = {};
    const rot: Record<string, string> = {}; // [ATIVIDADE-FORA-DE-SALA]
    slotsOrdenados.forEach((slot) => {
      DIAS.forEach((_, dia) => {
        m[cellKey(dia, slot.numeroAula)] = "disponivel";
      });
    });
    disponibilidadeRows
      .filter((r) => (r.turno ?? null) === turno)
      .forEach((r) => {
        const key = cellKey(r.diaSemana, r.horarioSlot);
        if (r.horaAtividadeObrigatoria) {
          m[key] = ((r as { motivo?: string | null }).motivo ?? "").startsWith("HA fixa") ? "ha_fixa" : "ha_obrigatoria"; // [HA-FIXA]
        } else if (!r.disponivel) {
          const rotulo = rotuloDoMotivo((r as { motivo?: string | null }).motivo); // [ATIVIDADE-FORA-DE-SALA]
          if (rotulo) { m[key] = "atividade"; rot[key] = rotulo; } else m[key] = "bloqueado";
        } else {
          m[key] = "disponivel";
        }
      });
    return { m, rot };
  };

  // [HA-CONTRATURNO-ASTERISCO] contraturno vale para o turno inteiro: se alguma
  // HA deste turno veio com contraturno=true da API, o turno e contraturno.
  const turnoEhContraturno = (disponibilidadeRows ?? []).some(
    (r) => (r.turno ?? null) === turno && r.horaAtividadeObrigatoria && (r as { contraturno?: boolean }).contraturno === true,
  );

  const matrizAtual = useMemo((): { m: CelulaState; rot: Record<string, string> } | null => {
    if (!professorIdNum || carregandoDisponibilidade || carregandoSlots) return null;
    return carregarMatriz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorIdNum, turno, disponibilidadeRows, slotsOrdenados, carregandoDisponibilidade, carregandoSlots]);

  const matrizKey = JSON.stringify(matrizAtual);
  const [ultimaMatrizKey, setUltimaMatrizKey] = useState("");
  if (matrizKey !== ultimaMatrizKey && matrizAtual && Object.keys(matrizAtual.m).length > 0) {
    setUltimaMatrizKey(matrizKey);
    setMatriz(matrizAtual.m);
    setOriginal(matrizAtual.m);
    setRotulos(matrizAtual.rot); // [ATIVIDADE-FORA-DE-SALA]
    setRotulosOriginais(matrizAtual.rot);
  }

  const professorSelecionado = professores.find((p) => String(p.id) === professorId);
  const totalBloqueios = Object.values(matriz).filter((v) => v === "bloqueado").length;
  const totalHA = Object.values(matriz).filter((v) => v === "ha_obrigatoria" || v === "ha_fixa").length; // [HA-FIXA]
  const totalAtividades = Object.values(matriz).filter((v) => v === "atividade").length; // [ATIVIDADE-FORA-DE-SALA]
  const rotuloSeAtividade = (m: CelulaState, r: Record<string, string>, key: string) => (m[key] === "atividade" ? r[key] ?? "" : "");
  const hasChanges = JSON.stringify(matriz) !== JSON.stringify(original) ||
    Object.keys(matriz).some((k) => rotuloSeAtividade(matriz, rotulos, k) !== rotuloSeAtividade(original, rotulosOriginais, k));

  const toggle = (dia: number, numeroAula: number) => {
    if (modoFixarAula) { setOpcaoFixar(""); setCelulaFixar({ dia, numeroAula }); return; } // [AULA-FIXA-DISP]
    if (modoAtividade) { setRotuloEscolhido(rotulos[cellKey(dia, numeroAula)] ?? ""); setCelulaAtividade({ dia, numeroAula }); return; } // [ATIVIDADE-FORA-DE-SALA]
    const key = cellKey(dia, numeroAula);
    const estadoAtual = matriz[key] ?? "disponivel";
    const proximo = proximoEstado(estadoAtual);
    // [NOVO] Se essa célula já tem uma aula real marcada e o próximo
    // estado seria "bloqueado", avisa antes -- bloquear um horário onde
    // o professor já dá aula de verdade gera o conflito "professor
    // indisponível" na aba Conflitos.
    const real = aulaReal(dia, numeroAula);
    if (proximo === "bloqueado" && real) {
      const turmaNome = real.turma?.nome ?? "?";
      const discNome = real.disciplina?.nome ?? "?";
      if (!confirm(`Esse horário já tem aula real marcada (${turmaNome} — ${discNome}). Bloquear aqui vai gerar um conflito de "professor indisponível" na grade. Continuar mesmo assim?`)) {
        return;
      }
    }
    setMatriz((prev) => ({ ...prev, [key]: proximo }));
  };

  // [ATIVIDADE-FORA-DE-SALA] marcar / remover atividade na celula escolhida
  const marcarAtividade = () => {
    if (!celulaAtividade) return;
    const rotulo = limparRotulo(rotuloEscolhido);
    if (!rotulo) return;
    const real = aulaReal(celulaAtividade.dia, celulaAtividade.numeroAula);
    if (real && !confirm(`Esse horário já tem aula real marcada (${real.turma?.nome ?? "?"} — ${real.disciplina?.nome ?? "?"}). Marcar uma atividade aqui vai gerar um conflito de "professor indisponível". Continuar mesmo assim?`)) return;
    const key = cellKey(celulaAtividade.dia, celulaAtividade.numeroAula);
    setMatriz((prev) => ({ ...prev, [key]: "atividade" }));
    setRotulos((prev) => ({ ...prev, [key]: rotulo }));
    setCelulaAtividade(null);
  };
  const removerAtividade = () => {
    if (!celulaAtividade) return;
    const key = cellKey(celulaAtividade.dia, celulaAtividade.numeroAula);
    setMatriz((prev) => ({ ...prev, [key]: "disponivel" }));
    setCelulaAtividade(null);
  };

  // [AULA-FIXA-DISP] fixar / soltar
  const recarregarAulasFixas = () => queryClient.invalidateQueries({ queryKey: getListAulasFixasQueryKey(undefined) });
  const fixarAulaNaCelula = () => {
    if (!celulaFixar || !professorIdNum || !opcaoFixar) return;
    const [tStr, dStr] = opcaoFixar.split("-");
    criarAulaFixa.mutate(
      { data: { turmaId: Number(tStr), disciplinaId: Number(dStr), professorId: professorIdNum, diaSemana: celulaFixar.dia, numeroAula: celulaFixar.numeroAula, anoLetivo: anoLetivoAtual } },
      {
        onSuccess: () => { toast({ title: "Aula fixada", description: "O CP-SAT vai manter esta aula neste horário." }); recarregarAulasFixas(); setCelulaFixar(null); },
        onError: (err) => toast({ title: "Não foi possível fixar a aula", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };
  const soltarAulaFixa = (id: number) => {
    apagarAulaFixa.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Aula solta", description: "O motor volta a poder mover esta aula." }); recarregarAulasFixas(); setCelulaFixar(null); },
        onError: (err) => toast({ title: "Não foi possível soltar a aula", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };
  const bloquearDia = (dia: number) => {
    setMatriz((prev) => {
      const next = { ...prev };
      slotsOrdenados.forEach((slot) => {
        next[cellKey(dia, slot.numeroAula)] = "bloqueado";
      });
      return next;
    });
  };

  const liberarDia = (dia: number) => {
    setMatriz((prev) => {
      const next = { ...prev };
      slotsOrdenados.forEach((slot) => {
        next[cellKey(dia, slot.numeroAula)] = "disponivel";
      });
      return next;
    });
  };

  const resetar = () => { setMatriz({ ...original }); setRotulos({ ...rotulosOriginais }); };

  const salvar = async () => {
    if (!professorIdNum) return;

    const chaves = new Set([...Object.keys(matriz), ...Object.keys(original)]);
    const itens: {
      diaSemana: number;
      horarioSlot: number;
      disponivel: boolean;
      turno: Turno;
      horaAtividadeObrigatoria: boolean;
      motivo?: string; // [HA-FIXA]
    }[] = [];

    chaves.forEach((key) => {
      const estadoAtual = matriz[key] ?? "disponivel";
      const estadoOriginal = original[key] ?? "disponivel";
      if (estadoAtual === estadoOriginal && rotuloSeAtividade(matriz, rotulos, key) === rotuloSeAtividade(original, rotulosOriginais, key)) return;

      const [diaStr, slotStr] = key.split("-");
      itens.push({
        diaSemana: Number(diaStr),
        horarioSlot: Number(slotStr),
        disponivel: estadoAtual !== "bloqueado" && estadoAtual !== "atividade", // [ATIVIDADE-FORA-DE-SALA]
        turno,
        horaAtividadeObrigatoria: estadoAtual === "ha_obrigatoria" || estadoAtual === "ha_fixa",
        // [HA-FIXA] motivo explicito: sem isso, trocar de fixa para HA comum
        // manteria a marca antiga no banco (o motivo omitido nao e alterado).
        // [ATIVIDADE-FORA-DE-SALA] atividade grava o rotulo; ao sair de uma atividade o
        // motivo e limpo explicitamente (senao o "(ocupado: X)" antigo ficaria no banco).
        motivo: estadoAtual === "ha_fixa" ? "HA fixa (definida manualmente)" : estadoAtual === "ha_obrigatoria" ? "HA manual (definida na tela)"
          : estadoAtual === "atividade" ? `Atividade fora de sala (ocupado: ${rotulos[key]})`
          : estadoOriginal === "atividade" ? (estadoAtual === "bloqueado" ? "Bloqueio (definido na tela)" : "")
          : undefined,
      });
    });

    if (itens.length === 0) return;

    try {
      await salvarLote.mutateAsync({ data: { professorId: professorIdNum, itens } });
      setOriginal({ ...matriz });
      setRotulosOriginais({ ...rotulos }); // [ATIVIDADE-FORA-DE-SALA]
      queryClient.invalidateQueries({ queryKey: getListDisponibilidadeQueryKey({ professorId: professorIdNum }) });
      toast({
        title: `✅ Disponibilidade de ${professorSelecionado?.nome ?? "professor"} salva!`,
        description: `${itens.length} alteração(ões) aplicada(s) no turno ${TURNOS.find((t) => t.value === turno)?.label}.`,
      });
    } catch {
      toast({ title: "Erro ao salvar disponibilidade", variant: "destructive" });
    }
  };

  const carregando = carregandoProfessores || (!!professorIdNum && (carregandoDisponibilidade || carregandoSlots || carregandoHorarios));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-rose-500" />
            Disponibilidade de Professores
          </h1>
          <p className="text-muted-foreground mt-1">
            Matriz visual de indisponibilidade — o motor de horários respeitará todos os bloqueios e a Hora-Atividade
            obrigatória marcados aqui.
          </p>
        </div>
        {hasChanges && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetar}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Desfazer
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvarLote.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {salvarLote.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorBusca
          className="w-72"
          options={professores.filter((p) => p.ativo).map((p) => ({ value: String(p.id), label: p.nome }))}
          value={professorId}
          onChange={setProfessorId}
          placeholder={carregandoProfessores ? "Carregando..." : "Selecione um professor"}
          buscarPlaceholder="Buscar professor por nome..."
        />

        <Tabs value={turno} onValueChange={(v) => setTurno(v as Turno)}>
          <TabsList>
            {TURNOS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {professorId && (
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300" />
              <span className="text-muted-foreground">Disponível</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-rose-100 border border-rose-300" />
              <span className="text-muted-foreground">Bloqueado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300" />
              <span className="text-muted-foreground">Hora-Atividade obrigatória</span><span className="ml-3 inline-flex items-center gap-1 text-muted-foreground"><GraduationCap className="w-3 h-3 text-amber-800" /><Lock className="w-3 h-3 text-amber-800" />HA fixa (o motor não move)</span>{/* [HA-FIXA] */}<Button size="sm" variant={modoFixarAula ? "default" : "outline"} className="ml-3 h-7 gap-1" onClick={() => { setModoFixarAula((v) => !v); setModoAtividade(false); }} title="Ligado: clicar numa célula fixa ou solta uma aula nesse horário">
  <Pin className="w-3 h-3" />{modoFixarAula ? "Modo fixar aula: LIGADO" : "Modo fixar aula"}
</Button>
<Dialog open={!!celulaFixar} onOpenChange={(v) => { if (!v) setCelulaFixar(null); }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{celulaFixar ? `Aula fixa — ${DIAS[celulaFixar.dia]}, ${celulaFixar.numeroAula}ª aula` : "Aula fixa"}</DialogTitle>
    </DialogHeader>
    {celulaFixar && (() => {
      const af = aulaFixaNaCelula(celulaFixar.dia, celulaFixar.numeroAula);
      const estadoCel = matriz[cellKey(celulaFixar.dia, celulaFixar.numeroAula)];
      if (af) {
        return (
          <div className="space-y-3 text-sm">
            <p>Aula fixada aqui: <strong>{rotuloTurmaDisc.get(`${af.turmaId}-${af.disciplinaId}`) ?? "turma/disciplina"}</strong>. O CP-SAT mantém esta aula neste horário.</p>
            <DialogFooter>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => soltarAulaFixa(af.id)} disabled={apagarAulaFixa.isPending}>
                {apagarAulaFixa.isPending ? "Soltando..." : "Soltar aula"}
              </Button>
            </DialogFooter>
          </div>
        );
      }
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Escolha a turma e a disciplina. Na próxima geração ou melhoria com o CP-SAT, esta aula fica obrigatoriamente neste horário.</p>
          <select className="w-full border rounded-md h-9 px-2 bg-background" value={opcaoFixar} onChange={(e) => setOpcaoFixar(e.target.value)}>
            <option value="">Turma e disciplina...</option>
            {opcoesTurmaDisc.map((o) => (<option key={`${o.turmaId}-${o.disciplinaId}`} value={`${o.turmaId}-${o.disciplinaId}`}>{o.rotulo}</option>))}
          </select>
          {opcoesTurmaDisc.length === 0 && <p className="text-xs text-muted-foreground">Este professor ainda não tem aulas neste turno.</p>}
          {(estadoCel === "bloqueado" || estadoCel === "ha_fixa") && (
            <p className="text-xs text-rose-600">Atenção: este horário está {estadoCel === "bloqueado" ? "bloqueado" : "com HA fixa"} para o professor. A geração vai recusar uma aula fixa aqui.</p>
          )}
          <DialogFooter>
            <Button onClick={fixarAulaNaCelula} disabled={!opcaoFixar || criarAulaFixa.isPending} className="gap-1">
              <Pin className="w-3.5 h-3.5" />{criarAulaFixa.isPending ? "Fixando..." : "Fixar aula"}
            </Button>
          </DialogFooter>
        </div>
      );
    })()}
  </DialogContent>
</Dialog>{/* [AULA-FIXA-DISP] */}
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-muted-foreground">Aula real marcada</span>
            </div>
            {/* [ATIVIDADE-FORA-DE-SALA] */}
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-slate-100 border border-slate-400" />
              <span className="text-muted-foreground">Atividade fora de sala</span>
              <Button size="sm" variant={modoAtividade ? "default" : "outline"} className="ml-2 h-7 gap-1" onClick={() => { setModoAtividade((v) => !v); setModoFixarAula(false); }} title="Ligado: clicar numa célula marca ou remove uma atividade fora de sala (FORM, COORD, PAEE...)">
                <Tag className="w-3 h-3" />{modoAtividade ? "Modo atividade: LIGADO" : "Modo atividade"}
              </Button>
            </div>
            <Dialog open={!!celulaAtividade} onOpenChange={(v) => { if (!v) setCelulaAtividade(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{celulaAtividade ? `Atividade fora de sala — ${DIAS[celulaAtividade.dia]}, ${celulaAtividade.numeroAula}ª aula` : "Atividade"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">O professor está na escola, mas fora de sala. O motor não coloca aula nem HA aqui, e o horário não conta como janela.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ATIVIDADES_SUGERIDAS.map((a) => (
                      <Button key={a.rotulo} size="sm" type="button" variant={limparRotulo(rotuloEscolhido) === a.rotulo ? "default" : "outline"} className="h-7" title={a.descricao} onClick={() => setRotuloEscolhido(a.rotulo)}>
                        {a.rotulo}
                      </Button>
                    ))}
                  </div>
                  <input className="w-full border rounded-md h-9 px-2 bg-background" placeholder="Ou digite outra sigla (ex.: IF-1B)" maxLength={12} value={rotuloEscolhido} onChange={(e) => setRotuloEscolhido(e.target.value)} />
                  <DialogFooter className="gap-2">
                    {celulaAtividade && matriz[cellKey(celulaAtividade.dia, celulaAtividade.numeroAula)] === "atividade" && (
                      <Button variant="outline" className="text-destructive hover:text-destructive" onClick={removerAtividade}>Remover atividade</Button>
                    )}
                    <Button onClick={marcarAtividade} disabled={!limparRotulo(rotuloEscolhido)} className="gap-1"><Tag className="w-3.5 h-3.5" />Marcar</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
            {totalBloqueios > 0 && (
              <Badge variant="outline" className="text-rose-600 border-rose-200">
                <Lock className="w-3 h-3 mr-1" />
                {totalBloqueios} bloqueio(s)
              </Badge>
            )}
            {totalAtividades > 0 && (
              <Badge variant="outline" className="text-slate-600 border-slate-300">
                <Tag className="w-3 h-3 mr-1" />
                {totalAtividades} atividade(s)
              </Badge>
            )}
            {totalHA > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-200">
                <GraduationCap className="w-3 h-3 mr-1" />
                {totalHA} HA obrigatória
              </Badge>
            )}
          </div>
        )}
      </div>

      {!professorId ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Selecione um professor para gerenciar a disponibilidade semanal.</p>
          </CardContent>
        </Card>
      ) : carregando ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : slotsOrdenados.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Info className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>
              Nenhum esquema de horário configurado para o turno {TURNOS.find((t) => t.value === turno)?.label}.
              Configure em Calendário e Turnos → Esquema de aulas por turno antes de gerenciar a disponibilidade deste turno.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {professorSelecionado?.nome}
              <Badge variant="secondary" className="text-xs">
                {TURNOS.find((t) => t.value === turno)?.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-24 text-left text-xs font-semibold text-muted-foreground pb-1">Aula</th>
                    {DIAS.map((d, i) => (
                      <th key={d} className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-foreground">{DIAS_ABREV[i]}</span>
                          <div className="flex gap-0.5">
                            <button
                              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 leading-none"
                              onClick={() => bloquearDia(i)}
                              title="Bloquear dia inteiro"
                            >
                              Bloquear
                            </button>
                            <button
                              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 leading-none"
                              onClick={() => liberarDia(i)}
                              title="Liberar dia inteiro"
                            >
                              Liberar
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slotsOrdenados.map((slot) => (
                    <tr key={slot.id}>
                      <td className="text-xs text-muted-foreground font-medium pr-2">
                        <div className="font-semibold text-foreground">{slot.numeroAula}ª aula</div>
                        <div>{formatHora(slot.horaInicio)}</div>
                      </td>
                      {DIAS.map((_, dia) => {
                        const estado = matriz[cellKey(dia, slot.numeroAula)] ?? "disponivel";
                        const real = aulaReal(dia, slot.numeroAula);
                        return (
                          <td key={dia} className="p-0">
                            <button
                              onClick={() => toggle(dia, slot.numeroAula)}
                              className={cn(
                                "relative w-full h-12 rounded-md border-2 transition-all text-xs font-semibold",
                                estado === "disponivel" &&
                                  "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                                estado === "bloqueado" &&
                                  "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100",
                                estado === "ha_obrigatoria" &&
                                  "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100",
                                estado === "ha_fixa" &&
                                  "bg-amber-100 border-amber-500 text-amber-800 hover:bg-amber-200", // [HA-FIXA]
                                estado === "atividade" &&
                                  "bg-slate-100 border-slate-400 text-slate-700 hover:bg-slate-200", // [ATIVIDADE-FORA-DE-SALA]
                              )}
                              title={
                                (real ? `Aula real: ${real.turma?.nome ?? "?"} — ${real.disciplina?.nome ?? "?"}. ` : "") +
                                (estado === "disponivel"
                                  ? "Disponível — clique para bloquear"
                                  : estado === "bloqueado"
                                    ? "Bloqueado — clique para marcar Hora-Atividade obrigatória"
                                    : estado === "ha_obrigatoria"
                                      ? "Hora-Atividade obrigatória — clique para fixar (HA fixa: o motor nunca coloca aula aqui)"
                                      : estado === "atividade"
                                        ? `Atividade fora de sala: ${rotulos[cellKey(dia, slot.numeroAula)] ?? ""} — clique para liberar (ou use o Modo atividade para trocar)`
                                        : "HA fixa — o motor nunca coloca aula aqui — clique para liberar") /* [HA-FIXA] [ATIVIDADE-FORA-DE-SALA] */ +
                                ((estado === "ha_obrigatoria" || estado === "ha_fixa") && turnoEhContraturno ? " — HA em contraturno (turno sem aula)" : "") /* [HA-CONTRATURNO-ASTERISCO] */
                              }
                            >
                              {estado === "disponivel" && "✓"}
                              {estado === "bloqueado" && <Lock className="w-3.5 h-3.5 mx-auto" />}
                              {estado === "atividade" && <span className="text-[11px] font-bold tracking-tight">{rotulos[cellKey(dia, slot.numeroAula)]}</span>}{/* [ATIVIDADE-FORA-DE-SALA] */}
                              {estado === "ha_obrigatoria" && <GraduationCap className="w-3.5 h-3.5 mx-auto" />}
                              {estado === "ha_fixa" && (<span className="inline-flex items-center justify-center gap-0.5 w-full"><GraduationCap className="w-3.5 h-3.5" /><Lock className="w-3 h-3" /></span>)}{/* [HA-FIXA] */}
                              {(estado === "ha_obrigatoria" || estado === "ha_fixa") && turnoEhContraturno && (<span className="absolute top-0 left-1 text-sm font-bold text-amber-800">*</span>)}{/* [HA-CONTRATURNO-ASTERISCO] */}
                              {(() => { const af = aulaFixaNaCelula(dia, slot.numeroAula); return af ? (<span className="absolute bottom-0.5 left-0.5 text-violet-700" title={`Aula fixa: ${rotuloTurmaDisc.get(`${af.turmaId}-${af.disciplinaId}`) ?? "turma/disciplina"}`}><Pin className="w-3 h-3" /></span>) : null; })()}{/* [AULA-FIXA-DISP] */}
                              {real && (
                                <span className="absolute top-0.5 right-0.5 text-blue-600">
                                  <BookOpen className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Clique numa célula para alternar entre Disponível → Bloqueado → Hora-Atividade obrigatória → HA fixa (casos excepcionais: o motor nunca coloca aula nela). Atividades fora de sala (FORM, COORD, PAEE...) são marcadas com o
              botão "Modo atividade". Use os
              botões "Bloquear/Liberar" para afetar um dia inteiro de uma vez. O ícone de livro no canto mostra onde o
              professor já dá aula de verdade (turma + disciplina aparecem ao passar o mouse). O motor de geração de
              horários nunca alocará o professor em slots bloqueados ou marcados como Hora-Atividade obrigatória.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
