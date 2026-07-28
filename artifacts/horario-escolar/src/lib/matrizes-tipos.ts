// Só os TIPOS das matrizes curriculares oficiais SEED-PR -- os DADOS
// (as ~5.400 linhas de grade curricular extraídas dos PDFs) agora
// vivem só no backend (artifacts/api-server/src/lib/), atrás de
// autenticação. Ver artifacts/api-server/src/routes/matrizes-oficiais.ts.

export interface ItemMatrizTecnica {
  nome: string;
  categoria: "FGB" | "IFA" | "APF" | "PD";
  cargaHorariaSemanal: number;
  obrigatoria: boolean;
}

export interface MatrizTecnicaTemplate {
  codigo: string;
  curso: string;
  eixo: string;
  formaOferta: "integrada" | "concomitante_intercomplementar";
  series: { serieAno: string; itens: ItemMatrizTecnica[] }[];
}

export type CategoriaMatrizOficial = "BNC" | "PD" | "FGB" | "PFO" | "IFA" | "IF";

export interface ItemMatrizOficial {
  nome: string;
  categoria: CategoriaMatrizOficial;
  cargaHorariaSemanal: number;
}

export interface SerieMatrizOficial {
  serieAno: string;
  itens: ItemMatrizOficial[];
}

export interface MatrizOficialTemplate {
  id: string;
  label: string;
  nivel: "fundamental" | "medio";
  series: SerieMatrizOficial[];
}
