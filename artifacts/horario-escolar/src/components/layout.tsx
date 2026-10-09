import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import { useEhGestorReservas } from "@/lib/papeis"; // [PAPEL-RESERVAS] [GESTOR-METADATA]
import { useQueryClient } from "@tanstack/react-query";
import { useMasterWhoami, useListComunicados, useMarcarComunicadoLido, getListComunicadosQueryKey } from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import {
  LayoutDashboard, Users, BookOpen, GraduationCap, Calendar, CalendarDays,
  Building2, FileText, Bell, Shield, History,
  Settings, Download, Sparkles, Upload, CreditCard, Library, ShieldCheck, Clock,
  SlidersHorizontal, Landmark, DoorOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  // [FASE-B] Menu reorganizado na ordem em que a escola trabalha (28/09/2026).
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/horario", label: "Horário", icon: Calendar },
      { href: "/assistente", label: "Assistente de IA", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    // Ordem do cadastro de uma escola nova: professores ANTES de turmas,
    // porque na edicao da turma se escolhe o professor de cada disciplina.
    label: "Montagem da escola",
    items: [
      { href: "/calendario", label: "Calendário e Turnos", icon: CalendarDays }, // [FASE-C3]
      { href: "/cursos", label: "Cursos e Disciplinas", icon: Library }, // [FASE-C2] cursos, matrizes e disciplinas
      { href: "/professores", label: "Professores", icon: Users },
      { href: "/turmas", label: "Turmas", icon: GraduationCap },
      { href: "/disponibilidade", label: "Disponibilidade", icon: Clock },
      { href: "/salas", label: "Salas", icon: Building2 },
      // Cada escola configura suas proprias regras (maximo de aulas geminadas,
      // limites por disciplina/turma e por professor) que o gerador usa.
      { href: "/regras-distribuicao", label: "Regras de Distribuição", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Dia a dia",
    items: [
      { href: "/reservas", label: "Reservas", icon: DoorOpen },
      { href: "/licencas", label: "Licenças", icon: FileText },
      { href: "/comunicados", label: "Comunicados", icon: Bell },
    ],
  },
  {
    label: "Dados",
    items: [
      { href: "/importar", label: "Importar Dados", icon: Upload },
      { href: "/export", label: "Exportar Dados", icon: Download },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/escola", label: "Escola", icon: Landmark }, // [FASE-C1] dados, configuracoes e assinatura
      { href: "/usuarios", label: "Usuários", icon: Shield },
      { href: "/audit", label: "Histórico", icon: History },
    ],
  },
];

function NotificationBellAdmin() {
  const queryClient = useQueryClient();
  const { data: notificacoes } = useListComunicados(undefined, {
    query: { queryKey: getListComunicadosQueryKey(), refetchInterval: 30000 },
  });
  const marcarLida = useMarcarComunicadoLido({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListComunicadosQueryKey() }),
    },
  });
  return (
    <NotificationBell
      notificacoes={notificacoes}
      onMarcarLida={(id) => marcarLida.mutate({ id })}
    />
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // RF-MASTER: o link só aparece pra quem de fato é administrador da
  // plataforma — a checagem real de acesso continua sendo feita no
  // backend (requireMaster) e na rota (MasterGate em App.tsx); isto
  // aqui só é para não poluir o menu de quem não precisa dele.
  const { data: whoami } = useMasterWhoami();
  const ehGestorMenu = useEhGestorReservas(); // [PAPEL-RESERVAS] [GESTOR-METADATA]

  const gruposCompletos = whoami?.isMaster
    ? [...navGroups, { label: "Administração", items: [{ href: "/master", label: "Painel Master", icon: ShieldCheck }] }]
    : navGroups;
  // [PAPEL-RESERVAS] gestor de reservas ve so o item Reservas no menu
  const grupos = ehGestorMenu
    ? navGroups
        .map((g) => ({ ...g, label: g.label === "Montagem da escola" ? "Consulta" : g.label, items: g.items
          .filter((i) => i.href === "/horario" || i.href === "/reservas" || i.href === "/calendario") // [CONSULTA-GESTOR]
          .map((i) => (i.href === "/calendario" ? { ...i, label: "Calendário" } : i)) })) // [CALENDARIO-GESTOR] so a aba do calendario letivo, somente leitura
        .filter((g) => g.items.length > 0)
    : gruposCompletos;

  const isActive = (href: string) =>
    location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    // [FIX] h-screen -> h-full: este container agora vive dentro do
    // wrapper flex "flex-1 min-h-0" do App.tsx, abaixo da GlobalTopBar
    // fixa (seletor de organizacao). Usar h-screen aqui faria este bloco
    // assumir a altura da JANELA INTEIRA, ignorando o espaco ja ocupado
    // pela barra de cima, e gerar uma barra de rolagem dupla. h-full
    // faz este bloco preencher exatamente o espaco restante que o
    // container pai (flex-1) calculou para ele.
    <div className="h-full flex w-full bg-background overflow-hidden">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <nav className="flex-1 py-4 px-3 pb-6 space-y-5 overflow-y-auto">
          {grupos.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {"badge" in item && item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#42A5F5]/15 text-[#1565C0] leading-none">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-4 mt-2 border-t border-border space-y-1">
            <div className="flex items-center gap-3 px-3 py-1 rounded-md text-sm font-medium text-muted-foreground">
              <NotificationBellAdmin />
              <span className="flex-1 whitespace-nowrap">Notificações</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground">
              <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                <UserButton
                  appearance={{
                    elements: {
                      rootBox: "w-6 h-6",
                      userButtonBox: "w-6 h-6",
                      userButtonTrigger: "w-6 h-6",
                      userButtonAvatarBox: "w-6 h-6",
                    },
                  }}
                />
              </span>
              <span className="flex-1 whitespace-nowrap">Minha conta</span>
            </div>
          </div>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
