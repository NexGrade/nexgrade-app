import { useListUsuarios, useCreateUsuario, useUpdateUsuario, getListUsuariosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Shield, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

const PERFIS = [
  { value: "direcao", label: "Direção" },
  { value: "coordenacao", label: "Coordenação" },
  { value: "professor", label: "Professor" },
  { value: "secretaria", label: "Secretaria" },
];

const usuarioSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  perfil: z.string().default("secretaria"),
});
type UsuarioFormValues = z.infer<typeof usuarioSchema>;

export default function UsuariosList() {
  const { data: usuarios, isLoading } = useListUsuarios();
  const { busca, setBusca, itensFiltrados: usuariosFiltrados } = useListaFiltrada(usuarios, (u) => u.nome);
  const createUsuario = useCreateUsuario();
  const updateUsuario = useUpdateUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<UsuarioFormValues>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: { nome: "", email: "", perfil: "secretaria" },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ nome: "", email: "", perfil: "secretaria" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (usuario: any) => {
    setEditingId(usuario.id);
    form.reset({ nome: usuario.nome, email: usuario.email, perfil: usuario.perfil ?? "secretaria" });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: UsuarioFormValues) => {
    if (editingId) {
      updateUsuario.mutate({ id: editingId, data: data as any }, {
        onSuccess: () => {
          toast({ title: "Usuário atualizado!" });
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      });
    } else {
      createUsuario.mutate({ data: data as any }, {
        onSuccess: () => {
          toast({ title: "Usuário criado!" });
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
      });
    }
  };

  function perfilLabel(perfil?: string) {
    return PERFIS.find((p) => p.value === perfil)?.label ?? "Secretaria";
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários com acesso ao sistema.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Altere os dados do usuário abaixo." : "Preencha os dados do novo usuário."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl><Input placeholder="Ex: Maria Silva" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl><Input type="email" placeholder="usuario@escola.pr.gov.br" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="perfil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perfil</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PERFIS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createUsuario.isPending || updateUsuario.isPending}>
                    {createUsuario.isPending || updateUsuario.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar usuário por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : usuarios?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhum usuário cadastrado</h3>
          <p className="text-sm text-muted-foreground mt-1">Cadastre usuários para acessar o sistema.</p>
        </div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhum usuário encontrado para "{busca}".</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {usuariosFiltrados.map((usuario) => (
            <Card key={usuario.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{usuario.nome}</h3>
                    <Badge variant="outline">{perfilLabel(usuario.perfil)}</Badge>
                    {!usuario.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Mail className="w-3.5 h-3.5" />{usuario.email}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(usuario)}>
                  <Edit className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
