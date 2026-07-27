"""
Extrai a grade de professores de um PDF (formato "PROFESSORES_<TURNO>")
e gera um JSON estruturado, pronto pra sincronizar com o NexGrade.

Usa as linhas de grade REAIS desenhadas no PDF (nao a posicao do texto)
como fronteira de coluna. Detecta automaticamente se a pagina tem 1 ou
2 tabelas lado a lado (caso do Vespertino/Tarde, que tem 2 professores
por linha horizontal) e processa cada metade separadamente.

Como rodar:
    python extrair_grade_pdf.py <caminho_do_pdf> <turno> <arquivo_saida.json> [--pular-hora HH:MM]
"""

import pdfplumber
import json
import re
import argparse
from collections import defaultdict

DIAS_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex"]
DIA_IDX = {"Seg": 0, "Ter": 1, "Qua": 2, "Qui": 3, "Sex": 4}
GAP_CLUSTER = 8.0
RE_HORA = re.compile(r"^\d{1,2}:\d{2}$")
RE_NOME_LINHA = re.compile(r"\d{2}/\d{2}")

NAO_AULA_EXATO = {"HA", "FORM", "SUP.", "LAB", "LABCESAR", "COORD", "PAEE"}


def eh_dash(txt):
    return txt.strip("-") == ""


def clusterizar(palavras):
    clusters, atual, ultimo_fim = [], [], None
    for w in palavras:
        if ultimo_fim is not None and (w["x0"] - ultimo_fim) > GAP_CLUSTER:
            clusters.append(atual)
            atual = []
        atual.append(w)
        ultimo_fim = w["x1"]
    if atual:
        clusters.append(atual)
    return clusters


def linhas_verticais_do_bloco(page, top_inicio, top_fim, x_min=None, x_max=None):
    verticais = [
        l for l in page.lines
        if abs(l["x0"] - l["x1"]) < 0.5 and top_inicio - 2 <= l["top"] <= top_fim + 2
        and (x_min is None or l["x0"] >= x_min - 2)
        and (x_max is None or l["x0"] <= x_max + 2)
    ]
    return sorted(set(round(l["x0"], 1) for l in verticais))


def montar_faixas(xs, header_dia_x):
    if len(xs) < 6:
        return None
    dias_ordenados = sorted(header_dia_x.items(), key=lambda kv: kv[1])
    faixas = []
    for i, (dia, _) in enumerate(dias_ordenados):
        idx = i + 1
        if idx + 1 >= len(xs):
            return None
        faixas.append((dia, xs[idx], xs[idx + 1]))
    return faixas


def detectar_split_coluna(page):
    """
    Verifica se a pagina tem 2 tabelas lado a lado (caso do Vespertino).
    Cada tabela tem exatamente 7 linhas verticais (Hor + 5 dias = 6
    colunas = 7 bordas). Se a pagina tem 14 linhas verticais distintas
    (multiplas do template reaproveitado por bloco), sao 2 tabelas --
    divide no meio entre a 7a e a 8a linha (borda direita da tabela
    esquerda e borda esquerda da tabela direita).
    """
    verticais = [l for l in page.lines if abs(l["x0"] - l["x1"]) < 0.5]
    xs = sorted(set(round(l["x0"], 1) for l in verticais))
    if len(xs) < 14:
        return None
    # agrupa em blocos de 7 (1 tabela = 7 linhas); se o padrao bater
    # (linha 7 de uma tabela bem antes da linha 1 da proxima), confirma
    # 2 colunas e devolve o meio do gap real entre elas.
    if len(xs) >= 14:
        borda_direita_esq = xs[6]
        borda_esquerda_dir = xs[7]
        if borda_esquerda_dir > borda_direita_esq:
            return (borda_direita_esq + borda_esquerda_dir) / 2
    return None


