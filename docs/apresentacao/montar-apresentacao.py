# Junta a "NexGrade — Apresentação Escola 2027.pdf" (03/11/2026): slides do PDF base de 22/10
# (base-2026-10-22.pdf) + os slides novos/atualizados de slides-novos.html (impressos em PDF).
# Uso: python -I montar-apresentacao.py <slides-novos.pdf> <saida.pdf>
import sys
import pymupdf

base = pymupdf.open("base-2026-10-22.pdf")
novos = pymupdf.open(sys.argv[1])
# ("b", n) = slide n do PDF base; ("n", i) = pagina i (desde 0) de slides-novos.pdf
ORDEM = [("n", 0)] + [("b", n) for n in range(2, 11)] + [("n", 1), ("b", 12), ("n", 2)] \
    + [("b", n) for n in range(13, 17)] + [("n", 3), ("n", 4), ("n", 5), ("b", 19), ("n", 6), ("b", 21), ("b", 22),
       ("n", 7), ("b", 24), ("n", 8), ("n", 9), ("n", 10)]
saida = pymupdf.open()
for origem, n in ORDEM:
    if origem == "b":
        saida.insert_pdf(base, from_page=n - 1, to_page=n - 1)
    else:
        pg = saida.new_page(width=960, height=540)
        pg.show_pdf_page(pg.rect, novos, n)
saida.set_metadata({"title": "NexGrade — Apresentação (versão para envio)", "author": "Nexus Core Tecnologia",
                    "subject": "Atualizada em 03/11/2026"})
saida.save(sys.argv[2], garbage=4, deflate=True)
print("slides:", saida.page_count)
