import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type NotificacaoItem = {
  id: number;
  titulo: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  createdAt: string;
};

export function NotificationBell({
  notificacoes,
  onMarcarLida,
}: {
  notificacoes: NotificacaoItem[] | undefined;
  onMarcarLida: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const naoLidas = (notificacoes ?? []).filter((n) => !n.lida);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {naoLidas.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {naoLidas.length > 9 ? "9+" : naoLidas.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        {!notificacoes || notificacoes.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Nenhuma notificação.
          </div>
        ) : (
          notificacoes.slice(0, 20).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.lida) onMarcarLida(n.id);
              }}
              className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                n.lida ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm">{n.titulo}</span>
                {!n.lida && <Badge variant="default" className="shrink-0 h-1.5 w-1.5 rounded-full p-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{n.mensagem}</p>
            </button>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
