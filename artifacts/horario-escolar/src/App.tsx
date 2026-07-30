import { useEffect, useRef, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useAuth, OrganizationSwitcher } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { useGetEscolaAtual, getGetEscolaAtualQueryKey, useMasterWhoami, getMasterWhoamiQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";

// [FIX] Divisão do pacote JS (code-splitting) -- antes, todas as ~24
// telas eram importadas de forma estática aqui no topo, o que fazia o
// Vite juntar TUDO num chunk só (941 kB / 238 kB gzip no build, com
// aviso de "chunk grande demais"). Isso significa que abrir qualquer
// tela — mesmo só "Professores" — baixava o código de todas as outras
// telas junto. Trocando pra `lazy()`, cada tela vira um arquivo .js
// separado, baixado só quando a rota é de fato acessada. O `<Suspense>`
// mais abaixo mostra um esqueleto de carregamento enquanto o arquivo da
// tela ainda está chegando (só na primeira vez que aquela rota é
// visitada nessa sessão -- depois fica em cache no navegador).
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ProfessoresList = lazy(() => import("@/pages/professores/index"));
const HorarioHubPage = lazy(() => import("@/pages/horario/index"));
const ProfessorNovo = lazy(() => import("@/pages/professores/novo"));
const ProfessorEditar = lazy(() => import("@/pages/professores/id"));
const DisciplinasList = lazy(() => import("@/pages/disciplinas/index"));
const TurmasList = lazy(() => import("@/pages/turmas/index"));
const TurmaHorario = lazy(() => import("@/pages/turmas/horario"));
const SalasList = lazy(() => import("@/pages/salas/index"));
const LicencasList = lazy(() => import("@/pages/licencas/index"));
const ComunicadosList = lazy(() => import("@/pages/comunicados/index"));
const UsuariosList = lazy(() => import("@/pages/usuarios/index"));
const AuditList = lazy(() => import("@/pages/audit/index"));
const ConfiguracoesList = lazy(() => import("@/pages/configuracoes/index"));
const ExportPage = lazy(() => import("@/pages/export/index"));
const AssistentePage = lazy(() => import("@/pages/assistente/index"));
const ImportarPage = lazy(() => import("@/pages/importar/index"));
const PlanosPage = lazy(() => import("@/pages/planos/index"));
const MasterPage = lazy(() => import("@/pages/master/index"));
const OnboardingPage = lazy(() => import("@/pages/onboarding/index"));
const CursosList = lazy(() => import("@/pages/cursos/index"));
const DisponibilidadePage = lazy(() => import("@/pages/disponibilidade/index"));
const CalendarioEscolarPage = lazy(() => import("@/pages/calendario/index"));
// [NOVO] Página já existia em disco (completa e funcional -- usa hooks
// reais de configuração/turmas/professores/limites diários), mas nunca
// tinha sido ligada nem no App.tsx nem no menu. Achado na faxina de
// código morto/órfão do menu lateral.
const RegrasDistribuicaoPage = lazy(() => import("@/pages/regras-distribuicao/index"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Esqueleto mostrado enquanto o arquivo .js de uma tela ainda está
// carregando -- mesmo visual já usado nos gates de autenticação abaixo,
// pra não introduzir um estilo de loading diferente.
function PaginaCarregando() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#2563EB",
    colorForeground: "#0f172a",
    colorMutedForeground: "#64748b",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#f8fafc",
    colorInputForeground: "#0f172a",
    colorNeutral: "#e2e8f0",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-bold",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700",
    formFieldLabel: "text-slate-700 font-medium",
    footerActionLink: "text-[#1565C0] hover:text-[#0D47A1] font-medium",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-[#1565C0]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-slate-700",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-[#1565C0] hover:bg-[#0D47A1] text-white",
    formFieldInput: "border-slate-200 bg-slate-50 text-slate-900",
    footerAction: "bg-slate-50 border-t border-slate-100",
    dividerLine: "bg-slate-200",
    alert: "border border-red-100 bg-red-50",
    otpCodeFieldInput: "border-slate-200",
    formFieldRow: "gap-4",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img src="/logo.svg" alt="NexGrade" className="w-8 h-8 rounded-lg" />
            <h1 className="text-2xl font-bold text-slate-900 font-heading">NexGrade</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">Sistema de Gestão de Horários Escolares</p>
        </div>
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={clerkAppearance} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img src="/logo.svg" alt="NexGrade" className="w-8 h-8 rounded-lg" />
            <h1 className="text-2xl font-bold text-slate-900 font-heading">NexGrade</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">Crie sua conta para começar</p>
        </div>
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={clerkAppearance} />
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <EscolaGate component={Component} />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// RF-ESC-01: toda rota protegida (exceto a própria /onboarding) exige que
// a escola já tenha sido cadastrada. Isso garante que qualquer usuário
// recém-logado — mesmo entrando direto por um link profundo — passe pelo
// onboarding antes de acessar o restante do produto.
function EscolaGate({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useGetEscolaAtual({
    query: { queryKey: getGetEscolaAtualQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data?.cadastrada) {
    return <Redirect to="/onboarding" />;
  }

  return (
    <Layout>
      <Suspense fallback={<PaginaCarregando />}>
        <Component />
      </Suspense>
    </Layout>
  );
}

function OnboardingRoute() {
  return (
    <>
      <Show when="signed-in">
        <Suspense fallback={<PaginaCarregando />}>
          <OnboardingPage />
        </Suspense>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// RF-MASTER: gate próprio, além do EscolaGate normal — precisa passar
// pelas duas checagens (escola cadastrada E ser administrador da
// plataforma). A checagem de verdade é sempre no backend
// (requireMaster); isto aqui só evita renderizar a tela pra quem não
// tem acesso, e redireciona de volta ao dashboard.
function MasterRoute() {
  return (
    <>
      <Show when="signed-in">
        <MasterRouteConteudo />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function MasterRouteConteudo() {
  const { data: whoami, isLoading } = useMasterWhoami({
    query: { queryKey: getMasterWhoamiQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!whoami?.isMaster) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Layout>
      <Suspense fallback={<PaginaCarregando />}>
        <MasterPage />
      </Suspense>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/onboarding" component={OnboardingRoute} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/horario" component={() => <ProtectedRoute component={HorarioHubPage} />} />
      <Route path="/professores" component={() => <ProtectedRoute component={ProfessoresList} />} />
      <Route path="/professores/novo" component={() => <ProtectedRoute component={ProfessorNovo} />} />
      <Route path="/professores/:id" component={() => <ProtectedRoute component={ProfessorEditar} />} />
      <Route path="/disponibilidade" component={() => <ProtectedRoute component={DisponibilidadePage} />} />
      <Route path="/disciplinas" component={() => <ProtectedRoute component={DisciplinasList} />} />
      <Route path="/cursos" component={() => <ProtectedRoute component={CursosList} />} />
      <Route path="/turmas" component={() => <ProtectedRoute component={TurmasList} />} />
      <Route path="/turmas/:id/horario" component={() => <ProtectedRoute component={TurmaHorario} />} />
      <Route path="/salas" component={() => <ProtectedRoute component={SalasList} />} />
      <Route path="/licencas" component={() => <ProtectedRoute component={LicencasList} />} />
      <Route path="/comunicados" component={() => <ProtectedRoute component={ComunicadosList} />} />
      <Route path="/calendario" component={() => <ProtectedRoute component={CalendarioEscolarPage} />} />
      <Route path="/regras-distribuicao" component={() => <ProtectedRoute component={RegrasDistribuicaoPage} />} />
      <Route path="/usuarios" component={() => <ProtectedRoute component={UsuariosList} />} />
      <Route path="/audit" component={() => <ProtectedRoute component={AuditList} />} />
      <Route path="/configuracoes" component={() => <ProtectedRoute component={ConfiguracoesList} />} />
      <Route path="/export" component={() => <ProtectedRoute component={ExportPage} />} />
      <Route path="/assistente" component={() => <ProtectedRoute component={AssistentePage} />} />
      <Route path="/importar" component={() => <ProtectedRoute component={ImportarPage} />} />
      <Route path="/planos" component={() => <ProtectedRoute component={PlanosPage} />} />
      <Route path="/master" component={MasterRoute} />
      <Route component={() => <Suspense fallback={<PaginaCarregando />}><NotFound /></Suspense>} />
    </Switch>
  );
}

function ApiAuthBridge() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenGetter(() => getToken());
  }, [isLoaded, getToken]);

  return null;
}

// [NOVO] Ao trocar de organizacao (escola) no OrganizationSwitcher
// global, forca um RELOAD COMPLETO da pagina para /dashboard em vez de
// uma navegacao "leve" via useLocation().
//
// [FIX v2] A versao anterior causava um LOOP INFINITO de reload
// ("piscando", nunca carregava). Causa: o efeito rodava antes do Clerk
// terminar de carregar (isLoaded ainda false), quando orgId ainda e
// `undefined`. Esse `undefined` virava o "valor de referencia" errado.
// Assim que o Clerk terminava de carregar de verdade e orgId mudava de
// `undefined` para o valor real, o watcher interpretava isso como uma
// troca de organizacao genuina e recarregava a pagina -- e a cada
// reload o mesmo ciclo se repetia, para sempre. A correcao: so grava o
// valor de referencia depois que `isLoaded` (do proprio useAuth) vier
// true, ou seja, depois que o Clerk realmente terminou de resolver a
// sessao. So a partir dai uma mudanca de orgId conta como troca real.
//
// [FIX v1, mantido] A ideia de reload completo (em vez de navegacao
// leve via Wouter) segue valida: evita a corrida entre o Clerk
// atualizar o token de sessao (que carrega o orgId ativo) e o React
// Query refazer a busca de useGetEscolaAtual, que fazia a tela ficar
// presa em /onboarding mesmo trocando de volta pra uma organizacao com
// escola ja cadastrada.
function OrgSwitchWatcher() {
  const { orgId, isLoaded } = useAuth();
  const orgIdReferencia = useRef<string | null | undefined>(undefined);
  const referenciaDefinida = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!referenciaDefinida.current) {
      referenciaDefinida.current = true;
      orgIdReferencia.current = orgId;
      return;
    }
    if (orgIdReferencia.current !== orgId) {
      orgIdReferencia.current = orgId;
      window.location.href = `${basePath}/dashboard`;
    }
  }, [orgId, isLoaded]);

  return null;
}

// [NOVO] Barra fixa, sempre visivel para qualquer usuario logado --
// inclusive nas telas de /onboarding e nos gates de carregamento, que
// ficam FORA do <Layout> (o Layout so renderiza depois que o EscolaGate
// confirma que ha uma escola cadastrada). Antes desta barra, nao havia
// nenhuma forma de trocar de organizacao (escola) pela interface: quem
// tivesse mais de uma Organization no Clerk (ex: administrador da
// Nexus Core testando varias escolas, ou futuramente um cliente com
// mais de uma unidade) ficava sem jeito de escolher, e o app sempre
// caia no fallback de "nenhuma escola encontrada" -> /onboarding.
//
// hidePersonal={true}: o NexGrade e 100% multi-tenant por Organization
// (escola = Organization). Sem isso, o switcher tambem ofereceria
// "conta pessoal" como opcao, que resolve para orgId=null no backend
// (getEscolaId cai no fallback de userId) -- exatamente o cenario que
// gerava o bug de isolamento corrigido nesta sessao. Forcar apenas
// Organizations evita reabrir esse buraco pela interface.
function GlobalTopBar() {
  return (
    <Show when="signed-in">
      <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="NexGrade" className="w-6 h-6 rounded-md shrink-0" />
          <span className="text-sm font-semibold text-foreground font-heading hidden sm:inline">NexGrade</span>
        </div>
        {/* [FIX] Props afterCreateOrganizationUrl/afterSelectOrganizationUrl/
            afterLeaveOrganizationUrl removidas -- elas navegam atraves do
            routerPush customizado do ClerkProvider (window.history.pushState),
            que nao avisa nem o Wouter nem o React da mudanca de rota. A
            navegacao apos trocar de organizacao agora e feita via reload
            completo pelo OrgSwitchWatcher (ver comentario acima). */}
        <OrganizationSwitcher
          hidePersonal
          appearance={{
            // [NOVO] colorMutedForeground mais escuro que o padrao do tema
            // (#64748b, definido em clerkAppearance acima) -- so aqui, sem
            // afetar o SignIn/SignUp nem outros componentes do Clerk. O
            // Clerk usa essa cor pro texto de organizacoes NAO selecionadas
            // dentro do popover do seletor, que ficava com contraste baixo
            // demais pra leitura confortavel.
            variables: {
              colorMutedForeground: "#475569",
            },
            elements: {
              rootBox: "flex items-center",
              organizationSwitcherTrigger: "px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50",
            },
          }}
        />
      </div>
    </Show>
  );
}

function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => window.history.pushState(null, "", to)}
      routerReplace={(to) => window.history.replaceState(null, "", to)}
      appearance={clerkAppearance}
      // [FIX] Em versões recentes do Clerk (6.x), afterSignOutUrl saiu
      // de ser prop do <UserButton> individual e passou a ser opção
      // global do provider -- faz sentido, já que é comportamento de
      // navegação do app inteiro, não de um botão específico. Movido
      // de components/layout.tsx pra cá.
      afterSignOutUrl="/"
    >
      <ApiAuthBridge />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {/* OrgSwitchWatcher fica aqui dentro por conveniencia -- nao tem
              mais dependencia estrita do Wouter (usa window.location.href
              para o reload, nao useLocation), mas manter perto do Router
              deixa claro que o proposito dele e reagir a navegacao. */}
          <WouterRouter base={basePath}>
            <div className="h-screen flex flex-col overflow-hidden">
              <OrgSwitchWatcher />
              <GlobalTopBar />
              {/* [FIX] overflow-auto adicionado aqui -- paginas que NAO usam
                  o <Layout> (onboarding, sign-in, sign-up, not-found) nao
                  tem rolagem propria (o <Layout> tem a sua, em
                  "flex-1 overflow-auto p-8" dentro de components/layout.tsx).
                  Sem overflow-auto neste wrapper, conteudo mais alto que a
                  tela (ex: o formulario inteiro de /onboarding) ficava sem
                  jeito de rolar ate o fim. */}
              <div className="flex-1 min-h-0 overflow-auto">
                <Router />
              </div>
            </div>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
