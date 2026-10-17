// [CALENDARIO-CORES] (15/10/2026, separado em 17/10/2026) cores e nomes do calendario escolar,
// usados na tela Calendario Escolar e no calendario do app do professor (mesmo visual nos dois).
export const TIPO_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  feriado: { label: "Feriado", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  recesso: { label: "Recesso", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  ponto_facultativo: { label: "Ponto Facultativo", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  estudo_planejamento: { label: "Estudo e Planejamento", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  inicio_ano_letivo: { label: "Início do Ano Letivo", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  fim_ano_letivo: { label: "Fim do Ano Letivo", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  inicio_trimestre: { label: "Início de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]", dot: "bg-[#1565C0]" },
  fim_trimestre: { label: "Fim de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]", dot: "bg-[#1565C0]" },
  reposicao: { label: "Reposição (dia letivo)", color: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
};
export const tipoDoEvento = (tipo: string) => TIPO_LABELS[tipo] ?? { label: tipo, color: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };

// cada trimestre com um tom; [CALENDARIO-ZEBRA] semanas intercaladas (dia / dia2)
export const COR_TRIMESTRE = [
  { card: "bg-gradient-to-br from-sky-50 to-white border-sky-200", icone: "text-sky-600", numero: "text-sky-700", dia: "bg-sky-50/70", dia2: "bg-sky-100/70", borda: "border-sky-200" },
  { card: "bg-gradient-to-br from-emerald-50 to-white border-emerald-200", icone: "text-emerald-600", numero: "text-emerald-700", dia: "bg-emerald-50/70", dia2: "bg-emerald-100/70", borda: "border-emerald-200" },
  { card: "bg-gradient-to-br from-violet-50 to-white border-violet-200", icone: "text-violet-600", numero: "text-violet-700", dia: "bg-violet-50/70", dia2: "bg-violet-100/70", borda: "border-violet-200" },
  { card: "bg-gradient-to-br from-amber-50 to-white border-amber-200", icone: "text-amber-600", numero: "text-amber-700", dia: "bg-amber-50/70", dia2: "bg-amber-100/70", borda: "border-amber-200" },
];
// feriado e recesso pintados de leve
export const FUNDO_DIA: Record<string, string> = {
  feriado: "bg-rose-50",
  recesso: "bg-amber-50",
  ponto_facultativo: "bg-orange-50",
  estudo_planejamento: "bg-purple-50",
};
export const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
