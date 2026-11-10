# [TEXTO-JURIDICO] (09/11/2026) Slides do PDF base (22/10) com frases que nao seguem a regra de texto do site
# (commits 86f765a/7ca5aff/7e40c9c do nexus-core-site: sem "oficial", "integrado" ou "gravado no RCO").
# Os slides do PDF base sao imagens: este script gera bNN.png (1920x1080) de cada slide afetado e imprime, para
# cada linha a trocar, a "tampa" (cor do fundo do cartao) e o texto novo na mesma posicao, tamanho e cor, para colar
# em slides-novos.html. Uso: python -I corrigir-base.py trechos.html (grava em UTF-8)
import sys
import pymupdf

# (slide do PDF base, linha como esta no PDF (inicio), texto novo, peso, alinhamento)
TROCAS = [
    (2, "professor pela tabela oficial vira", "professor pela tabela da SEED-PR vira", 400, "left"),
    (8, "aplica como oficial.", "faz a grade valer na escola.", 400, "left"),
    (9, "Catálogo oficial pronto para usar", "Catálogo SEED-PR pronto para usar", 600, "left"),
    (9, "78 cursos oficiais", "78 cursos SEED-PR — Ensino Regular e 63", 400, "left"),
    (9, "Conformidade com a Resolução", "Alinhado à Resolução", 600, "left"),
    (9, "Calendário letivo oficial", "Calendário letivo da SEED-PR", 600, "left"),
    (12, "Melhorar a grade oficial", "Melhorar a grade em uso", 600, "left"),
    (15, "Hora-atividade calculada pela tabela oficial", "Hora-atividade alinhada à tabela da SEED-PR e distribuída automaticamente,", 400, "center"),
    (16, "Calculada pela tabela oficial da SEED-PR", "Alinhada à tabela da SEED-PR, sempre conferida", 400, "left"),
    (16, "quando (e se) ela vira oficial.", "quando (e se) ela passa a valer.", 400, "left"),
    (19, "Cursos oficiais com matrizes", "Cursos da SEED-PR com matrizes e cargas; a escola só marca os cursos", 400, "left"),
]

d = pymupdf.open("base-2026-10-22.pdf")
pix = {}
for n in sorted({t[0] for t in TROCAS}):
    pm = d[n - 1].get_pixmap(matrix=pymupdf.Matrix(2, 2))
    pm.save(f"b{n:02d}.png")
    pix[n] = pm


def cor(pm, x, y):
    r, g, b = pm.pixel(int(x), int(y))[:3]
    return (r, g, b)


def hexa(c):
    return "#%02x%02x%02x" % c


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


por_slide = {}
for n, antigo, novo, peso, alinh in TROCAS:
    linha = None
    for b in d[n - 1].get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"])
            if t.startswith(antigo):
                linha = l
    assert linha, (n, antigo)
    x0, y0, x1, y1 = [v * 2 for v in linha["bbox"]]
    tam = linha["spans"][0]["size"] * 2
    pm = pix[n]
    fundo = cor(pm, x0 - 8, (y0 + y1) / 2)
    # cor do texto: o pixel mais distante do fundo dentro da linha
    melhor, dist = fundo, -1
    for xx in range(int(x0), int(x1), 3):
        for yy in range(int(y0), int(y1), 2):
            c = cor(pm, xx, yy)
            dd = abs(lum(c) - lum(fundo))
            if dd > dist:
                melhor, dist = c, dd
    alt = y1 - y0
    if alinh == "center":
        tampa = f'<div class="tampa" style="left:{x0 - 6:.0f}px; width:{x1 - x0 + 12:.0f}px; top:{y0 - 3:.0f}px; height:{alt + 6:.0f}px; background:{hexa(fundo)}"></div>'
        texto = f'<div class="troca" style="left:0; right:0; text-align:center; top:{y0 - 2:.0f}px; font-size:{tam:.1f}px; line-height:{alt + 4:.0f}px; font-weight:{peso}; color:{hexa(melhor)}">{novo}</div>'
    else:
        larg = max(x1 - x0, 0) + 12
        tampa = f'<div class="tampa" style="left:{x0 - 4:.0f}px; width:{larg + 40:.0f}px; top:{y0 - 3:.0f}px; height:{alt + 6:.0f}px; background:{hexa(fundo)}"></div>'
        texto = f'<div class="troca" style="left:{x0:.0f}px; top:{y0 - 2:.0f}px; font-size:{tam:.1f}px; line-height:{alt + 4:.0f}px; font-weight:{peso}; color:{hexa(melhor)}">{novo}</div>'
    por_slide.setdefault(n, []).append(f"  {tampa}\n  {texto}")

saida = []
for n, itens in por_slide.items():
    saida.append(f'<!-- {n} · texto jurídico (regra do site de 06/11): slide do PDF base com as frases trocadas -->')
    saida.append(f'<section class="slide img" style="background-image:url(b{n:02d}.png)">')
    saida.append("\n".join(itens))
    saida.append("</section>\n")
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(saida))
