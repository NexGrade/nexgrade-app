# Gera NexGrade-Apresentacao.pptx (16:9, um slide por pagina) e slides/slide-NN.png a partir de
# NexGrade-Apresentacao.pdf. Cada slide e a imagem da pagina em 1920x1080, em tela cheia.
# Uso (nesta pasta): python -I gerar-pptx.py
import os
import pymupdf
from pptx import Presentation
from pptx.util import Emu

pdf = pymupdf.open("NexGrade-Apresentacao.pdf")
os.makedirs("slides", exist_ok=True)
pres = Presentation()
pres.slide_width, pres.slide_height = Emu(12192000), Emu(6858000)  # 16:9
branco = pres.slide_layouts[6]
for i, pagina in enumerate(pdf, 1):
    escala = 1920 / pagina.rect.width
    img = f"slides/slide-{i:02d}.png"
    pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala)).save(img)
    s = pres.slides.add_slide(branco)
    s.shapes.add_picture(img, 0, 0, width=pres.slide_width, height=pres.slide_height)
pres.core_properties.title = "NexGrade — Apresentação"
pres.core_properties.author = "Nexus Core Tecnologia"
pres.save("NexGrade-Apresentacao.pptx")
print("slides:", pdf.page_count)
