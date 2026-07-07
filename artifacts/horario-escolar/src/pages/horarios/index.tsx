import { useListHorarios, useListTurmas, useListProfessores } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

export default function HorariosGlobais() {
  const [turmaId, setTurmaId] = useState<string>("all");
  const [professorId, setProfessorId] = useState<string>("all");

  const { data: turmas } = useListTurmas();
  const { data: professores } = useListProfessores();
  
  const queryParams: any = {};
  if (turmaId !== "all") queryParams.turmaId = Number(turmaId);
  if (professorId !== "all") queryParams.professorId = Number(professorId);

  const { data: horarios, isLoading } = useListHorarios(queryParams);

  const getSlot = (diaSemana: number, numeroAula: number, turmaFilterId?: number) => {
    return horarios?.find(s => 
      s.diaSemana === diaSemana && 
      s.numeroAula === numeroAula && 
      (!turmaFilterId || s.turmaId === turmaFilterId)
    );
  };

  const getMaxAulas = () => {
    if (!horarios || horarios.length === 0) return 5;
    const max = Math.max(...horarios.map(s => s.numeroAula));
    return Math.max(max, 5);
  };

  const numRows = getMaxAulas();
  
  // Se uma turma estiver selecionada, mostramos a grade da turma
  // Se "Todas" estiver selecionada, mostramos uma lista das aulas ou grade por professor se selecionado
  const isTurmaSelected = turmaId !== "all";
  const isProfessorSelected = professorId !== "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Grade Geral</h1>
        <p className="text-muted-foreground">Visualize todos os horários alocados na escola.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="space-y-2 flex-1 w-full">
            <Label>Filtrar por Turma</Label>
            <Select value={turmaId} onValueChange={(v) => { setTurmaId(v); setProfessorId("all"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as Turmas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Turmas</SelectItem>
                {turmas?.map(t => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2 flex-1 w-full">
            <Label>Filtrar por Professor</Label>
            <Select value={professorId} onValueChange={(v) => { setProfessorId(v); setTurmaId("all"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os Professores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Professores</SelectItem>
                {professores?.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="outline" onClick={() => { setTurmaId("all"); setProfessorId("all"); }}>
            Limpar
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : !isTurmaSelected && !isProfessorSelected ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p>Selecione uma turma ou professor para visualizar a grade.</p>
          <p className="text-sm mt-2">({horarios?.length || 0} aulas alocadas no total)</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-6 border-b border-border bg-muted/50">
                <div className="p-4 font-medium text-muted-foreground text-center border-r border-border">Aula</div>
                {diasSemana.map(dia => (
                  <div key={dia} className="p-4 font-semibold text-center border-r border-border last:border-0">{dia}</div>
                ))}
              </div>

              {Array.from({ length: numRows }).map((_, rowIndex) => {
                const aulaNum = rowIndex + 1;
                return (
                  <div key={aulaNum} className="grid grid-cols-6 border-b border-border last:border-0">
                    <div className="p-4 flex items-center justify-center font-medium text-muted-foreground border-r border-border bg-muted/20">
                      {aulaNum}ª Aula
                    </div>
                    
                    {Array.from({ length: 5 }).map((_, colIndex) => {
                      // Se for professor, pode ter várias aulas no mesmo slot (turmas diferentes? não deveria, mas vamos pegar a primeira)
                      // Se for turma, só tem uma aula no slot
                      const slotId = isTurmaSelected ? Number(turmaId) : undefined;
                      const slot = getSlot(colIndex, aulaNum, slotId);
                      
                      if (!slot) {
                        return (
                          <div key={`${aulaNum}-${colIndex}`} className="p-2 border-r border-border last:border-0 bg-background min-h-[100px] flex items-center justify-center">
                            <span className="text-xs text-muted-foreground/30">Vago</span>
                          </div>
                        );
                      }

                      return (
                        <div key={slot.id} className="p-2 border-r border-border last:border-0">
                          <div 
                            className="h-full rounded-md p-3 flex flex-col justify-between border shadow-sm"
                            style={{ 
                              backgroundColor: `${slot.disciplina?.cor}15`,
                              borderColor: `${slot.disciplina?.cor}30`,
                              borderLeftWidth: '4px',
                              borderLeftColor: slot.disciplina?.cor || 'var(--primary)'
                            }}
                          >
                            <div className="font-bold text-sm leading-tight" style={{ color: slot.disciplina?.cor ? `${slot.disciplina.cor}dd` : 'inherit' }}>
                              {slot.disciplina?.nome}
                            </div>
                            
                            <div className="mt-2 flex flex-col gap-1 text-xs">
                              {isProfessorSelected ? (
                                <span className="font-medium truncate text-foreground/80">Turma: {slot.turma?.nome}</span>
                              ) : (
                                <span className="font-medium truncate text-foreground/80">{slot.professor?.nome}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
