"""
patch_debug_matriz_v3.py
TEMPORARIO -- loga a lista "matrizes" (opcoes do dropdown Serie/Matriz)
e o resultado de "matrizSelecionada", pra ver se o id 520 realmente
esta presente na lista carregada, e se o find() esta batendo ou nao.

Uso:
    python patch_debug_matriz_v3.py            # dry-run
    python patch_debug_matriz_v3.py --aplicar  # aplica
"""
import sys
import shutil

ARQUIVO = "artifacts/horario-escolar/src/pages/turmas/index.tsx"

ANTIGO = '''  const cursosFiltrados = nivel ? cursos?.filter((c) => c.nivel === nivel) : cursos;
  const { data: matrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );
  const matrizSelecionada = matrizes?.find((m) => m.id === Number(matrizId));'''

NOVO = '''  const cursosFiltrados = nivel ? cursos?.filter((c) => c.nivel === nivel) : cursos;
  const { data: matrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );
  const matrizSelecionada = matrizes?.find((m) => m.id === Number(matrizId));
  console.log("[DEBUG-v3]", {
    cursoId,
    cursoIdNumber: Number(cursoId),
    matrizId,
    matrizIdNumber: Number(matrizId),
    matrizesIds: matrizes?.map((m) => ({ id: m.id, tipo: typeof m.id, serieAno: m.serieAno })),
    matrizSelecionada,
  });'''

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

    shutil.copy(ARQUIVO, ARQUIVO + ".bak-antes-debug-v3")
    with open(ARQUIVO, "w", encoding="utf-8", newline="\n") as f:
        f.write(novo_conteudo)
    print(f"APLICADO: {ARQUIVO} atualizado (com logs de debug v3).")

if __name__ == "__main__":
    main()
