# Junta a "NexGrade — Apresentação Escola 2027.pdf" (03/11/2026): slides do PDF base de 22/10
# (base-2026-10-22.pdf) + os slides novos/atualizados de slides-novos.html (impressos em PDF).
# Uso: python -I montar-apresentacao.py <slides-novos.pdf> <saida.pdf>
import sys
import pymupdf

base = pymupdf.open("base-2026-10-22.pdf")
novos = pymupdf.open(sys.argv[1])
# ("b", n) = slide n do PDF base; ("n", i) = pagina i (desde 0) de slides-novos.pdf
# [TEXTO-JURIDICO] (09/11/2026) os slides 2, 8, 9, 12, 15, 16 e 19 do PDF base saem refeitos (paginas 11 a 17 de
# slides-novos: imagem do slide + frase nova, ver corrigir-base.py) e o Modo Rascunho entra depois de "quando a grade
# nao fecha" (pagina 18)
ORDEM = [("n", 0), ("n", 11)] + [("b", n) for n in range(3, 8)] + [("n", 12), ("n", 13), ("b", 10), ("n", 1), ("n", 14),
         ("n", 2), ("n", 18), ("b", 13), ("b", 14), ("n", 15), ("n", 16), ("n", 3), ("n", 4), ("n", 5), ("n", 17), ("n", 6),
         ("b", 21), ("b", 22), ("n", 7), ("b", 24), ("n", 8), ("n", 9), ("n", 10)]
saida = pymupdf.open()
for origem, n in ORDEM:
    if origem == "b":
        saida.insert_pdf(base, from_page=n - 1, to_page=n - 1)
    else:
        pg = saida.new_page(width=960, height=540)
        pg.show_pdf_page(pg.rect, novos, n)
saida.set_metadata({"title": "NexGrade — Apresentação (versão para envio)", "author": "Nexus Core Tecnologia",
                    "subject": "Atualizada em 09/11/2026"})
saida.save(sys.argv[2], garbage=4, deflate=True)
print("slides:", saida.page_count)
