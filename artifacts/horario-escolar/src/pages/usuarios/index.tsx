import { useState } from "react";
import { useListUsuarios, useUpdateUsuario } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@clerk/react";

const PERFIS = [
  { value: "direcao", label: "Direção", color: "bg-purple-100 text-purple-700" },
  { value: "coordenacao", label: "Coordenação", color: "bg-[#1565C0]/10 text-[#1565C0]" },
  { value: "professor", label: "Professor", color: "bg-green-100 text-green-700" },
  { value: "secretaria", label: "Secretaria", color: "bg-orange-100 text-orange-700" },
];

export default function UsuariosList() {
  const { data: usuarios = [], isLoading } = useListUsuarios();
  const { mutateAsync: updateUsuario } = useUpdateUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: clerkUser } = useUser();

  const handlePerfil = async (id: number, perfil: string) => {
    await updateUsuario({ id, data: { perfil: perfil as "direcao" | "coordenacao" | "professor" | "secretaria" } });
    await queryClient.invalidateQueries({ queryKey: ["/api/usuarios"] });
    toast({ title: "Perfil atualizado!" });
  };

  const handleAtivo = async (id: number, ativo: boolean) => {
    await updateUsuario({ id, data: { ativo } });
    await queryClient.invalidateQueries({ queryKey: ["/api/usuarios"] });
    toast({ title: ativo ? "Usuário ativado" : "Usuário desativado" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuários e Permissões</h1>
        <p className="text-muted-foreground mt-1">Gerencie os perfis de acesso da equipe escolar.</p>
      </div>

      <div className="rounded-lg border border-[#1565C0]/20 bg-[#1565C0]/5 p-4 text-sm text-[#0D47A1]">
        <p className="font-medium mb-1">Como adicionar novos usuários</p>
        <p>Compartilhe o link de cadastro da escola. Após o login pela primeira vez, o usuário aparecerá aqui para você definir o perfil de acesso.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : usuarios.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {usuarios.map((u) => {
            const perfil = PERFIS.find(p => p.value === u.perfil);
            const isMe = clerkUser?.id === u.clerkId;
            return (
              <Card key={u.id} className={`border-border/40 ${!u.ativo ? "opacity-50" : ""}`}>
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{u.nome}</p>
                      {isMe && <Badge className="bg-[#1565C0]/10 text-[#1565C0] border-0 text-xs">Você</Badge>}
                      {!u.ativo && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={u.perfil} onValueChange={v => handlePerfil(u.id, v)} disabled={isMe}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERFIS.map(p => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${p.color}`}>{p.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isMe && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAtivo(u.id, !u.ativo)} title={u.ativo ? "Desativar" : "Ativar"}>
                        {u.ativo ? <UserX className="w-3.5 h-3.5 text-muted-foreground" /> : <UserCheck className="w-3.5 h-3.5 text-green-500" />}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
