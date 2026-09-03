"""
patch_debug_matriz.py
TEMPORARIO -- adiciona console.log dentro do useEffect de
pre-preenchimento de matriz, pra ver no console do navegador exatamente
o que esta acontecendo (se matrizDaTurma chega certo, se o if entra,
etc.). Depois de descobrir o bug, tem que reverter esse log (nao e pra
ficar em producao).

Uso:
    python patch_debug_matriz.py            # dry-run
    python patch_debug_matriz.py --aplicar  # aplica
"""
import sys
import shutil

ARQUIVO = "artifacts/horario-escolar/src/pages/turmas/index.tsx"

ANTIGO = '''  useEffect(() => {
    if (matrizDaTurma && !matrizId) {
      setNivel(matrizDaTurma.nivel ?? "");
      setCursoId(String(matrizDaTurma.cursoId));
      setMatrizId(String(matrizDaTurma.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrizDaTurma]);'''

NOVO = '''  useEffect(() => {
    console.log("[DEBUG matriz]", { matrizDaTurma, matrizId, editingId, turmaAtualMatrizId: turmaAtual?.matrizCurricularId });
    if (matrizDaTurma && !matrizId) {
      console.log("[DEBUG matriz] entrou no if, vai setar:", matrizDaTurma.nivel, matrizDaTurma.cursoId, matrizDaTurma.id);
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

    shutil.copy(ARQUIVO, ARQUIVO + ".bak-antes-debug")
    with open(ARQUIVO, "w", encoding="utf-8", newline="\n") as f:
        f.write(novo_conteudo)
    print(f"APLICADO: {ARQUIVO} atualizado (com logs temporarios).")
    print(f"Backup salvo em {ARQUIVO}.bak-antes-debug")
    print("\nProximo passo: commit + push, esperar o deploy, abrir a tela de novo")
    print("com o Console do navegador aberto, e mandar o que aparecer com [DEBUG matriz].")

if __name__ == "__main__":
    main()
