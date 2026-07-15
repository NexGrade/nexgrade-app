import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListProfessores,
  useListDisponibilidade,
  useSetDisponibilidadeLote,
  useListHorarioSlots,
  getListDisponibilidadeQueryKey,
  getListHorarioSlotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Save, RotateCcw, Lock, CheckCircle2, Info, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeletorBusca } from "@/components/seletor-busca";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_ABREV = ["SEG", "TER", "QUA", "QUI", "SEX"];

const TURNOS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "noturno", label: "Noturno" },
] as const;

type Turno = (typeof TURNOS)[number]["value"];

type CelulaEstado = "disponivel" | "bloqueado" | "ha_obrigatoria";
type CelulaState = Record<string, CelulaEstado>;

function cellKey(dia: number, numeroAula: number) {
  return `${dia}-${numeroAula}`;
}

function proximoEstado(atual: CelulaEstado): CelulaEstado {
  if (atual === "disponivel") return "bloqueado";
  if (atual === "bloqueado") return "ha_obrigatoria";
  return "disponivel";
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

  const { data: professores = [], isLoading: carregandoProfessores } = useListProfessores();

  const { data: slots = [], isLoading: carregandoSlots } = useListHorarioSlots(
    { turno },
    { query: { queryKey: getListHorarioSlotsQueryKey({ turno }) } },
  );

  const slotsOrdenados = useMemo(
    () => [...slots].sort((a, b) => a.numeroAula - b.numeroAula),
    [slots],
  );

  const professorIdNum = professorId ? Number(professorId) : undefined;

  const { data: disponibilidadeRows = [], isLoading: carregandoDisponibilidade } = useListDisponibilidade(
    { professorId: professorIdNum },
    { query: { enabled: !!professorIdNum } },
  );

  const salvarLote = useSetDisponibilidadeLote();

  const carregarMatriz = () => {
    const m: CelulaState = {};
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
          m[key] = "ha_obrigatoria";
        } else if (!r.disponivel) {
          m[key] = "bloqueado";
        } else {
          m[key] = "disponivel";
        }
      });
    return m;
  };

  const matrizAtual = useMemo(() => {
    if (!professorIdNum || carregandoDisponibilidade || carregandoSlots) return {};
    return carregarMatriz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorIdNum, turno, disponibilidadeRows, slotsOrdenados, carregandoDisponibilidade, carregandoSlots]);

  const matrizKey = JSON.stringify(matrizAtual);
  const [ultimaMatrizKey, setUltimaMatrizKey] = useState("");
  if (matrizKey !== ultimaMatrizKey && Object.keys(matrizAtual).length > 0) {
    setUltimaMatrizKey(matrizKey);
    setMatriz(matrizAtual);
    setOriginal(matrizAtual);
  }

  const professorSelecionado = professores.find((p) => String(p.id) === professorId);
  const totalBloqueios = Object.values(matriz).filter((v) => v === "bloqueado").length;
  const totalHA = Object.values(matriz).filter((v) => v === "ha_obrigatoria").length;
  const hasChanges = JSON.stringify(matriz) !== JSON.stringify(original);

  const toggle = (dia: number, numeroAula: number) => {
    const key = cellKey(dia, numeroAula);
    setMatriz((prev) => ({ ...prev, [key]: proximoEstado(prev[key] ?? "disponivel") }));
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

  const resetar = () => setMatriz({ ...original });

  const salvar = async () => {
    if (!professorIdNum) return;

    const chaves = new Set([...Object.keys(matriz), ...Object.keys(original)]);
    const itens: {
      diaSemana: number;
      horarioSlot: number;
      disponivel: boolean;
      turno: Turno;
      horaAtividadeObrigatoria: boolean;
    }[] = [];

    chaves.forEach((key) => {
      const estadoAtual = matriz[key] ?? "disponivel";
      const estadoOriginal = original[key] ?? "disponivel";
      if (estadoAtual === estadoOriginal) return;

      const [diaStr, slotStr] = key.split("-");
      itens.push({
        diaSemana: Number(diaStr),
        horarioSlot: Number(slotStr),
        disponivel: estadoAtual !== "bloqueado",
        turno,
        horaAtividadeObrigatoria: estadoAtual === "ha_obrigatoria",
      });
    });

    if (itens.length === 0) return;

    try {
      await salvarLote.mutateAsync({ data: { professorId: professorIdNum, itens } });
      setOriginal({ ...matriz });
      queryClient.invalidateQueries({ queryKey: getListDisponibilidadeQueryKey({ professorId: professorIdNum }) });
      toast({
        title: `✅ Disponibilidade de ${professorSelecionado?.nome ?? "professor"} salva!`,
        description: `${itens.length} alteração(ões) aplicada(s) no turno ${TURNOS.find((t) => t.value === turno)?.label}.`,
      });
    } catch {
      toast({ title: "Erro ao salvar disponibilidade", variant: "destructive" });
    }
  };

  const carregando = carregandoProfessores || (!!professorIdNum && (carregandoDisponibilidade || carregandoSlots));

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
              <span className="text-muted-foreground">Hora-Atividade obrigatória</span>
            </div>
            {totalBloqueios > 0 && (
              <Badge variant="outline" className="text-rose-600 border-rose-200">
                <Lock className="w-3 h-3 mr-1" />
                {totalBloqueios} bloqueio(s)
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
              Configure em Horários → Esquema antes de gerenciar a disponibilidade deste turno.
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
                        return (
                          <td key={dia} className="p-0">
                            <button
                              onClick={() => toggle(dia, slot.numeroAula)}
                              className={cn(
                                "w-full h-12 rounded-md border-2 transition-all text-xs font-semibold",
                                estado === "disponivel" &&
                                  "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                                estado === "bloqueado" &&
                                  "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100",
                                estado === "ha_obrigatoria" &&
                                  "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100",
                              )}
                              title={
                                estado === "disponivel"
                                  ? "Disponível — clique para bloquear"
                                  : estado === "bloqueado"
                                    ? "Bloqueado — clique para marcar Hora-Atividade obrigatória"
                                    : "Hora-Atividade obrigatória — clique para liberar"
                              }
                            >
                              {estado === "disponivel" && "✓"}
                              {estado === "bloqueado" && <Lock className="w-3.5 h-3.5 mx-auto" />}
                              {estado === "ha_obrigatoria" && <GraduationCap className="w-3.5 h-3.5 mx-auto" />}
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
              Clique numa célula para alternar entre Disponível → Bloqueado → Hora-Atividade obrigatória. Use os
              botões "Bloquear/Liberar" para afetar um dia inteiro de uma vez. O motor de geração de horários nunca
              alocará o professor em slots bloqueados ou marcados como Hora-Atividade obrigatória.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
