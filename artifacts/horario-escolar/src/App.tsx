import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { useGetEscolaAtual, getGetEscolaAtualQueryKey, useMasterWhoami, getMasterWhoamiQueryKey } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import ProfessoresList from "@/pages/professores/index";
import ProfessorNovo from "@/pages/professores/novo";
import ProfessorEditar from "@/pages/professores/id";
import DisciplinasList from "@/pages/disciplinas/index";
import TurmasList from "@/pages/turmas/index";
import TurmaHorario from "@/pages/turmas/horario";
import HorariosGlobais from "@/pages/horarios/index";
import HorariosExperimentais from "@/pages/horarios/experimentais";
import SalasList from "@/pages/salas/index";
import LicencasList from "@/pages/licencas/index";
import ComunicadosList from "@/pages/comunicados/index";
import UsuariosList from "@/pages/usuarios/index";
import AuditList from "@/pages/audit/index";
import ConflitosList from "@/pages/conflitos/index";
import ConfiguracoesList from "@/pages/configuracoes/index";
import ExportPage from "@/pages/export/index";
import AssistentePage from "@/pages/assistente/index";
import ImportarPage from "@/pages/importar/index";
import PlanosPage from "@/pages/planos/index";
import MasterPage from "@/pages/master/index";
import OnboardingPage from "@/pages/onboarding/index";
import CursosList from "@/pages/cursos/index";
import CursoMatrizCurricular from "@/pages/cursos/id";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1565C0] to-[#0D47A1] flex items-center justify-center">
              <span className="text-white font-black text-sm">N</span>
            </div>
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1565C0] to-[#0D47A1] flex items-center justify-center">
              <span className="text-white font-black text-sm">N</span>
            </div>
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
      <Component />
    </Layout>
  );
}

function OnboardingRoute() {
  return (
    <>
      <Show when="signed-in">
        <OnboardingPage />
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
      <MasterPage />
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
      <Route path="/professores" component={() => <ProtectedRoute component={ProfessoresList} />} />
      <Route path="/professores/novo" component={() => <ProtectedRoute component={ProfessorNovo} />} />
      <Route path="/professores/:id" component={() => <ProtectedRoute component={ProfessorEditar} />} />
      <Route path="/disciplinas" component={() => <ProtectedRoute component={DisciplinasList} />} />
      <Route path="/cursos" component={() => <ProtectedRoute component={CursosList} />} />
      <Route path="/cursos/:id" component={() => <ProtectedRoute component={CursoMatrizCurricular} />} />
      <Route path="/turmas" component={() => <ProtectedRoute component={TurmasList} />} />
      <Route path="/turmas/:id/horario" component={() => <ProtectedRoute component={TurmaHorario} />} />
      <Route path="/horarios" component={() => <ProtectedRoute component={HorariosGlobais} />} />
      <Route path="/horarios/experimentais" component={() => <ProtectedRoute component={HorariosExperimentais} />} />
      <Route path="/salas" component={() => <ProtectedRoute component={SalasList} />} />
      <Route path="/licencas" component={() => <ProtectedRoute component={LicencasList} />} />
      <Route path="/comunicados" component={() => <ProtectedRoute component={ComunicadosList} />} />
      <Route path="/usuarios" component={() => <ProtectedRoute component={UsuariosList} />} />
      <Route path="/audit" component={() => <ProtectedRoute component={AuditList} />} />
      <Route path="/conflitos" component={() => <ProtectedRoute component={ConflitosList} />} />
      <Route path="/configuracoes" component={() => <ProtectedRoute component={ConfiguracoesList} />} />
      <Route path="/export" component={() => <ProtectedRoute component={ExportPage} />} />
      <Route path="/assistente" component={() => <ProtectedRoute component={AssistentePage} />} />
      <Route path="/importar" component={() => <ProtectedRoute component={ImportarPage} />} />
      <Route path="/planos" component={() => <ProtectedRoute component={PlanosPage} />} />
      <Route path="/master" component={MasterRoute} />
      <Route component={NotFound} />
    </Switch>
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
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
