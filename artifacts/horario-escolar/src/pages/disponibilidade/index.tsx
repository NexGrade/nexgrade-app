import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListProfessores,
  useListTurmas, // [DISP-POR-TURMA]
  useListDisciplinas, // [DISP-AULAS-DO-RASCUNHO]
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
  useGetProfessorCarga, // [HA-DEVIDA-UMA-CONTA]
  customFetch, // [DISP-EXPERIMENTAL]
  ApiError, // [AULA-EM-BLOQUEIO]
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useRascunho } from "@/lib/rascunho"; // [MODO-RASCUNHO]
import { Users, Save, RotateCcw, Lock, CheckCircle2, Info, GraduationCap, BookOpen, Pin, Tag, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { AceitarConflito } from "@/components/aceitar-conflito"; // [CONFLITO-ACEITO]
import { SeletorBusca } from "@/components/seletor-busca";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"; // [AULA-FIXA-DISP]
import { ContaProfessor } from "@/components/conta-professor"; // [CONTA-NA-HORA]
import { mapaIntegralDosSlots, projetarAulasIntegral, TURNO_INTEGRAL } from "@/lib/turno-integral"; // [DISP-AULA-INTEGRAL]

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
// (nao mais no sistema anterior) as atividades fora de sala. Gravadas como bloqueio com
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

// [DISP-EXPERIMENTAL] (06/11/2026) a mesma tela serve a disponibilidade oficial (pagina Disponibilidade) e a de um
// experimento (aba Disponibilidade dentro do experimento, no Modo Experimental). [EXPERIMENTO-COMPLETO] (06/11/2026) a
// pedido da dona, o seletor de experimento saiu desta pagina: dentro do experimento tudo se faz pelas abas dele.
const SEM_LINHAS: never[] = [];

export default function DisponibilidadePage() {
  // [MODO-RASCUNHO] com o rascunho ligado, a pagina le e grava no rascunho
  const { nomeAtivo } = useRascunho();
  return <PainelDisponibilidade key={nomeAtivo ?? "oficial"} experimento={nomeAtivo} />;
}

export function PainelDisponibilidade({ experimento = null, embutido = false }: { experimento?: string | null; embutido?: boolean }) {
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
  // [CONFLITO-VAI-AO-PROBLEMA] vindo da aba Conflitos: a mensagem do conflito fica visivel aqui
  const [conflitoVindo, setConflitoVindo] = useState<string | null>(() => new URLSearchParams(window.location.search).get("conflito"));
  const tipoConflitoVindo = new URLSearchParams(window.location.search).get("tipo");

  const { data: professores = [], isLoading: carregandoProfessores } = useListProfessores();
  // [DISP-POR-TURMA] (06/11/2026) pedido da dona: escolher a turma e ver so os professores dela (pela grade oficial)
  const { data: turmasTodas = [] } = useListTurmas();
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const turmaFiltroNum = turmaFiltro ? Number(turmaFiltro) : undefined;
  const { data: aulasDaTurma = [] } = useListHorarios(
    { turmaId: turmaFiltroNum },
    { query: { enabled: !!turmaFiltroNum, queryKey: getListHorariosQueryKey({ turmaId: turmaFiltroNum }) } },
  );
  const profsDaTurma = new Set((aulasDaTurma as Array<{ professorId?: number | null }>).map((h) => h.professorId).filter((id): id is number => id != null));

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

  const slotsTodosOrdenados = useMemo(
    () => [...slots].sort((a, b) => a.numeroAula - b.numeroAula),
    [slots],
  );

  const professorIdNum = professorId ? Number(professorId) : undefined;

  const { data: disponibilidadeOficial = SEM_LINHAS, isLoading: carregandoOficial } = useListDisponibilidade(
    { professorId: professorIdNum },
    { query: { enabled: !!professorIdNum && !experimento, queryKey: getListDisponibilidadeQueryKey({ professorId: professorIdNum }) } },
  );
  // [DISP-EXPERIMENTAL] no experimento: a oficial com as mudancas dele por cima (linhas com noExperimento)
  const dispExp = useQuery({
    queryKey: ["disp-exp", experimento, professorIdNum],
    queryFn: () => customFetch<Array<typeof disponibilidadeOficial[number] & { noExperimento?: boolean }>>(
      `/api/disponibilidade?professorId=${professorIdNum}&experimento=${encodeURIComponent(experimento ?? "")}`),
    enabled: !!professorIdNum && !!experimento,
  });
  const disponibilidadeRows = experimento ? (dispExp.data ?? SEM_LINHAS) : disponibilidadeOficial;
  const carregandoDisponibilidade = experimento ? dispExp.isLoading : carregandoOficial;
  const mudadasNoExperimento = useMemo(() => new Set(
    experimento ? (disponibilidadeRows as Array<{ noExperimento?: boolean; turno?: string | null; diaSemana: number; horarioSlot: number }>)
      .filter((r) => r.noExperimento && (r.turno ?? null) === turno).map((r) => `${r.diaSemana}-${r.horarioSlot}`) : [],
  ), [experimento, disponibilidadeRows, turno]);

  // [NOVO] Aulas reais do professor (de `horarios`), pra mostrar na
  // própria grade de disponibilidade quais horários ele já dá aula de
  // verdade -- só informativo, não interfere no estado editável
  // (disponível/bloqueado/HA) da célula.
  const { data: horariosOficiais = [], isLoading: carregandoOficiais } = useListHorarios(
    professorIdNum ? { professorId: professorIdNum } : {},
    { query: { enabled: !!professorIdNum, queryKey: getListHorariosQueryKey(professorIdNum ? { professorId: professorIdNum } : {}) } },
  );
  // [DISP-AULAS-DO-RASCUNHO] (12/11/2026) com o rascunho ligado, as aulas mostradas sao as do rascunho (e, das turmas que
  // ficaram fora dele, as da grade que vale hoje), como o Promover vai gravar. Antes a tela mostrava sempre a grade que
  // vale hoje, e uma aula ja trocada no rascunho continuava aparecendo no lugar antigo (retorno do diretor do Romario).
  // Mesma consulta da aba Grade do rascunho (grade-rascunho.tsx): uma troca la atualiza aqui.
  const aulasRascunho = useQuery({
    queryKey: ["grade-rascunho", experimento],
    queryFn: () => customFetch<Array<{ nome: string; turmaId: number; disciplinaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null }>>("/api/horarios/experimentais"),
    enabled: !!experimento,
  });
  const { data: disciplinasEscola = [] } = useListDisciplinas();
  const horariosProf = useMemo(() => {
    if (!experimento || !professorIdNum) return horariosOficiais;
    const linhas = (aulasRascunho.data ?? []).filter((l) => l.nome === experimento);
    if (!linhas.length) return horariosOficiais; // rascunho ainda sem grade
    const turmasDentro = new Set(linhas.map((l) => l.turmaId));
    const turmaPorId = new Map((turmasTodas as any[]).map((t) => [t.id, t]));
    const nomeDisc = new Map<number, string>();
    for (const d of disciplinasEscola as any[]) nomeDisc.set(d.id, d.nome);
    for (const h of horariosOficiais as any[]) if (h.disciplina?.nome) nomeDisc.set(h.disciplinaId ?? h.disciplina?.id, h.disciplina.nome);
    const doRascunho = linhas.filter((l) => l.professorId === professorIdNum).map((l, i) => ({
      id: -1 - i, ...l, turma: turmaPorId.get(l.turmaId), disciplina: { id: l.disciplinaId, nome: nomeDisc.get(l.disciplinaId) ?? "aula" },
    }));
    return [...(horariosOficiais as any[]).filter((h) => !turmasDentro.has(h.turmaId ?? h.turma?.id)), ...doRascunho];
  }, [experimento, professorIdNum, horariosOficiais, aulasRascunho.data, turmasTodas, disciplinasEscola]) as typeof horariosOficiais;
  const carregandoHorarios = carregandoOficiais || (!!experimento && aulasRascunho.isLoading);
  const horariosDoTurno = useMemo(
    () => horariosProf.filter((h: any) => h.turma?.turno === turno),
    [horariosProf, turno],
  );
  // [DISP-AULA-INTEGRAL] (04/11/2026) aula do professor na turma integral (ex.: 1ME DOC), no turno e na linha reais,
  // como na grade do professor. Antes nao aparecia: o horario parecia livre entre a HA e as aulas, mas e aula
  // (Carlos Farias, quarta 4a). Livrinho de outra cor; as opcoes de aula fixa continuam so das turmas do turno.
  const { data: slotsEscolaIntegral = [] } = useListHorarioSlots({} as any, { query: { queryKey: getListHorarioSlotsQueryKey({} as any) } });
  const aulasIntegralDoTurno = useMemo(() => {
    if (!(horariosProf as any[]).some((h) => h.turma?.turno === TURNO_INTEGRAL)) return [];
    const mapa = mapaIntegralDosSlots(slotsEscolaIntegral as any);
    return ((projetarAulasIntegral(horariosProf as any[], mapa) ?? []) as any[])
      .filter((h) => h.numeroAulaIntegral != null && h.turma?.turno === turno);
  }, [horariosProf, slotsEscolaIntegral, turno]);
  // [HA-POR-TURNO-NA-TELA] (21/10/2026) aulas e HA de cada turno pela tabela oficial SEED-PR (PROB e HA fixa contam como
  // HA marcada). [HA-DEVIDA-UMA-CONTA] (04/11/2026) o "pede" vem do servidor (/professores/:id/carga), com a mesma conta do
  // recalculo: a turma integral no turno real, a HA presa em turno sem aula descontada e o cadastro secundario sem HA.
  // Antes a tela tinha a propria copia da tabela e mostrava "faltam" onde o recalculo poe menos.
  const { data: cargaProf } = useGetProfessorCarga(professorIdNum ?? 0, { query: { enabled: !!professorIdNum, queryKey: ["professor-carga", professorIdNum] as const } });
  const resumoHA = useMemo(() => {
    const aulasPorTurno = (cargaProf?.porTurno ?? {}) as Record<string, number>;
    const pedePorTurno = (cargaProf?.haInstitucionalPorTurno ?? {}) as Record<string, number>;
    const linhas = TURNOS.map((t) => {
      const aulas = aulasPorTurno[t.value] ?? 0;
      // [FOR-CONTA-COMO-HA] FOR (formadores) conta como HA ja cumprida
      const marcadas = (disponibilidadeRows as any[]).filter((d) => d.turno === t.value && (d.horaAtividadeObrigatoria || (!d.disponivel && /\(ocupado:\s*FOR\s*\)/i.test(d.motivo ?? "")))).length;
      return { turno: t.value, rotulo: t.label, aulas, pede: pedePorTurno[t.value] ?? 0, marcadas };
    }).filter((l) => l.aulas > 0 || l.marcadas > 0 || l.pede > 0);
    return { linhas, pede: linhas.reduce((s, l) => s + l.pede, 0), marcadas: linhas.reduce((s, l) => s + l.marcadas, 0) };
  }, [cargaProf, disponibilidadeRows]);
  // [ASS-SO-TURMA] periodo nao letivo depois da ultima aula do turno (ex.: 7a aula da manha,
  // so para a assincrona da 3STM): a linha so aparece para o professor que tem aula nela.
  const slotsOrdenados = useMemo(() => {
    const ultimaLetiva = Math.max(0, ...slotsTodosOrdenados.filter((s: any) => s.letivo !== false).map((s) => s.numeroAula));
    return slotsTodosOrdenados.filter((s: any) =>
      s.letivo !== false || s.numeroAula <= ultimaLetiva || horariosDoTurno.some((h: any) => h.numeroAula === s.numeroAula)
      || aulasIntegralDoTurno.some((h: any) => h.numeroAula === s.numeroAula)); // [DISP-AULA-INTEGRAL]
  }, [slotsTodosOrdenados, horariosDoTurno, aulasIntegralDoTurno]);

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
    return horariosDoTurno.find((h: any) => h.diaSemana === dia && h.numeroAula === numeroAula)
      ?? aulasIntegralDoTurno.find((h: any) => h.diaSemana === dia && h.numeroAula === numeroAula); // [DISP-AULA-INTEGRAL]
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

  // [DOC-TRAVADA] (04/11/2026, pedido da dona) o horario de aula da turma integral (DOC) nao pode ser bloqueado nem receber
  // HA ou atividade: a celula fica travada. Bloqueio que ja existia ali e liberado na tela (vai no proximo Salvar) --
  // senao, ao gerar de novo a grade da integral, o motor tiraria a aula DOC do lugar.
  const aulaDOC = (dia: number, numeroAula: number) =>
    aulasIntegralDoTurno.find((h: any) => h.diaSemana === dia && h.numeroAula === numeroAula);
  const [docLiberadosKey, setDocLiberadosKey] = useState("");
  useEffect(() => {
    if (!ultimaMatrizKey || !aulasIntegralDoTurno.length) return;
    const chaveAviso = `${ultimaMatrizKey}|${aulasIntegralDoTurno.length}`;
    if (chaveAviso === docLiberadosKey) return;
    const liberar = aulasIntegralDoTurno
      .map((h: any) => cellKey(h.diaSemana, h.numeroAula))
      .filter((k) => (matriz[k] ?? "disponivel") !== "disponivel");
    setDocLiberadosKey(chaveAviso);
    if (!liberar.length) return;
    setMatriz((prev) => { const next = { ...prev }; for (const k of liberar) next[k] = "disponivel"; return next; });
    toast({
      title: `${liberar.length} horário(s) com aula DOC estavam bloqueados ou marcados`,
      description: "Foram liberados, porque o horário de aula da turma integral não pode ser bloqueado. Clique em Salvar para gravar.",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaMatrizKey, aulasIntegralDoTurno]);
  const avisarDOC = (dia: number, numeroAula: number) => {
    const h: any = aulaDOC(dia, numeroAula);
    toast({ title: "Horário de aula DOC: travado", description: `Aqui o professor dá aula na turma integral (${h?.turma?.nome ?? "DOC"} — ${h?.disciplina?.nome ?? ""}). Este horário não pode ser bloqueado nem receber HA ou atividade.` });
  };

  const professorSelecionado = professores.find((p) => String(p.id) === professorId);
  const totalBloqueios = Object.values(matriz).filter((v) => v === "bloqueado").length;
  const totalHA = Object.values(matriz).filter((v) => v === "ha_obrigatoria" || v === "ha_fixa").length; // [HA-FIXA]
  const totalAtividades = Object.values(matriz).filter((v) => v === "atividade").length; // [ATIVIDADE-FORA-DE-SALA]
  const rotuloSeAtividade = (m: CelulaState, r: Record<string, string>, key: string) => (m[key] === "atividade" ? r[key] ?? "" : "");
  // [CONTA-NA-HORA] horarios de aula que os cliques ainda nao salvos liberaram (+) ou bloquearam (-) neste turno.
  // Bloqueio real = "bloqueado" e "atividade" (HA e HA fixa nao tiram horario de aula, mesma regra do servidor).
  const deltaLivres = useMemo(() => {
    const letivas = new Set(slotsOrdenados.filter((s: any) => s.letivo !== false).map((s) => s.numeroAula));
    const bloqueia = (e: CelulaEstado | undefined) => e === "bloqueado" || e === "atividade";
    let delta = 0;
    for (const key of new Set([...Object.keys(matriz), ...Object.keys(original)])) {
      if (!letivas.has(Number(key.split("-")[1]))) continue;
      delta += (bloqueia(original[key]) ? 1 : 0) - (bloqueia(matriz[key]) ? 1 : 0);
    }
    return delta;
  }, [matriz, original, slotsOrdenados]);

  const hasChanges = JSON.stringify(matriz) !== JSON.stringify(original) ||
    Object.keys(matriz).some((k) => rotuloSeAtividade(matriz, rotulos, k) !== rotuloSeAtividade(original, rotulosOriginais, k));

  const toggle = (dia: number, numeroAula: number) => {
    if (aulaDOC(dia, numeroAula)) { avisarDOC(dia, numeroAula); return; } // [DOC-TRAVADA]
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
    // [HA-SOBRE-AULA] (12/11/2026) marcar HA onde o professor tem aula nao tira a aula dali (retorno do diretor do
    // Romario: "bloqueei para HA e ele manteve a aula"). Avisa o que acontece e o caminho para tirar a aula.
    if ((proximo === "ha_obrigatoria" || proximo === "ha_fixa") && real) {
      const aula = `${real.turma?.nome ?? "?"} — ${real.disciplina?.nome ?? "?"}`;
      const texto = experimento
        ? `Esse horário tem aula no rascunho (${aula}). Marcar HA aqui não tira a aula sozinho: ela aparece em vermelho na simulação do rascunho (aba Modo Experimental), onde o botão "Ver como resolver" sugere a troca. O rascunho só pode ser promovido depois que a aula mudar de lugar. Marcar HA mesmo assim?`
        : proximo === "ha_obrigatoria"
          ? `Esse horário tem aula (${aula}). Na grade que vale hoje, a HA comum não tira a aula: ela é refeita em outro horário livre. Para a aula sair daqui, faça a mudança no rascunho (o "Ver como resolver" sugere a troca). Marcar HA mesmo assim?`
          : `Esse horário tem aula (${aula}). A HA fixa prende o horário, mas a aula só sai daqui quando a grade for gerada de novo ou trocada no rascunho; até lá, a tela Conflitos acusa. Marcar HA fixa mesmo assim?`;
      if (!confirm(texto)) return;
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
        onSuccess: () => { toast({ title: "Aula fixada", description: "A geração da grade vai manter esta aula neste horário." }); recarregarAulasFixas(); setCelulaFixar(null); },
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
        if (aulaDOC(dia, slot.numeroAula)) return; // [DOC-TRAVADA] horario de aula DOC nao bloqueia
        next[cellKey(dia, slot.numeroAula)] = "bloqueado";
      });
      return next;
    });
  };

  // [COORD-DIA] (22/10/2026) marca o dia inteiro como atividade fora de sala "COORD" (coordenação),
  // igual ao Bloquear/Liberar. Horário com aula real ou HA fica como está (não some aula nem HA).
  const coordenacaoDia = (dia: number) => {
    const pulados: string[] = [];
    const marcar: string[] = [];
    slotsOrdenados.forEach((slot) => {
      const key = cellKey(dia, slot.numeroAula);
      const estado = matriz[key];
      if (aulaReal(dia, slot.numeroAula) || estado === "ha_obrigatoria" || estado === "ha_fixa") pulados.push(`${slot.numeroAula}ª`);
      else marcar.push(key);
    });
    setMatriz((prev) => { const next = { ...prev }; for (const k of marcar) next[k] = "atividade"; return next; });
    setRotulos((prev) => { const next = { ...prev }; for (const k of marcar) next[k] = "COORD"; return next; });
    toast({
      title: `${DIAS[dia]}: ${marcar.length} horário(s) marcados como COORD`,
      description: pulados.length ? `Ficaram como estavam (têm aula ou HA): ${pulados.join(", ")}. Clique em Salvar para gravar.` : "Clique em Salvar para gravar.",
    });
  };

  // [LIBERAR-MANTEM-HA] (01/11/2026) "Liberar" tira bloqueio e atividade, mas a HA fica (como no COORD do dia).
  // Antes liberava tudo: um "Liberar" + Salvar apagou as 7 HA de um professor da Demonstracao sem aviso.
  const liberarDia = (dia: number) => {
    const pulados: string[] = [];
    const liberar: string[] = [];
    slotsOrdenados.forEach((slot) => {
      const key = cellKey(dia, slot.numeroAula);
      if (matriz[key] === "ha_obrigatoria" || matriz[key] === "ha_fixa") pulados.push(`${slot.numeroAula}ª`);
      else liberar.push(key);
    });
    setMatriz((prev) => { const next = { ...prev }; for (const k of liberar) next[k] = "disponivel"; return next; });
    if (pulados.length) {
      toast({
        title: `${DIAS[dia]}: bloqueios liberados; a HA ficou`,
        description: `Continuam HA: ${pulados.join(", ")}. Para tirar uma HA, clique no horário dela. Clique em Salvar para gravar.`,
      });
    }
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
        // [LIVRE-SEM-MOTIVO] (01/11/2026) horario que vira livre fica sem texto, e bloqueio novo ganha texto proprio:
        // antes o texto antigo ficava ("livre" escrito "Importado do sistema anterior (HA)"), e so a atividade era limpa.
        motivo: estadoAtual === "ha_fixa" ? "HA fixa (definida manualmente)" : estadoAtual === "ha_obrigatoria" ? "HA manual (definida na tela)"
          : estadoAtual === "atividade" ? `Atividade fora de sala (ocupado: ${rotulos[key]})`
          : estadoAtual === "disponivel" ? ""
          : estadoOriginal === "bloqueado" ? undefined // continua bloqueio: mantem o texto dele
          : "Bloqueio (definido na tela)",
      });
    });

    if (itens.length === 0) return;

    try {
      if (experimento) { // [DISP-EXPERIMENTAL] grava so no experimento
        const gravar = (confirmar?: boolean) => customFetch(`/api/disponibilidade/lote?experimento=${encodeURIComponent(experimento)}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ professorId: professorIdNum, itens, ...(confirmar ? { confirmar } : {}) }),
        });
        try {
          await gravar();
        } catch (e) {
          // [AULA-EM-BLOQUEIO] (12/11/2026) bloqueio novo onde o rascunho ja tem aula do professor: pergunta antes de gravar
          const dados = e instanceof ApiError ? (e.data as { precisaConfirmar?: boolean; aulasNoHorario?: string[] } | null) : null;
          if (!(e instanceof ApiError && e.status === 409 && dados?.precisaConfirmar)) throw e;
          const lista = (dados.aulasNoHorario ?? []).map((x) => `• ${x}`).join("\n");
          if (!confirm(`${professorSelecionado?.nome ?? "O professor"} tem aula no rascunho nesse(s) horário(s):\n\n${lista}\n\nSe gravar, a aula fica onde está até alguém mudá-la de lugar (botão "Ver como resolver" na simulação do rascunho), e o rascunho não pode ser promovido enquanto isso. Gravar mesmo assim?`)) return;
          await gravar(true);
        }
        setOriginal({ ...matriz });
        setRotulosOriginais({ ...rotulos });
        queryClient.invalidateQueries({ queryKey: ["disp-exp", experimento] });
        queryClient.invalidateQueries({ queryKey: ["experimentos-resumo"] });
        toast({
          title: `Disponibilidade salva no experimento "${experimento}"`,
          description: `${itens.length} alteração(ões) de ${professorSelecionado?.nome ?? "professor"}. A disponibilidade oficial não mudou.`,
        });
        return;
      }
      await salvarLote.mutateAsync({ data: { professorId: professorIdNum, itens } });
      setOriginal({ ...matriz });
      setRotulosOriginais({ ...rotulos }); // [ATIVIDADE-FORA-DE-SALA]
      queryClient.invalidateQueries({ queryKey: getListDisponibilidadeQueryKey({ professorId: professorIdNum }) });
      queryClient.invalidateQueries({ queryKey: ["/api/horarios/capacidade"] }); // [CONTA-NA-HORA] refaz a conta com o que foi salvo
      queryClient.invalidateQueries({ queryKey: ["professor-carga", professorIdNum] }); // [HA-DEVIDA-UMA-CONTA]
      toast({
        title: `✅ Disponibilidade de ${professorSelecionado?.nome ?? "professor"} salva!`,
        description: `${itens.length} alteração(ões) aplicada(s) no turno ${TURNOS.find((t) => t.value === turno)?.label}.`,
      });
    } catch (e) {
      toast({ title: "Erro ao salvar disponibilidade", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const carregando = carregandoProfessores || (!!professorIdNum && (carregandoDisponibilidade || carregandoSlots || carregandoHorarios));

  return (
    <div className="space-y-6">
      {!embutido && conflitoVindo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span><strong>Conflito:</strong> {conflitoVindo}</span>
          <span className="flex items-center gap-3">
            <AceitarConflito tipo={tipoConflitoVindo} descricao={conflitoVindo} />{/* [CONFLITO-ACEITO] */}
            <a href="/horario?tab=conflitos" className="text-xs font-medium underline">Voltar aos conflitos</a>
            <button type="button" className="text-xs underline" onClick={() => setConflitoVindo(null)}>Fechar</button>
          </span>
        </div>
      )}{/* [CONFLITO-VAI-AO-PROBLEMA] */}
      {!embutido && <div className="flex items-start justify-between">
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
      </div>}

      {experimento && (
        <p className="text-sm text-violet-900 rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
          Mudanças feitas aqui ficam só no experimento <strong>{experimento}</strong> (horários com contorno roxo). A disponibilidade oficial só muda ao promover.
        </p>
      )}{/* [DISP-EXPERIMENTAL] */}
      {experimento && dispExp.isError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">Não foi possível abrir a disponibilidade do experimento{dispExp.error instanceof Error ? `: ${dispExp.error.message}` : "."}</div>
      )}
      {professorIdNum && resumoHA.linhas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          <span className="font-medium">Aulas e HA por turno (tabela SEED):</span>
          {resumoHA.linhas.map((l) => (
            <span key={l.turno} className={l.marcadas < l.pede ? "text-red-700" : "text-muted-foreground"}>
              <strong>{l.rotulo}</strong>: {l.aulas} aula(s) → {l.pede} HA · marcadas {l.marcadas}
            </span>
          ))}
          <span className={resumoHA.marcadas < resumoHA.pede ? "font-medium text-red-700" : "font-medium text-emerald-700"}>
            Total: pede {resumoHA.pede} HA, tem {resumoHA.marcadas}{resumoHA.marcadas < resumoHA.pede ? ` (faltam ${resumoHA.pede - resumoHA.marcadas})` : " ✓"}
          </span>
        </div>
      )}{/* [HA-POR-TURNO-NA-TELA] */}
      {professorIdNum && <ContaProfessor professorId={professorIdNum} turno={turno} deltaLivres={deltaLivres} />}{/* [CONTA-NA-HORA] */}

      <div className="flex flex-wrap items-center gap-4">
        {/* [DISP-POR-TURMA] */}
        <SeletorBusca
          className="w-56"
          options={[{ value: "", label: "Todas as turmas" }, ...[...turmasTodas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })).map((t) => ({ value: String(t.id), label: t.nome }))]}
          value={turmaFiltro}
          onChange={setTurmaFiltro}
          placeholder="Todas as turmas"
          buscarPlaceholder="Buscar turma..."
        />
        <SeletorBusca
          className="w-72"
          options={professores.filter((p) => p.ativo && (!turmaFiltroNum || profsDaTurma.has(p.id))).map((p) => ({ value: String(p.id), label: p.nome }))}
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
            <p>Aula fixada aqui: <strong>{rotuloTurmaDisc.get(`${af.turmaId}-${af.disciplinaId}`) ?? "turma/disciplina"}</strong>. A geração da grade mantém esta aula neste horário.</p>
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
          <p className="text-muted-foreground">Escolha a turma e a disciplina. Na próxima geração ou melhoria da grade, esta aula fica obrigatoriamente neste horário.</p>
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
            {aulasIntegralDoTurno.length > 0 && (
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                <span className="text-muted-foreground">Aula na turma integral (DOC)</span>
              </div>
            )}{/* [DISP-AULA-INTEGRAL] */}
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
        <div className="space-y-2">
        {/* [SALVAR-SOBRE-A-GRADE] fora do quadro, no canto direito (acima da sexta); sempre visiveis (desabilitados sem mudancas) para a grade nao pular ao aparecerem */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={resetar} disabled={!hasChanges}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Desfazer
          </Button>
          <Button size="sm" onClick={salvar} disabled={!hasChanges || salvarLote.isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {salvarLote.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
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
                            <button
                              className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 leading-none"
                              onClick={() => coordenacaoDia(i)}
                              title="Coordenação o dia inteiro (atividade fora de sala COORD; horário com aula ou HA fica como está)"
                            >
                              Coord.
                            </button>{/* [COORD-DIA] */}
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
                        const doc: any = aulaDOC(dia, slot.numeroAula); // [DOC-TRAVADA]
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
                                doc && "!bg-teal-50 !border-teal-300 !text-teal-800 cursor-not-allowed", // [DOC-TRAVADA]
                                mudadasNoExperimento.has(cellKey(dia, slot.numeroAula)) && "ring-2 ring-violet-500 ring-offset-1", // [DISP-EXPERIMENTAL]
                              )}
                              title={doc ? `Aula na turma integral: ${doc.turma?.nome ?? "DOC"} — ${doc.disciplina?.nome ?? ""}. Horário travado: não pode ser bloqueado nem receber HA ou atividade.` :
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
                              {doc ? (<span className="inline-flex items-center justify-center gap-0.5 w-full text-[11px] font-bold"><Lock className="w-3 h-3" />DOC</span>) : estado === "disponivel" && "✓"}{/* [DOC-TRAVADA] */}
                              {estado === "bloqueado" && <Lock className="w-3.5 h-3.5 mx-auto" />}
                              {estado === "atividade" && <span className="text-[11px] font-bold tracking-tight">{rotulos[cellKey(dia, slot.numeroAula)]}</span>}{/* [ATIVIDADE-FORA-DE-SALA] */}
                              {estado === "ha_obrigatoria" && <GraduationCap className="w-3.5 h-3.5 mx-auto" />}
                              {estado === "ha_fixa" && (<span className="inline-flex items-center justify-center gap-0.5 w-full"><GraduationCap className="w-3.5 h-3.5" /><Lock className="w-3 h-3" /></span>)}{/* [HA-FIXA] */}
                              {(estado === "ha_obrigatoria" || estado === "ha_fixa") && turnoEhContraturno && (<span className="absolute top-0 left-1 text-sm font-bold text-amber-800">*</span>)}{/* [HA-CONTRATURNO-ASTERISCO] */}
                              {(() => { const af = aulaFixaNaCelula(dia, slot.numeroAula); return af ? (<span className="absolute bottom-0.5 left-0.5 text-violet-700" title={`Aula fixa: ${rotuloTurmaDisc.get(`${af.turmaId}-${af.disciplinaId}`) ?? "turma/disciplina"}`}><Pin className="w-3 h-3" /></span>) : null; })()}{/* [AULA-FIXA-DISP] */}
                              {real && (
                                <span
                                  className={cn("absolute top-0.5 right-0.5", real.numeroAulaIntegral != null ? "text-teal-600" : "text-blue-600")}
                                  title={real.numeroAulaIntegral != null ? `Aula na turma integral: ${real.turma?.nome ?? ""} — ${real.disciplina?.nome ?? ""}` : undefined}
                                >
                                  <BookOpen className="w-2.5 h-2.5" />
                                </span>
                              )}{/* [DISP-AULA-INTEGRAL] livrinho verde-azulado na aula da integral */}
                              {real && !doc && (
                                <span className="absolute bottom-0.5 inset-x-1 truncate text-[9px] font-medium leading-tight text-blue-800/80 pointer-events-none">
                                  {real.disciplina?.nome ?? ""}{real.turma?.nome ? ` · ${real.turma.nome}` : ""}
                                </span>
                              )}{/* [DISP-NOME-DISCIPLINA] (06/11/2026) pedido da dona: o nome da disciplina (e a turma) na celula com aula */}
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
        </div>
      )}
    </div>
  );
}
