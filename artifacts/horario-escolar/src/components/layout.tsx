import { useEffect, useState } from "react"; // [MENU-CELULAR]
import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import { useEhGestorReservas, useEhPedagogia } from "@/lib/papeis"; // [PAPEL-RESERVAS] [GESTOR-METADATA] [PEDAGOGIA]
import { useQueryClient } from "@tanstack/react-query";
import { useListComunicados, useMarcarComunicadoLido, getListComunicadosQueryKey } from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import {
  LayoutDashboard, Users, BookOpen, GraduationCap, Calendar, CalendarDays,
  Building2, FileText, Bell, Shield, History,
  Settings, Download, Printer, Sparkles, Upload, CreditCard, Library, Clock,
  SlidersHorizontal, Landmark, DoorOpen, Hash, CalendarClock,
  FileUp, // [ARQUIVO-RCO]
  NotebookPen, BarChart3, // [MENU-UNICO]
  Menu, X, ClipboardCheck, MapPin, // [MENU-CELULAR] [PRESENCA-PEDAGOGIA]
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSituacaoArquivoRco } from "@/lib/arquivo-rco"; // [ARQUIVO-RCO]

const navGroups = [
  // [FASE-B] Menu reorganizado na ordem em que a escola trabalha (28/09/2026).
  // [MENU-ORDEM] (23/10/2026) Cadastro separado da montagem da grade; grupos
  // renomeados (Inicio, Relatorios, RCO, Configuracoes).
  // [MENU-ORGANIZADO] (31/10/2026) Horario na montagem da grade, RCO como passo 3
  // (codigos primeiro), Exportar planilhas em Relatorios, Painel Master so no topo.
  {
    label: "Início",
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/assistente", label: "Assistente de IA", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    // Ordem do cadastro de uma escola nova: professores ANTES de turmas,
    // porque na edicao da turma se escolhe o professor de cada disciplina.
    label: "1. Cadastro da escola",
    items: [
      { href: "/calendario", label: "Calendário e Turnos", icon: CalendarDays }, // [FASE-C3]
      { href: "/cursos", label: "Cursos e Disciplinas", icon: Library }, // [FASE-C2] cursos, matrizes e disciplinas
      { href: "/professores", label: "Professores", icon: Users },
      { href: "/turmas", label: "Turmas", icon: GraduationCap },
      { href: "/salas", label: "Salas", icon: Building2 },
    ],
  },
  {
    label: "2. Montagem da grade",
    items: [
      { href: "/disponibilidade", label: "Disponibilidade", icon: Clock },
      // Cada escola configura suas proprias regras (maximo de aulas geminadas,
      // limites por disciplina/turma e por professor) que o gerador usa.
      { href: "/regras-distribuicao", label: "Regras de Distribuição", icon: SlidersHorizontal },
      { href: "/horario", label: "Horário", icon: Calendar }, // [MENU-ORGANIZADO] gerar e ajustar a grade
    ],
  },
  {
    // [MENU-ORGANIZADO] codigos primeiro: sem eles a exportacao fica incompleta
    label: "3. Enviar ao RCO",
    items: [
      { href: "/codigos-rco", label: "Códigos do RCO", icon: Hash }, // [CODIGOS-RCO-TELA]
      { href: "/rco", label: "Exportar para o RCO", icon: BarChart3 }, // [MENU-UNICO] tela propria
      { href: "/arquivo-rco", label: "Arquivo do RCO", icon: FileUp }, // [ARQUIVO-RCO]
    ],
  },
  {
    label: "Dia a dia",
    items: [
      { href: "/presenca", label: "Presença dos professores", icon: ClipboardCheck }, // [PRESENCA-PEDAGOGIA]
      { href: "/onde-esta", label: "Onde está agora", icon: MapPin }, // [PRESENCA-PEDAGOGIA]
      { href: "/reservas", label: "Reservas", icon: DoorOpen },
      { href: "/licencas", label: "Licenças", icon: FileText },
      { href: "/comunicados", label: "Comunicados", icon: Bell },
    ],
  },
  {
    // [MENU-UNICO] (28/10/2026) cada relatorio num lugar so
    label: "Relatórios",
    items: [
      { href: "/imprimir-grade", label: "Imprimir Grade", icon: Printer }, // [IMPRIMIR-GRADE] todos os PDFs da grade
      { href: "/relatorios-pedagogicos", label: "Relatórios Pedagógicos", icon: NotebookPen }, // [MENU-UNICO] ponto e carga horaria
      { href: "/export", label: "Exportar planilhas", icon: Download }, // [MENU-UNICO] so CSV/JSON [MENU-ORGANIZADO]
    ],
  },
  {
    label: "Configurações",
    items: [
      { href: "/escola", label: "Escola", icon: Landmark }, // [FASE-C1] dados, configuracoes e assinatura
      { href: "/usuarios", label: "Usuários", icon: Shield },
      { href: "/importar", label: "Importar planilhas", icon: Upload },
      { href: "/audit", label: "Histórico", icon: History },
      { href: "/virada-ano", label: "Virada do ano", icon: CalendarClock }, // [VIRADA-ANO]
    ],
  },
];

