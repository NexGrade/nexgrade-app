"""
patch_debug_matriz_v4.py
TEMPORARIO -- envolve setNivel/setCursoId/setMatrizId com
console.trace() pra capturar a pilha de chamadas exata sempre que algum
deles for chamado -- vai mostrar se e o usuario clicando, ou se e um
Select disparando onValueChange sozinho durante o carregamento
assincrono (hipotese atual).

Uso:
    python patch_debug_matriz_v4.py            # dry-run
    python patch_debug_matriz_v4.py --aplicar  # aplica
"""
import sys
import shutil

ARQUIVO = "artifacts/horario-escolar/src/pages/turmas/index.tsx"

ANTIGO = '''  const [nivelOverride, setNivel] = useState<string | null>(null);
  const [cursoIdOverride, setCursoId] = useState<string | null>(null);
  const [matrizIdOverride, setMatrizId] = useState<string | null>(null);
  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  const { data: matrizDaTurma } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  const nivel = nivelOverride ?? matrizDaTurma?.nivel ?? "";
  const cursoId = cursoIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.cursoId) : "");
  const matrizId = matrizIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.id) : "");'''

NOVO = '''  const [nivelOverride, setNivelRaw] = useState<string | null>(null);
  const [cursoIdOverride, setCursoIdRaw] = useState<string | null>(null);
  const [matrizIdOverride, setMatrizIdRaw] = useState<string | null>(null);
  const setNivel = (v: string) => { console.trace("[DEBUG-v4] setNivel chamado com:", v); setNivelRaw(v); };
  const setCursoId = (v: string) => { console.trace("[DEBUG-v4] setCursoId chamado com:", v); setCursoIdRaw(v); };
  const setMatrizId = (v: string) => { console.trace("[DEBUG-v4] setMatrizId chamado com:", v); setMatrizIdRaw(v); };
  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  const { data: matrizDaTurma } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  const nivel = nivelOverride ?? matrizDaTurma?.nivel ?? "";
  const cursoId = cursoIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.cursoId) : "");
  const matrizId = matrizIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.id) : "");
  console.log("[DEBUG-v4 render]", { nivelOverride, cursoIdOverride, matrizIdOverride, matrizDaTurma, nivel, cursoId, matrizId });'''

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

    shutil.copy(ARQUIVO, ARQUIVO + ".bak-antes-debug-v4")
    with open(ARQUIVO, "w", encoding="utf-8", newline="\n") as f:
        f.write(novo_conteudo)
    print(f"APLICADO: {ARQUIVO} atualizado (com logs de debug v4).")

if __name__ == "__main__":
    main()
