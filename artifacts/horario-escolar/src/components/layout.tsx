import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import { useMasterWhoami } from "@workspace/api-client-react";
import {
  LayoutDashboard, Users, BookOpen, GraduationCap, Calendar, CalendarDays,
  Building2, FileText, Bell, Shield, History,
  Settings, Download, Sparkles, Upload, CreditCard, Library, ShieldCheck, Clock,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/horario", label: "Horário", icon: Calendar },
      { href: "/calendario", label: "Calendário Escolar", icon: CalendarDays },
      // [NOVO] Carga Horária Cumprida x Exigida ganhou menu próprio,
      // separado do Calendário Escolar (antes vivia na mesma tela).
      { href: "/carga-horaria", label: "Carga Horária", icon: BarChart3 },
      { href: "/assistente", label: "Assistente de IA", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/professores", label: "Professores", icon: Users },
      { href: "/disponibilidade", label: "Disponibilidade", icon: Clock },
      { href: "/disciplinas", label: "Disciplinas", icon: BookOpen },
      { href: "/cursos", label: "Cursos e Matriz Curricular", icon: Library },
      { href: "/turmas", label: "Turmas", icon: GraduationCap },
      { href: "/salas", label: "Salas", icon: Building2 },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/licencas", label: "Licenças", icon: FileText },
      { href: "/comunicados", label: "Comunicados", icon: Bell },
      { href: "/importar", label: "Importar Dados", icon: Upload },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/export", label: "Exportar Dados", icon: Download },
      { href: "/planos", label: "Planos & Billing", icon: CreditCard },
      { href: "/usuarios", label: "Usuários", icon: Shield },
      { href: "/audit", label: "Histórico", icon: History },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function NexGradeLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1565C0] to-[#0D47A1] flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-white font-black text-[13px] leading-none">N</span>
      </div>
      <div className="leading-none">
        <span className="font-bold text-[15px] tracking-tight text-foreground font-heading">NexGrade</span>
        <span className="block text-[10px] text-muted-foreground font-medium tracking-wide -mt-0.5">by Nexus Core Tecnologia</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // RF-MASTER: o link só aparece pra quem de fato é administrador da
  // plataforma — a checagem real de acesso continua sendo feita no
  // backend (requireMaster) e na rota (MasterGate em App.tsx); isto
  // aqui é só para não poluir o menu de quem não precisa dele.
  const { data: whoami } = useMasterWhoami();

  const grupos = whoami?.isMaster
    ? [...navGroups, { label: "Administração", items: [{ href: "/master", label: "Painel Master", icon: ShieldCheck }] }]
    : navGroups;

  const isActive = (href: string) =>
    location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-border">
          <NexGradeLogo />
        </div>
        <nav className="flex-1 py-3 px-3 space-y-5 overflow-y-auto">
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
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground">
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      rootBox: "w-4 h-4",
                      userButtonBox: "w-4 h-4",
                      userButtonTrigger: "w-4 h-4",
                      userButtonAvatarBox: "w-4 h-4",
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
        <header className="h-16 flex items-center px-8 border-b border-border bg-card gap-4">
          <div className="flex-1" />
        </header>
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
