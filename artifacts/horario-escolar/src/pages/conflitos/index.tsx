import { useGetConflitosComSugestoes } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const GRAVIDADE_CONFIG = {
  critico: { label: "Crítico", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  alto: { label: "Alto", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  medio: { label: "Médio", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  baixo: { label: "Baixo", color: "bg-[#1565C0]/10 text-[#1565C0] border-[#1565C0]/20", dot: "bg-[#42A5F5]" },
};

const TIPO_LABELS: Record<string, string> = {
  professor_duplicado: "Professor Duplicado",
  carga_insuficiente: "Carga Insuficiente",
  professor_nao_habilitado: "Professor Não Habilitado",
  janelas_excessivas: "Janelas Excessivas",
  turma_sem_horario: "Turma Sem Horário",
};

export default function ConflitosList() {
  const { data: conflitosComSugestoes = [], isLoading, refetch, isFetching } = useGetConflitosComSugestoes();
  const [expanded, setExpanded] = useState<number | null>(null);

  const total = conflitosComSugestoes.length;
  const criticos = conflitosComSugestoes.filter(c => c.conflito.gravidade === "critico").length;
  const altos = conflitosComSugestoes.filter(c => c.conflito.gravidade === "alto").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conflitos Detectados</h1>
          <p className="text-muted-foreground mt-1">
            Detecção automática com sugestões algorítmicas de resolução.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Reanalisar
        </Button>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <Card className={`border-border/50 ${criticos > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total de conflitos</p>
              <p className={`text-3xl font-bold ${total > 0 ? "text-destructive" : "text-foreground"}`}>{total}</p>
            </CardContent>
          </Card>
          <Card className={`border-border/50 ${criticos > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Críticos</p>
              <p className={`text-3xl font-bold ${criticos > 0 ? "text-red-600" : "text-foreground"}`}>{criticos}</p>
            </CardContent>
          </Card>
          <Card className={`border-border/50 ${altos > 0 ? "border-orange-200 bg-orange-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Alta prioridade</p>
              <p className={`text-3xl font-bold ${altos > 0 ? "text-orange-600" : "text-foreground"}`}>{altos}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : total === 0 ? (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p className="font-semibold text-green-700 text-lg">Nenhum conflito encontrado!</p>
            <p className="text-green-600 text-sm mt-1">A grade horária está consistente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conflitosComSugestoes.map((item, idx) => {
            const g = GRAVIDADE_CONFIG[item.conflito.gravidade as keyof typeof GRAVIDADE_CONFIG] ?? GRAVIDADE_CONFIG.baixo;
            const isOpen = expanded === idx;
            return (
              <Card key={idx} className={`border ${g.color} transition-all`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${g.dot}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`border text-xs ${g.color}`}>{g.label}</Badge>
                          <span className="text-xs text-muted-foreground">{TIPO_LABELS[item.conflito.tipo] ?? item.conflito.tipo}</span>
                        </div>
                        <CardTitle className="text-sm font-medium mt-1">{item.conflito.descricao}</CardTitle>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs gap-1"
                      onClick={() => setExpanded(isOpen ? null : idx)}
                    >
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isOpen ? "Ocultar" : "Ver sugestões"}
                    </Button>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0">
                    <div className="border-t border-current/20 pt-3 mt-1">
                      <p className="text-xs font-semibold mb-2 opacity-80">Sugestões de resolução:</p>
                      <ul className="space-y-1.5">
                        {item.sugestoes.map((s, si) => (
                          <li key={si} className="flex items-start gap-2 text-xs opacity-90">
                            <span className="mt-0.5 w-4 h-4 rounded-full bg-current/10 flex items-center justify-center shrink-0 font-bold text-[10px]">{si + 1}</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