def extrair_regiao(page, x_min, x_max):
    """Extrai todos os blocos de professor dentro de uma faixa horizontal [x_min, x_max)."""
    words = [w for w in page.extract_words(use_text_flow=False, keep_blank_chars=False) if x_min <= w["x0"] < x_max]
    linhas_por_top = defaultdict(list)
    for w in words:
        linhas_por_top[round(w["top"], 1)].append(w)
    tops_ordenados = sorted(linhas_por_top.keys())

    blocos = []
    bloco_atual = None
    header_dia_x = None
    top_header = None
    faixas_atual = None

    for top in tops_ordenados:
        ws = sorted(linhas_por_top[top], key=lambda w: w["x0"])
        texts = [w["text"] for w in ws]

        if texts[:1] == ["Hor"]:
            dia_positions = {w["text"]: w["x0"] for w in ws if w["text"] in DIAS_LABEL}
            if dia_positions:
                header_dia_x = dia_positions
                top_header = top
            continue

        texto_linha = " ".join(texts)
        if RE_NOME_LINHA.search(texto_linha) and len(texts) >= 3:
            nome = re.sub(r"\s*\d{2}/\d{2}\s+A\s+\d{2}/\d{2}\s*$", "", texto_linha).strip()
            if nome:
                bloco_atual = {"professor": nome, "linhas": []}
                blocos.append(bloco_atual)
                faixas_atual = None
                continue

        primeiro = texts[0] if texts else ""
        if RE_HORA.match(primeiro) and bloco_atual is not None and header_dia_x is not None:
            if faixas_atual is None:
                xs = linhas_verticais_do_bloco(page, top_header, top + 12, x_min=x_min, x_max=x_max)
                faixas_atual = montar_faixas(xs, header_dia_x)

            hora = primeiro
            resto = [w for w in ws[1:] if not eh_dash(w["text"])]
            clusters = clusterizar(resto)

            celulas = {dia: [] for dia, _, _ in (faixas_atual or [])}
            for cluster in clusters:
                x0c = cluster[0]["x0"]
                txt = " ".join(w["text"] for w in cluster)
                if faixas_atual:
                    for dia, ini, fim in faixas_atual:
                        if ini <= x0c < fim:
                            celulas[dia].append(txt)
                            break

            bloco_atual["linhas"].append({"hora": hora, "celulas": celulas})

    return blocos


def extrair_pagina(page):
    split_x = detectar_split_coluna(page)
    if split_x is None:
        return extrair_regiao(page, 0, page.width)
    esquerda = extrair_regiao(page, 0, split_x)
    direita = extrair_regiao(page, split_x, page.width)
    return esquerda + direita


def estruturar(blocos, horas_puladas):
    aulas = []
    for b in blocos:
        horas_reais_bloco = sorted(
            {l["hora"] for l in b["linhas"] if l["hora"] not in horas_puladas}
        )
        aula_idx = {h: i + 1 for i, h in enumerate(horas_reais_bloco)}

        for l in b["linhas"]:
            if l["hora"] in horas_puladas:
                continue
            numero_aula = aula_idx[l["hora"]]
            for dia_label, itens in l["celulas"].items():
                for item in itens:
                    if "/" not in item:
                        continue
                    base = item.split("*")[0].strip()
                    if base in NAO_AULA_EXATO or item.endswith("*"):
                        continue
                    turma_str, disc_str = item.rsplit("/", 1)
                    aulas.append({
                        "professor": b["professor"],
                        "dia": DIA_IDX[dia_label],
                        "diaLabel": dia_label,
                        "numeroAula": numero_aula,
                        "hora": l["hora"],
                        "turmaCodigo": turma_str.strip(),
                        "disciplinaAbrev": disc_str.strip(),
                    })
    return aulas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("turno")
    ap.add_argument("saida")
    ap.add_argument("--pular-hora", action="append", default=[])
    args = ap.parse_args()

    todos_blocos = []
    with pdfplumber.open(args.pdf) as pdf:
        for page in pdf.pages:
            todos_blocos.extend(extrair_pagina(page))

    aulas = estruturar(todos_blocos, set(args.pular_hora))

    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(aulas, f, ensure_ascii=False, indent=2)

    turmas = sorted(set(a["turmaCodigo"] for a in aulas))
    disciplinas = sorted(set(a["disciplinaAbrev"] for a in aulas))

    print(f"Professores extraidos: {len(todos_blocos)}")
    print(f"Aulas estruturadas: {len(aulas)}")
    print(f"Turmas encontradas: {turmas}")
    print(f"Siglas de disciplina encontradas: {disciplinas}")
    print(f"\nSalvo em: {args.saida}")


if __name__ == "__main__":
    main()
