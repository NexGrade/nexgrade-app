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
  Settings, Printer, Sparkles, Upload, CreditCard, Library, Clock,
  SlidersHorizontal, Landmark, DoorOpen, CalendarClock,
  FileUp, // [ARQUIVO-RCO]
  NotebookPen, BarChart3, // [MENU-UNICO]
  Menu, X, ClipboardCheck, // [MENU-CELULAR] [PRESENCA-PEDAGOGIA]
  Home, Wand2, Search, // [MENU-DESTAQUE]
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSituacaoArquivoRco } from "@/lib/arquivo-rco"; // [ARQUIVO-RCO]

type Icone = React.ComponentType<{ className?: string }>;
// [MENU-DESTAQUE] numero = etapa (1, 2, 3) no titulo; icone = demais secoes; principal = Gerar Grade (fundo azul, sem selo)
type GrupoMenu = {
  label: string;
  numero?: number;
  icone?: Icone;
  principal?: boolean;
  items: Array<{ href: string; label: string; icon: Icone; badge?: string; principal?: boolean }>;
};

// [MENU-CARGOS] (31/10/2026) secoes de cada cargo: as mesmas no menu completo e no menu do proprio cargo
const secaoGestorReservas: GrupoMenu = {
  label: "Gestor de reservas",
  icone: DoorOpen, // [MENU-DESTAQUE]
  items: [
    { href: "/reservas", label: "Reservas", icon: DoorOpen }, // [MENU-ORDEM-USO] (01/11/2026) o do dia a dia primeiro
    { href: "/salas", label: "Salas", icon: Building2 }, // [GESTOR-SALAS] o gestor cadastra e edita as salas
    { href: "/horario", label: "Consultar grade", icon: Calendar }, // [CONSULTA-GESTOR]
  ],
};

const secaoPedagogia: GrupoMenu = {
  label: "Pedagogia",
  icone: ClipboardCheck, // [MENU-DESTAQUE]
  items: [
    { href: "/presenca", label: "Presença dos professores", icon: ClipboardCheck }, // [PRESENCA-PEDAGOGIA]
    { href: "/licencas", label: "Licenças", icon: FileText }, // [MENU-ORDEM-USO]
    { href: "/comunicados", label: "Comunicados", icon: Bell },
    { href: "/relatorios-pedagogicos", label: "Relatórios Pedagógicos", icon: NotebookPen }, // [MENU-UNICO] ponto e carga horaria
  ],
};

