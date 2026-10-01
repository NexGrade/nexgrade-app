// [OCUPACAO-SALAS] (2026-10-01) Mapa de ocupacao do dia: salas nas colunas, aulas
// nas linhas. Verde = livre, azul = confirmada, ambar = pendente, vermelho = conflito.
type SalaMapa = { id: number; nome: string; ativa?: boolean | null };
type ReservaMapa = {
  id: number;
  salaId: number;
  numeroAula: number;
  status: string;
  titulo: string;
  professor?: { nome?: string | null } | null;
};

export function MapaOcupacaoSalas({ salas, reservas, maxAulaMinimo = 0 }: { salas: ReadonlyArray<SalaMapa>; reservas: ReadonlyArray<ReservaMapa>; maxAulaMinimo?: number }) { // [MAPA-AULAS-GRADE]
  const ativas = salas.filter((s) => s.ativa !== false);
  const validas = reservas.filter((r) => r.status !== "cancelada");
  const maxAula = Math.max(5, maxAulaMinimo, ...validas.map((r) => r.numeroAula)); // [MAPA-AULAS-GRADE]
  const aulas = Array.from({ length: maxAula }, (_, i) => i + 1);
  if (ativas.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Mapa de ocupação</h2>
          <p className="text-xs text-muted-foreground">Veja de relance quais espaços estão livres em cada aula do dia.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" /> Livre</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-100 ring-1 ring-blue-300" /> Confirmada</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" /> Pendente</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" /> Conflito</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold text-muted-foreground">Aula</th>
              {ativas.map((s) => (
                <th key={s.id} className="min-w-[140px] px-2 py-2 text-left font-semibold">{s.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aulas.map((n) => (
              <tr key={n} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-mono font-bold text-primary">{n}ª</td>
                {ativas.map((s) => {
                  const aqui = validas.filter((r) => r.salaId === s.id && r.numeroAula === n);
                  if (aqui.length === 0) {
                    return (
                      <td key={s.id} className="px-1.5 py-1.5">
                        <div className="rounded-md bg-emerald-50 px-2 py-2 font-medium text-emerald-700 ring-1 ring-emerald-200">Livre</div>
                      </td>
                    );
                  }
                  const conflito = aqui.length > 1;
                  const r = aqui[0];
                  const cor = conflito
                    ? "bg-red-50 text-red-800 ring-red-300"
                    : r.status === "pendente"
                      ? "bg-amber-50 text-amber-800 ring-amber-300"
                      : "bg-blue-50 text-blue-800 ring-blue-300";
                  const dica = aqui.map((x) => x.titulo + " - " + (x.professor?.nome ?? "?") + " (" + x.status + ")").join("\n");
                  return (
                    <td key={s.id} className="px-1.5 py-1.5">
                      <div className={"rounded-md px-2 py-1.5 ring-1 " + cor} title={dica}>
                        <div className="truncate font-semibold">{conflito ? "Conflito (" + aqui.length + ")" : r.titulo}</div>
                        <div className="truncate opacity-80">{conflito ? "Resolva na lista abaixo" : (r.professor?.nome ?? "")}</div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
