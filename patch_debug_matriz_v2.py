"""
patch_debug_matriz_v2.py
TEMPORARIO -- debug mais detalhado que da vez passada: loga tambem
matrizJaAplicadaId em toda renderizacao (nao so dentro do effect), pra
ver se ele fica oscilando entre valores (ex.: undefined -> 523 -> volta
undefined) em vez de estabilizar, e tambem estados de loading/erro da
query.

Uso:
    python patch_debug_matriz_v2.py            # dry-run
    python patch_debug_matriz_v2.py --aplicar  # aplica
"""
import sys
import shutil

ARQUIVO = "artifacts/horario-escolar/src/pages/turmas/index.tsx"

ANTIGO = '''  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  const { data: matrizDaTurma } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  useEffect(() => {
    if (matrizDaTurma && !matrizId) {
      setNivel(matrizDaTurma.nivel ?? "");
      setCursoId(String(matrizDaTurma.cursoId));
      setMatrizId(String(matrizDaTurma.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrizDaTurma]);'''

NOVO = '''  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  console.log("[DEBUG-v2 render]", { turmaAtualId: turmaAtual?.id, turmaAtualNome: turmaAtual?.nome, matrizJaAplicadaId, nivel, cursoId, matrizId });
  const { data: matrizDaTurma, isLoading: matrizLoading, isError: matrizError, error: matrizErrorObj } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  console.log("[DEBUG-v2 query]", { matrizDaTurma, matrizLoading, matrizError, matrizErrorObj });
  useEffect(() => {
    console.log("[DEBUG-v2 effect]", { matrizDaTurma, matrizId, cursoId, nivel });
    if (matrizDaTurma && !matrizId) {
      console.log("[DEBUG-v2 effect] SETANDO:", matrizDaTurma.nivel, matrizDaTurma.cursoId, matrizDaTurma.id);
      setNivel(matrizDaTurma.nivel ?? "");
      setCursoId(String(matrizDaTurma.cursoId));
      setMatrizId(String(matrizDaTurma.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrizDaTurma]);'''

def main():
    aplicar = "--aplicar" in sys.argv
    try:
        with open(ARQUIVO, "r", encoding="utf-8") as f:
            conteudo = f.read()
    except FileNotFoundError:
        print(f"ERRO: arquivo nao encontrado: {ARQUIVO}")
        sys.exit(1)

    qtd = conteudo.count(ANTIGO)
    if qtd == 0:
        print("ERRO: padrao nao encontrado.")
        sys.exit(1)
    if qtd > 1:
        print(f"ERRO: padrao encontrado {qtd} vezes, abortando.")
        sys.exit(1)

    print("Bloco encontrado (1x).")
    novo_conteudo = conteudo.replace(ANTIGO, NOVO)

    if not aplicar:
        print("[DRY-RUN] Nenhuma mudanca gravada. Rode com --aplicar para aplicar de verdade.")
        return

    shutil.copy(ARQUIVO, ARQUIVO + ".bak-antes-debug-v2")
    with open(ARQUIVO, "w", encoding="utf-8", newline="\n") as f:
        f.write(novo_conteudo)
    print(f"APLICADO: {ARQUIVO} atualizado (com logs de debug v2).")

if __name__ == "__main__":
    main()
