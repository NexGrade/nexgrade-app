import { useMemo, useState } from "react";

// Remove acentos pra busca não-sensível a acentuação (ex: "matematica"
// encontra "Matemática").
function normalizar(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Hook genérico pra ordenar uma lista alfabeticamente e filtrar por um
 * campo de busca em tempo real. Uso:
 *
 *   const { busca, setBusca, itensFiltrados } = useListaFiltrada(
 *     disciplinas, (d) => d.nome
 *   );
 */
export function useListaFiltrada<T>(
  itens: T[] | undefined,
  getTextoBusca: (item: T) => string,
) {
  const [busca, setBusca] = useState("");

  const itensFiltrados = useMemo(() => {
    if (!itens) return [];
    const ordenados = [...itens].sort((a, b) =>
      getTextoBusca(a).localeCompare(getTextoBusca(b), "pt-BR"),
    );
    if (!busca.trim()) return ordenados;
    const buscaNorm = normalizar(busca);
    return ordenados.filter((item) => normalizar(getTextoBusca(item)).includes(buscaNorm));
  }, [itens, busca, getTextoBusca]);

  return { busca, setBusca, itensFiltrados };
}