// [PEDAGOGIA] (28/10/2026) menu da pedagogia: so o que ela acompanha
const menuPedagogia = [
  {
    label: "Pedagogia",
    items: [
      { href: "/presenca", label: "Presença dos professores", icon: ClipboardCheck }, // [PRESENCA-PEDAGOGIA]
      { href: "/onde-esta", label: "Onde está agora", icon: MapPin }, // [PRESENCA-PEDAGOGIA]
      { href: "/relatorios-pedagogicos", label: "Relatórios Pedagógicos", icon: NotebookPen },
      { href: "/imprimir-grade", label: "Imprimir Grade", icon: Printer },
    ],
  },
  {
    label: "Dia a dia",
    items: [
      { href: "/licencas", label: "Licenças", icon: FileText },
      { href: "/comunicados", label: "Comunicados", icon: Bell },
      { href: "/reservas", label: "Reservas (consulta)", icon: DoorOpen },
    ],
  },
  {
    label: "Consulta",
    items: [
      { href: "/horario", label: "Horário", icon: Calendar },
      { href: "/calendario", label: "Calendário", icon: CalendarDays },
    ],
  },
];

// [MENU-ORGANIZADO] (31/10/2026) menu do gestor de reservas: antes era um recorte do menu
// completo, espalhado em tres secoes. As rotas liberadas continuam no EscolaGate (App.tsx).
const menuGestorReservas = [
  {
    label: "Reservas",
    items: [
      { href: "/reservas", label: "Reservas", icon: DoorOpen },
    ],
  },
  {
    label: "Consulta",
    items: [
      { href: "/horario", label: "Horário", icon: Calendar }, // [CONSULTA-GESTOR]
      { href: "/calendario", label: "Calendário", icon: CalendarDays }, // [CALENDARIO-GESTOR] so a aba do calendario letivo, somente leitura
    ],
  },
];

type GrupoMenu = { label: string; items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }> };

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

// [MENU-ORGANIZADO] (31/10/2026) o mesmo menu no computador e no celular
function MenuLateral({ grupos, isActive, seloDoItem }: { grupos: GrupoMenu[]; isActive: (href: string) => boolean; seloDoItem: (href: string, badge?: string) => string | undefined }) {
  return (
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
                {seloDoItem(item.href, item.badge) && (
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none",
                    item.href === "/arquivo-rco" ? "bg-amber-100 text-amber-800" : "bg-[#42A5F5]/15 text-[#1565C0]")}>
                    {seloDoItem(item.href, item.badge)}
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
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // [MENU-ORGANIZADO] o Painel Master fica so no botao do topo (GlobalTopBar em App.tsx)
  const ehGestorMenu = useEhGestorReservas(); // [PAPEL-RESERVAS] [GESTOR-METADATA]
  const ehPedagogiaMenu = useEhPedagogia(); // [PEDAGOGIA]

  const grupos: GrupoMenu[] = ehPedagogiaMenu
    ? menuPedagogia // [PEDAGOGIA] sem o menu completo
    : ehGestorMenu
    ? menuGestorReservas // [PAPEL-RESERVAS]
    : navGroups;

  // [ARQUIVO-RCO] pedido em aberto da equipe NexGrade: o item do menu ganha o selo "Pedido"
  const { data: situacaoArquivoRco } = useSituacaoArquivoRco(!ehGestorMenu && !ehPedagogiaMenu);
  const seloDoItem = (href: string, badge?: string) => (href === "/arquivo-rco" && situacaoArquivoRco?.solicitado ? "Pedido" : badge);

  // [MENU-CELULAR] menu do celular: fecha ao trocar de tela
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => { setMenuAberto(false); }, [location]);
  const tituloAtual = grupos.flatMap((g) => g.items).find((i) => location === i.href || (i.href !== "/dashboard" && location.startsWith(i.href)))?.label ?? "NexGrade";

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
      {/* [MENU-CELULAR] (28/10/2026) no computador o menu fica ao lado; no celular abre pelo botao do topo */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        <MenuLateral grupos={grupos} isActive={isActive} seloDoItem={seloDoItem} />
      </aside>
      {menuAberto && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-r border-border flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Menu</span>
              <button type="button" className="p-2 -mr-2 rounded-md hover:bg-accent" onClick={() => setMenuAberto(false)} aria-label="Fechar menu"><X className="w-5 h-5" /></button>
            </div>
        <MenuLateral grupos={grupos} isActive={isActive} seloDoItem={seloDoItem} />
          </aside>
        </div>
      )}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
          <button type="button" className="p-2 rounded-md hover:bg-accent" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu className="w-5 h-5" /></button>
          <span className="text-sm font-medium truncate">{tituloAtual}</span>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
