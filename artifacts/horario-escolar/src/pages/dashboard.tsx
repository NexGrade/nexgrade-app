import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, BookOpen, AlertCircle, CheckCircle2, CalendarDays, Building2, FileText, Bell, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Professores", value: stats?.totalProfessores ?? 0, icon: Users, color: "text-[#1565C0]", href: "/professores" },
    { title: "Turmas", value: stats?.totalTurmas ?? 0, icon: GraduationCap, color: "text-green-500", href: "/turmas" },
    { title: "Disciplinas", value: stats?.totalDisciplinas ?? 0, icon: BookOpen, color: "text-purple-500", href: "/disciplinas" },
    { title: "Salas", value: stats?.totalSalas ?? 0, icon: Building2, color: "text-cyan-500", href: "/salas" },
    { title: "Aulas Distribuídas", value: stats?.aulasDistribuidas ?? 0, icon: CheckCircle2, color: "text-emerald-500", href: "/horarios" },
    { title: "Turmas sem Horário", value: stats?.turmasSemHorario ?? 0, icon: CalendarDays, color: stats?.turmasSemHorario ? "text-amber-500" : "text-muted-foreground", href: "/turmas" },
    { title: "Conflitos Detectados", value: stats?.totalConflitos ?? 0, icon: AlertCircle, color: stats?.totalConflitos ? "text-destructive" : "text-muted-foreground", href: "/conflitos" },
    { title: "Licenças Ativas", value: stats?.licencasAtivas ?? 0, icon: FileText, color: stats?.licencasAtivas ? "text-orange-500" : "text-muted-foreground", href: "/licencas" },
    { title: "Comunicados Não Lidos", value: stats?.comunicadosNaoLidos ?? 0, icon: Bell, color: stats?.comunicadosNaoLidos ? "text-pink-500" : "text-muted-foreground", href: "/comunicados" },
  ];

  const hasAlerts = (stats?.totalConflitos ?? 0) > 0 || (stats?.turmasSemHorario ?? 0) > 0 || (stats?.licencasAtivas ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo(a) ao NexGrade — sistema de gestão de horários.</p>
        </div>
        <Link href="/horarios">
          <Button>Ver Grade Horária</Button>
        </Link>
      </div>

      {hasAlerts && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Flame className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-0.5">Atenção necessária</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              {(stats?.totalConflitos ?? 0) > 0 && (
                <li><Link href="/conflitos" className="underline">{stats?.totalConflitos} conflito(s) detectado(s)</Link></li>
              )}
              {(stats?.turmasSemHorario ?? 0) > 0 && (
                <li><Link href="/turmas" className="underline">{stats?.turmasSemHorario} turma(s) sem horário</Link></li>
              )}
              {(stats?.licencasAtivas ?? 0) > 0 && (
                <li><Link href="/licencas" className="underline">{stats?.licencasAtivas} licença(s) ativa(s)</Link></li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
