# -*- coding: utf-8 -*-
"""
Extração da grade de professores a partir dos relatórios PDF do Urania
(Manhã/Tarde/Noite) para o formato usado por scripts/sincronizar-grade.ts.

Este é o método PADRÃO e definitivo -- consolida duas correções
descobertas com dor de cabeça numa sessão de depuração:

1. LAYOUT DE 2 COLUNAS POR PÁGINA (afeta principalmente o relatório da
   Tarde): cada página tem duas tabelas de professor lado a lado, na
   MESMA faixa vertical. Se você agrupar texto só por posição vertical
   (round(top)), o nome de dois professores adjacentes se funde numa
   linha só, e o regex de cabeçalho só pega o primeiro -- fazendo o
   segundo professor da linha "sumir" ou, pior, uma tabela pegar o
   cabeçalho errado (do professor vizinho). A correção: separar as
   palavras por FAIXA HORIZONTAL (coluna) antes de agrupar por linha,
   descobrindo as colunas reais a partir do x0 das próprias tabelas
   da página (não assumir 1 ou 2 colunas fixas -- cada página pode
   variar).

2. NUMERAÇÃO DO NOTURNO: o horário das 18:00 é sempre vago (nunca tem
   aula real -- confirmado: zero aulas reais nesse horário em toda a
   base). A escola CONFIRMOU que quer esse vago contando como "período
   1" mesmo assim (não pular a numeração) -- ou seja, numeração
   cronológica direta: 18:00=1(vago), 18:45=2, 19:35=3, 20:35=4,
   21:25=5, 22:10=6. Isso precisa bater com o esquema já configurado em
   horario_slots (ver corrigir-esquema-noturno-v2.cjs) -- se um dia
   isso mudar de novo, os dois lados (esquema + extração) têm que
   mudar juntos.

3. CABEÇALHOS COM NÚMERO NO NOME: alguns "professores" no relatório
   não são pessoas reais -- são placeholders de turma híbrida, tipo
   "HIBRIDA-1NB", "HIBRIDA-2NB". O regex de cabeçalho original só
   aceitava letras (nunca dígitos) antes da data, então esses nomes
   nunca eram reconhecidos como cabeçalho -- e a tabela deles acabava
   caindo pro nome do professor mais próximo que FOI reconhecido
   (gerando gente real marcada em turmas que na verdade eram aula
   hor a distância/híbrida de outra turma). Corrigido permitindo
   dígitos no início e no meio do nome do cabeçalho.

Uso:
    python3 extrair-grade-urania.py /caminho/para/pasta/com/os/3/pdfs

Espera exatamente estes 3 nomes de arquivo na pasta:
    08_PROFESSORES_MANHA_24_A_28_08.pdf  (ou qualquer nome com "MANHA")
    08_PROFESSORES_TARDE_24_A_28_08.pdf  (ou qualquer nome com "TARDE")
    08_PROFESSORES_NOITE_24_A_28_08.pdf  (ou qualquer nome com "NOITE")

Gera 3 arquivos na pasta atual:
    aulas_matutino.json, aulas_vespertino.json, aulas_noturno.json
prontos para uso direto com scripts/sincronizar-grade.ts.
"""
import sys
import glob
import re
import json
import pdfplumber

DIAS = ["Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"]
DIA_LABEL = {"Segunda-feira": "Seg", "Terca-feira": "Ter", "Quarta-feira": "Qua",
             "Quinta-feira": "Qui", "Sexta-feira": "Sex"}

# Horários de cada turno, na ORDEM CRONOLÓGICA DIRETA -- o índice+1 vira
# numeroAula. Isso precisa bater com horario_slots no banco de cada escola.
SLOTS_POR_TURNO = {
    "matutino":   ["07:30", "08:20", "09:25", "10:15", "11:05", "11:55"],
    "vespertino": ["13:05", "13:55", "14:45", "15:50", "16:40"],
    "noturno":    ["18:00", "18:45", "19:35", "20:35", "21:25", "22:10"],  # 18:00 = vago, mas conta como período 1
}

# Marcadores que NUNCA são aula de verdade (mesma regra usada desde o
# início do projeto: HA, PAEE, coordenação, formação, laboratório fora
# de contexto de disciplina, etc. -- e qualquer código terminado em *
# sozinho, tipo "3NC*", que é anotação de turma híbrida solta).
NAO_AULA = re.compile(
    r'^(HA\*?|PAEE|COORD|FORM|FOR|LAB|TEATR|REP\*?|CEL\.\d|I\.E\.?|P\.ADM\.?|IF-\w+|[\dA-Z]+\*)$',
    re.IGNORECASE
)


def eh_dash(s):
    if not s:
        return True
    return s.replace(" ", "").replace("-", "") == ""


