import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateProfessor, getListProfessoresQueryKey, useListDisciplinas } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { MultiSelectBusca } from "@/components/multi-select-busca";

const professorSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  telefone: z.string().optional(),
  disciplinaIds: z.array(z.number()).optional(),
});

type ProfessorFormValues = z.infer<typeof professorSchema>;

export default function ProfessorNovo() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProfessor = useCreateProfessor();
  const { data: disciplinas } = useListDisciplinas();

  const form = useForm<ProfessorFormValues>({
    resolver: zodResolver(professorSchema),
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
      disciplinaIds: [],
    },
  });

  const onSubmit = (data: ProfessorFormValues) => {
    createProfessor.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Professor cadastrado com sucesso!" });
        queryClient.invalidateQueries({ queryKey: getListProfessoresQueryKey() });
        setLocation("/professores");
      },
      onError: () => {
        toast({ title: "Erro ao cadastrar", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Novo Professor(a)</h1>
        <p className="text-muted-foreground">Preencha os dados para adicionar um novo docente.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Maria Silva" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="maria@escola.edu.br" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone (Opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 98765-4321" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="disciplinaIds"
                render={({ field }) => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">Disciplinas</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Selecione as disciplinas que este professor leciona.
                      </p>
                    </div>
                    <FormControl>
                      <MultiSelectBusca
                        options={(disciplinas ?? []).map((d) => ({ value: d.id, label: d.nome }))}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        placeholder="Selecione as disciplinas..."
                        buscarPlaceholder="Buscar disciplina por nome..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setLocation("/professores")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createProfessor.isPending}>
                  {createProfessor.isPending ? "Salvando..." : "Salvar Professor(a)"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
