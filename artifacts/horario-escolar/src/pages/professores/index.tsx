import { useListProfessores, useDeleteProfessor, getListProfessoresQueryKey, useListDisciplinas } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Users, Mail, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

export default function ProfessoresList() {
  const { data: professores, isLoading } = useListProfessores();
  const { data: disciplinas } = useListDisciplinas();
  const deleteProfessor = useDeleteProfessor();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filtroDisciplina, setFiltroDisciplina] = useState<string>("todas");

  // Busca + ordenação alfabética primeiro, filtro de disciplina depois —
  // os dois funcionam juntos.
  const { busca, setBusca, itensFiltrados: professoresOrdenados } = useListaFiltrada(professores, (p) => p.nome);

  const professoresFiltrados = professoresOrdenados.filter((p) => {
    if (filtroDisciplina === "todas") return true;
    return p.disciplinaIds?.includes(Number(filtroDisciplina));
  });

  const handleDelete = (id: number) => {
    deleteProfessor.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Professor removido" });
          queryClient.invalidateQueries({ queryKey: getListProfessoresQueryKey() });
        },
        onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
      },
    );
  };

  function nomeDisciplina(id: number) {
    return disciplinas?.find((d) => d.id === id)?.nome ?? `#${id}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Professores</h1>
          <p className="text-muted-foreground">Gerencie o corpo docente da escola.</p>
        </div>
        <Link href="/professores/novo">
          <Button><Plus className="mr-2 h-4 w-4" />Novo Professor</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CampoBusca
          value={busca}
          onChange={setBusca}
          placeholder="Buscar professor por nome..."
          className="max-w-sm"
        />
        <Select value={filtroDisciplina} onValueChange={setFiltroDisciplina}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Filtrar por disciplina" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as disciplinas</SelectItem>
            {disciplinas?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : professores?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhum professor cadastrado</h3>
          <p className="text-sm text-muted-foreground mt-1">Cadastre os professores para montar a grade horária.</p>
        </div>
      ) : professoresFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">
            Nenhum professor encontrado{busca ? ` para "${busca}"` : ""}{filtroDisciplina !== "todas" ? " com essa disciplina" : ""}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professoresFiltrados.map((professor) => (
            <Card key={professor.id}>
              <CardContent className="pt-6 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{professor.nome}</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(professor.disciplinaIds ?? []).slice(0, 3).map((id: number) => (
                        <Badge key={id} variant="outline" className="text-xs">{nomeDisciplina(id)}</Badge>
                      ))}
                      {(professor.disciplinaIds ?? []).length > 3 && (
                        <Badge variant="outline" className="text-xs">+{professor.disciplinaIds!.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/professores/${professor.id}`}>
                      <Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover professor?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso também removerá a disponibilidade e os horários vinculados a "{professor.nome}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(professor.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {professor.email && (
                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{professor.email}</div>
                  )}
                  {professor.telefone && (
                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{professor.telefone}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
