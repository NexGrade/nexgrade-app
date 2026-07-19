import { useMemo, useRef, useState } from "react";

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
 *
 * [FIX] `getTextoBusca` é passada como arrow function inline em quase
 * todo lugar que usa esse hook (ex.: `(p) => p.nome`) — isso cria uma
 * função NOVA a cada render do componente que chama o hook. Antes,
 * `getTextoBusca` estava nas dependências do `useMemo` abaixo, então
 * essa nova referência invalidava o memo em TODA renderização (mesmo
 * sem a lista ou a busca terem mudado), fazendo o hook reordenar e
 * refiltrar a lista inteira sempre — inclusive em renders que não
 * tinham nada a ver com a busca. Isso causava lentidão/engasgo
 * perceptível (rolagem/digitação travando) em listas renderizadas com
 * frequência. Agora guardamos a função mais recente numa ref e o
 * `useMemo` só depende de `itens`/`busca` de verdade.
 */
export function useListaFiltrada<T>(
  itens: T[] | undefined,
  getTextoBusca: (item: T) => string,
) {
  const [busca, setBusca] = useState("");

  // Sempre aponta pra função mais recente, sem entrar nas dependências
  // do useMemo (refs não disparam recálculo quando mudam).
  const getTextoBuscaRef = useRef(getTextoBusca);
  getTextoBuscaRef.current = getTextoBusca;

  const itensFiltrados = useMemo(() => {
    if (!itens) return [];
    const ordenados = [...itens].sort((a, b) =>
      getTextoBuscaRef.current(a).localeCompare(getTextoBuscaRef.current(b), "pt-BR"),
    );
    if (!busca.trim()) return ordenados;
    const buscaNorm = normalizar(busca);
    return ordenados.filter((item) => normalizar(getTextoBuscaRef.current(item)).includes(buscaNorm));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTextoBusca é acessada via ref de propósito, ver comentário acima
  }, [itens, busca]);

  return { busca, setBusca, itensFiltrados };
}
