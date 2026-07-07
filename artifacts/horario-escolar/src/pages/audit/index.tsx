import { useListAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { History, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const ACOES_COLORS: Record<string, string> = {
  criar: "bg-green-100 text-green-700",
  atualizar: "bg-[#1565C0]/10 text-[#1565C0]",
  remover: "bg-red-100 text-red-700",
  gerar: "bg-purple-100 text-purple-700",
};

const ENTIDADES = [
  "Todos", "professores", "disciplinas", "turmas", "horarios", "salas", "licencas", "comunicados", "usuarios"
];

export default function AuditList() {
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const { data: logs = [], isLoading } = useListAuditLogs({
    entidade: filtroEntidade || undefined,
    limit: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico de Alterações</h1>
          <p className="text-muted-foreground mt-1">Auditoria completa de todas as ações realizadas no sistema.</p>
        </div>
        <Select value={filtroEntidade} onValueChange={v => setFiltroEntidade(v === "Todos" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar entidade" />
          </SelectTrigger>
          <SelectContent>
            {ENTIDADES.map(e => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <History className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum registro de auditoria encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const acaoKey = Object.keys(ACOES_COLORS).find(k => log.acao.toLowerCase().includes(k));
            const badgeColor = acaoKey ? ACOES_COLORS[acaoKey] : "bg-gray-100 text-gray-700";
            return (
              <Card key={log.id} className="border-border/30">
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`border-0 text-xs ${badgeColor}`}>{log.acao}</Badge>
                      <span className="text-sm font-medium capitalize">{log.entidade}</span>
                      {log.entidadeId && <span className="text-xs text-muted-foreground">#{log.entidadeId}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    {log.usuarioNome && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.usuarioNome}
                      </span>
                    )}
                    <span>{new Date(log.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