const navGroups: GrupoMenu[] = [
  // [FASE-B] Menu reorganizado na ordem em que a escola trabalha (28/09/2026).
  // [MENU-ORDEM] (23/10/2026) Cadastro separado da montagem da grade; grupos
  // renomeados (Inicio, Relatorios, RCO, Configuracoes).
  // [MENU-ORGANIZADO] (31/10/2026) Horario na montagem da grade, RCO como passo 3
  // (codigos primeiro), Painel Master so no topo.
  // [MENU-CARGOS] (31/10/2026) Salas, Reservas, Presenca, Comunicados, Licencas e Relatorios
  // Pedagogicos nas secoes do gestor de reservas e da pedagogia; sem "Onde esta agora";
  // a planilha da grade foi para Imprimir Grade.
  // [MENU-GRADE] (31/10/2026) "Grade de Horario" com Imprimir Grade; a secao Relatorios acabou.
  // [MENU-DESTAQUE] (31/10/2026) titulos com numero (etapas) ou icone; Gerar Grade em destaque.
  {
    label: "Início",
    icone: Home,
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/assistente", label: "Assistente de IA", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    // Ordem do cadastro de uma escola nova: professores ANTES de turmas,
    // porque na edicao da turma se escolhe o professor de cada disciplina.
    label: "Cadastro da escola",
    numero: 1,
    items: [
      { href: "/calendario", label: "Calendário e Turnos", icon: CalendarDays }, // [FASE-C3]
      { href: "/cursos", label: "Cursos e Disciplinas", icon: Library }, // [FASE-C2] cursos, matrizes e disciplinas [CODIGOS-NA-CURSOS] e codigos do RCO
      { href: "/professores", label: "Professores", icon: Users },
      { href: "/turmas", label: "Turmas", icon: GraduationCap },
      // Cada escola configura suas proprias regras (maximo de aulas geminadas,
      // limites por disciplina/turma e por professor) que o gerador usa.
      { href: "/regras-distribuicao", label: "Regras de Distribuição", icon: SlidersHorizontal }, // [MENU-GRADE] (31/10/2026) parte do cadastro
    ],
  },
  {
    label: "Grade de Horário", // [MENU-GRADE] (31/10/2026) antes "Montagem da grade"
    numero: 2,
    principal: true, // [MENU-DESTAQUE] a etapa mais importante do sistema
    items: [
      { href: "/disponibilidade", label: "Disponibilidade", icon: Clock },
      { href: "/horario", label: "Gerar Grade", icon: Wand2, principal: true }, // [MENU-ORGANIZADO] gerar e ajustar a grade [MENU-GRADE] (31/10/2026) antes "Horario"
      { href: "/imprimir-grade", label: "Imprimir Grade", icon: Printer }, // [IMPRIMIR-GRADE] PDFs e planilha da grade [MENU-GRADE]
    ],
  },
  {
    // [CODIGOS-NA-CURSOS] (31/10/2026) Codigos do RCO virou aba de Cursos e Disciplinas
    label: "Enviar ao RCO",
    numero: 3,
    items: [
      { href: "/rco", label: "Exportar para o RCO", icon: BarChart3 }, // [MENU-UNICO] tela propria
      { href: "/arquivo-rco", label: "Arquivo do RCO", icon: FileUp }, // [ARQUIVO-RCO]
    ],
  },
  secaoGestorReservas,
  secaoPedagogia,
  {
    label: "Configurações",
    icone: Settings,
    items: [
      { href: "/escola", label: "Escola", icon: Landmark }, // [FASE-C1] dados, configuracoes e assinatura
      { href: "/usuarios", label: "Usuários", icon: Shield },
      { href: "/importar", label: "Importar planilhas", icon: Upload },
      { href: "/virada-ano", label: "Virada do ano", icon: CalendarClock }, // [VIRADA-ANO]
      { href: "/audit", label: "Histórico", icon: History }, // [MENU-ORDEM-USO] consulta, por ultimo
    ],
  },
];

// [PEDAGOGIA] (28/10/2026) menu da pedagogia: so o que ela acompanha
const menuPedagogia: GrupoMenu[] = [
  secaoPedagogia, // [MENU-CARGOS]
  {
    label: "Consulta",
    icone: Search,
    items: [
      { href: "/horario", label: "Horário", icon: Calendar },
      { href: "/calendario", label: "Calendário", icon: CalendarDays },
    ],
  },
];

// [MENU-ORGANIZADO] (31/10/2026) menu do gestor de reservas: antes era um recorte do menu
// completo, espalhado em tres secoes. As rotas liberadas ficam no EscolaGate (App.tsx).
const menuGestorReservas: GrupoMenu[] = [secaoGestorReservas]; // [MENU-CARGOS]

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
    <nav className="flex-1 py-4 px-3 pb-6 overflow-y-auto">
      {grupos.map((group, gi) => (
        <div key={group.label} className={cn(gi > 0 && "mt-4 pt-4 border-t border-border")}>
          {/* [MENU-DESTAQUE] titulo da secao: numero da etapa ou icone, em letra legivel */}
          <p className="flex items-center gap-2 px-3 mb-1.5 text-[13px] font-semibold text-foreground">
            {group.numero ? (
              <span className={cn("w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold",
                group.principal ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                {group.numero}
              </span>
            ) : group.icone ? (
              <group.icone className="w-4 h-4 shrink-0 text-primary" />
            ) : null}
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  item.principal // [MENU-DESTAQUE] Gerar Grade sempre em azul
                    ? cn("my-1 py-2.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
                        isActive(item.href) && "ring-2 ring-primary/30 ring-offset-1 ring-offset-card")
                    : isActive(item.href)
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