def eh_aula_real(codigo):
    if eh_dash(codigo):
        return False
    codigo = codigo.strip()
    if NAO_AULA.match(codigo):
        return False
    return "/" in codigo  # aula real sempre tem o formato TURMA/DISCIPLINA


def extrair_headers_da_coluna(words, x_min, x_max):
    """Extrai cabeçalhos de professor (nome + intervalo de datas) SÓ
    dentro de uma faixa horizontal (uma coluna da página). Isso evita
    que dois professores lado a lado se misturem na mesma linha."""
    subset = [w for w in words if x_min <= w["x0"] < x_max]
    lines = {}
    for w in subset:
        key = round(w["top"])
        lines.setdefault(key, []).append(w)
    headers = []
    for top, ws in lines.items():
        ws_sorted = sorted(ws, key=lambda w: w["x0"])
        line_text = " ".join(w["text"] for w in ws_sorted)
        m = re.match(r'^([A-ZÀ-Ú0-9][A-ZÀ-Úa-zà-ú0-9\.\*\- ]*?)\s+\d{2}/\d{2}\s+[Aa]\s+\d{2}/\d{2}', line_text)
        if m:
            headers.append((top, m.group(1).strip()))
    headers.sort()
    return headers


def extrair_pdf(caminho, turno_saida):
    """Extrai todas as aulas reais de um PDF, lidando corretamente com
    o layout de N colunas por página (descoberto dinamicamente)."""
    resultados = []
    sem_professor = 0

    with pdfplumber.open(caminho) as pdf:
        for page in pdf.pages:
            words = page.extract_words(use_text_flow=False)
            tables = page.find_tables()
            if not tables:
                continue

            # descobre as colunas reais desta página a partir das
            # próprias tabelas (não assume número fixo de colunas)
            colunas_x0 = sorted(set(round(t.bbox[0]) for t in tables))
            faixas = []
            for i, cx in enumerate(colunas_x0):
                x_min = cx - 20
                x_max = (colunas_x0[i + 1] - 20) if i + 1 < len(colunas_x0) else 10000
                faixas.append((x_min, x_max))

            headers_por_faixa = [extrair_headers_da_coluna(words, xm, xM) for xm, xM in faixas]

            for t in tables:
                table_top = t.bbox[1]
                table_x0 = t.bbox[0]
                faixa_idx = min(range(len(faixas)), key=lambda i: abs(faixas[i][0] + 20 - table_x0))
                headers = headers_por_faixa[faixa_idx]
                candidatos = [h for h in headers if h[0] < table_top]
                professor_pdf = candidatos[-1][1] if candidatos else None
                if not professor_pdf:
                    sem_professor += 1
                    continue

                rows = t.extract()
                if not rows or rows[0][0] != "Hor":
                    continue
                for row in rows[1:]:
                    if not row or not row[0]:
                        continue
                    horario = row[0].strip()
                    slots = SLOTS_POR_TURNO[turno_saida]
                    if horario not in slots:
                        continue
                    numero_aula = slots.index(horario) + 1  # numeração cronológica direta
                    for i, dia in enumerate(DIAS):
                        col_idx = i + 1
                        if col_idx >= len(row):
                            continue
                        celula = (row[col_idx] or "").strip()
                        if eh_aula_real(celula):
                            turma, disciplina = celula.split("/", 1)
                            resultados.append({
                                "professor": professor_pdf,
                                "dia": DIAS.index(dia),
                                "diaLabel": DIA_LABEL[dia],
                                "numeroAula": numero_aula,
                                "hora": horario,
                                "turmaCodigo": turma.strip(),
                                "disciplinaAbrev": disciplina.strip(),
                            })

    if sem_professor:
        print(f"  ⚠ {sem_professor} tabela(s) sem professor identificado em {caminho} -- revisar manualmente.")
    return resultados


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 extrair-grade-urania.py /caminho/para/pasta/com/pdfs")
        sys.exit(1)

    pasta = sys.argv[1]
    mapa = {"MANHA": "matutino", "TARDE": "vespertino", "NOITE": "noturno"}

    for chave, turno_saida in mapa.items():
        candidatos = glob.glob(f"{pasta}/*{chave}*.pdf") + glob.glob(f"{pasta}/*{chave.title()}*.pdf")
        if not candidatos:
            print(f"AVISO: nenhum PDF encontrado para '{chave}' em {pasta} -- pulando {turno_saida}.")
            continue
        caminho = candidatos[0]
        print(f"Extraindo {turno_saida} de {caminho} ...")
        resultados = extrair_pdf(caminho, turno_saida)
        nome_saida = f"aulas_{turno_saida}.json"
        with open(nome_saida, "w", encoding="utf-8") as f:
            json.dump(resultados, f, ensure_ascii=False, indent=2)
        print(f"  -> {len(resultados)} aulas -> {nome_saida}")


if __name__ == "__main__":
    main()
