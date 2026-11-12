# [ANDREATTA-URANIA] (11/11/2026) Le os 4 PDFs do Urania do C.E. Andre Andreatta (Quatro Barras) e grava
# lib/db/urania-andreatta-2026.json para o scripts/cadastrar-andreatta-urania.ts (api-server).
#   - "Relatorio de Turmas (Individual)": a disciplina (sigla do Urania) de cada turma/dia/aula;
#   - "HORARIO PROFESSORES" (geral): o professor de cada aula, HA, COR (coordenacao), traco (indisponivel)
#     e vazio (livre). Colunas pelas linhas verticais desenhadas no PDF (6 por dia na manha, 5 na tarde).
#   - "R9A", "R6C"... no relatorio de professores = professor de apoio (codocencia) da recomposicao da turma.
# Uso: python ler-urania-andreatta.py "<pasta dos PDFs>" [saida.json]
import pdfplumber, sys, json, re, os, unicodedata
from collections import defaultdict, Counter

DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"]
RE_H = re.compile(r"^\d{1,2}:\d{2}$")
PASTA = sys.argv[1]
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "urania-andreatta-2026.json")
ESCOLA = "esc_99494098d00349d2b5442e66"
ARQS = {
    "matutino": ("HORÁRIO MANHÃ TURMA 31_08.pdf", "HORÁRIO MANHÃ PROF GERAL 31_08.pdf", "31/08/2026"),
    "vespertino": ("HORÁRIO TARDE TURMA 11_05.pdf", "HORÁRIO TARDE PROF GERAL 11_05.pdf", "11/05/2026"),
}

# turma -> curso do catalogo e serie
FUND = {"tipo": "oficial", "id": "fund_finais_tempo_parcial_diurno"}
LGG = {"tipo": "oficial", "id": "medio_2026_tempo_parcial_diurno_lggchs"}
MAT = {"tipo": "oficial", "id": "medio_2026_tempo_parcial_diurno_matcnt"}
ADM = {"tipo": "tecnico", "codigo": "2511"}
ADM3 = {"tipo": "tecnico", "codigo": "1624"}
def curso_da_turma(nome):
    s, l = nome[0], nome[-1]
    if s in "6789": return FUND, f"{s}º Ano", "fundamental"
    serie = f"{s}ª Série"
    return {"1A": ADM, "1B": LGG, "2A": LGG, "2B": LGG, "2C": MAT, "3A": ADM3, "3B": LGG}[s + l], serie, "medio_tecnico"

# sigla do Urania -> nome da disciplina na matriz (por tipo de turma quando muda)
SIGLAS = {
    "ART": "Arte", "CIE": "Ciências", "CIEN": "Ciências", "ED FIS": "Educação Física", "E FIS": "Educação Física",
    "GEO": "Geografia", "GEOG": "Geografia", "HIST": "História", "ING": "Língua Inglesa", "MAT": "Matemática",
    "PORT": "Língua Portuguesa", "L POR": "Língua Portuguesa", "E REL": "Ensino Religioso", "RED_LEITURA": "Redação e Leitura",
    "ED. DIGITAL": "Educação Digital e Computação: Programação e IA", "Ed Digital": "Educação Digital e Computação: Programação e IA",
    "BIO": "Biologia", "QUI": "Química", "FIS": "Física", "FILO": "Filosofia", "SOC": "Sociologia", "ED. FIN": "Educação Financeira",
    "Arte Pr": "Arte Paranaense", "Hist Pr": "História do Paraná", "Geog Pr": "Geografia do Paraná",
    "Lit Prod Tex": "Literatura e Produção de Texto", "Fil A Tex": "Filosofia: Análise de Textos Filosóficos",
    "Soc Gov": "Sociologia: Governo, Cidadania e Sociedade", "Program": "Programação", "Fisi e Tec": "Física e Tecnociência",
    "Robótica": "Robótica", "PJV": "Projeto de Vida",
    "Fin Empr": "Finanças empresariais", "Prin Adm": "Princípios de administração", "Prin Econ": "Princípios econômicos",
    "Inf Empr": "Informática empresarial", "Est Mark": "Estratégias de marketing", "Tec Integr": "Técnicas integradas",
    "REC.HUM": "Recursos humanos", "ADM.FIN.ORÇ": "Administração Financeira e Orçamentária", "Cont Finanças": "Controladoria e Finanças",
    "L Gest Pessoas": "Liderança e Gestão de Pessoas", "NEG.VENDAS": "Negociação e Vendas", "N Direito": "Noções de Direito",
    "Tec Ferr Gest": "Tecnologias e Ferramentas de Gestão",
    # 3a serie Linguagens e C. Humanas (3B): nomes do Urania -> itinerario da matriz 2026
    "Geopolítica": "Geografia I", "Gov e Cidad": "Sociologia I", "Hist I": "História I", "Mid Dig II": "Arte II",
    "ESPANHOL": "Língua Espanhola",  # a matriz tem Lingua Inglesa I (3); a escola da Espanhol (3) — ver relatorio
}
REC_FUND = {"Rec Matemática": "Rec. Aprend. Matemática", "REC MATEMÁTICA": "Rec. Aprend. Matemática",
            "Rec Portugês": "Leitura e Recomposição da Aprendizagem em Língua Portuguesa",
            "LEIT REC PORT": "Leitura e Recomposição da Aprendizagem em Língua Portuguesa"}
REC_MEDIO = {"Rec Matemática": "Recomposição da Aprendizagem em Matemática",
             "Rec Portugês": "Recomposição da Aprendizagem em Língua Portuguesa"}
# Tarde de 11/05, sexta: no relatorio de professores a Agatha (apoio) esta em R6A na 1a e R6B na 2a, mas no
# relatorio de turmas a Rec. Matematica (Catia) e 6oB na 1a e 6oA na 2a. Troca as duas (os horarios dela nao mudam).
CORRIGIR_APOIO = {("vespertino", "AGATHA", "Sex", 1, "6ºA"): "6ºB", ("vespertino", "AGATHA", "Sex", 2, "6ºB"): "6ºA"}

def disciplina(sigla, nivel):
    rec = REC_FUND if nivel == "fundamental" else REC_MEDIO
    return rec.get(sigla) or SIGLAS.get(sigla)

def turma_nome(n):  # o Urania mistura "9ºA" e "9ªB": fica sempre "º", como a escola escreve
    n = n.replace(" ", "")
    return n[0] + "º" + n[-1] if len(n) == 3 and n[1] in "ºª°" else n

def sem_acento(s): return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
def chave_prof(n):
    k = re.sub(r"[^A-Z]", "", sem_acento(n).upper())
    return {"ANAV": "ANAVIEIRA"}.get(k, k)  # "ANA V." da tarde = "ANA VIEIRA" da manha
def bonito(n):
    n = n.replace(".", "").strip()
    partes = [p.capitalize() for p in n.split()]
    if len(partes) == 2 and len(partes[1]) <= 3 and partes[1] not in ("Ana",): partes[1] += "."  # "Marcos Ant", "Aline P"
    return " ".join(partes)

def linhas(ws):
    ws = sorted(ws, key=lambda w: (round(w["top"]), w["x0"]))
    out = []
    for w in ws:
        if out and abs(out[-1][0]["top"] - w["top"]) < 2: out[-1].append(w)
        else: out.append([w])
    return [sorted(l, key=lambda w: w["x0"]) for l in out]

def ler_turmas(arq):
    turmas = {}
    with pdfplumber.open(arq) as pdf:
        for p in pdf.pages:
            atual = None; cab = None
            for l in linhas(p.extract_words(x_tolerance=1.5)):
                txt = [w["text"] for w in l]
                if txt[0] == "Turma:":
                    atual = turma_nome(" ".join(txt[1:])); turmas[atual] = {"slots": [], "grade": {d: [] for d in DIAS}}; continue
                if txt[0] == "Hor" and atual:
                    cab = [(w["x0"] + w["x1"]) / 2 for w in l[1:6]]; continue
                if atual and cab and RE_H.match(txt[0]):
                    lim = [(cab[i] + cab[i + 1]) / 2 for i in range(4)]
                    cel = {d: [] for d in DIAS}
                    for w in l[1:]:
                        cel[DIAS[sum(((w["x0"] + w["x1"]) / 2) > x for x in lim)]].append(w["text"])
                    turmas[atual]["slots"].append(txt[0])
                    for d in DIAS:
                        t = " ".join(cel[d])
                        turmas[atual]["grade"][d].append("" if t and set(t) == {"-"} else t)
    return turmas

def ler_profs(arq):
    profs = {}
    with pdfplumber.open(arq) as pdf:
        for p in pdf.pages:
            bordas = sorted(set(round(l["x0"], 1) for l in p.lines if abs(l["x0"] - l["x1"]) < 1))[1:]
            ncel = len(bordas) - 1
            for l in linhas(p.extract_words(x_tolerance=1)):
                if l[0]["top"] < 115 or l[0]["text"].startswith("Hor"): continue
                nomews = [w for w in l if w["x1"] <= bordas[0] + 0.5]
                if not nomews: continue
                cel = [[] for _ in range(ncel)]
                for w in l:
                    cx = (w["x0"] + w["x1"]) / 2
                    i = sum(cx > b for b in bordas) - 1
                    if cx >= bordas[0] and 0 <= i < ncel: cel[i].append(w["text"])
                vals = []
                for c in cel:
                    t = " ".join(c)
                    vals.append("---" if t and set(t.replace(" ", "")) == {"-"} else t)
                toks = [w["text"] for w in nomews]
                nome = "".join(toks) if all(len(t) <= 2 for t in toks) else " ".join(toks)
                if nome in profs: raise SystemExit(f"nome repetido no relatorio: {nome}")
                por = ncel // 5
                profs[nome] = {d: vals[i * por:(i + 1) * por] for i, d in enumerate(DIAS)}
    return profs

saida = {"escola": ESCOLA, "fonte": {}, "horas": {}, "turmas": {}, "aulas": [], "disponibilidade": [], "professores": {}, "avisos": [], "avisos_corrigidos": []}
nomes = defaultdict(set)
for turno, (at, ap, data) in ARQS.items():
    saida["fonte"][turno] = f"Urania {data}: {at} + {ap}"
    turmas = ler_turmas(os.path.join(PASTA, at))
    profs = ler_profs(os.path.join(PASTA, ap))
    for n in profs: nomes[chave_prof(n)].add(n)
    # quem da aula em cada turma/dia/aula (titular e apoio)
    quem = defaultdict(lambda: {"titular": [], "apoio": []})
    for p, g in profs.items():
        for di, d in enumerate(DIAS):
            for ai, c in enumerate(g[d]):
                if c in ("", "---"):
                    if c == "---": saida["disponibilidade"].append({"professor": chave_prof(p), "turno": turno, "dia": di, "aula": ai + 1, "tipo": "BLQ"})
                    continue
                if c in ("HA", "COR"):
                    saida["disponibilidade"].append({"professor": chave_prof(p), "turno": turno, "dia": di, "aula": ai + 1, "tipo": c})
                    continue
                if c.startswith("R"):
                    tr = c[1] + "º" + c[2]
                    fix = CORRIGIR_APOIO.get((turno, chave_prof(p), d, ai + 1, tr))
                    if fix:
                        saida["avisos_corrigidos"].append(f"{p} {d} {ai+1}a: {c} -> R{fix.replace('º', '')} (a recomposicao de {tr} nesse dia e em outra aula; a de {fix} e nesta)")
                        tr = fix
                    quem[(tr, di, ai)]["apoio"].append(chave_prof(p))
                else: quem[(turma_nome(c), di, ai)]["titular"].append(chave_prof(p))
    slots_turno = None
    for nt, x in turmas.items():
        curso, serie, nivel = curso_da_turma(nt)
        n_aulas = max(i + 1 for d in DIAS for i, s in enumerate(x["grade"][d]) if s)
        saida["turmas"][nt] = {"turno": turno, "serie": serie, "nivel": nivel, "curso": curso}
        saida["horas"][f"{turno}|{nivel}"] = x["slots"][:n_aulas] if turno == "matutino" else x["slots"]
        for di, d in enumerate(DIAS):
            for ai, sig in enumerate(x["grade"][d]):
                q = quem.pop((nt, di, ai), {"titular": [], "apoio": []})
                if not sig:
                    if q["titular"] or q["apoio"]: saida["avisos"].append(f"{nt} {d} {ai+1}a sem disciplina, mas com professor {q}")
                    continue
                disc = disciplina(sig, nivel)
                if not disc: saida["avisos"].append(f"{nt} {d} {ai+1}a: sigla sem disciplina: {sig}")
                if len(q["titular"]) != 1: saida["avisos"].append(f"{nt} {d} {ai+1}a {sig}: {len(q['titular'])} professores titulares {q['titular']}")
                for p in q["titular"]: saida["aulas"].append({"turma": nt, "dia": di, "aula": ai + 1, "sigla": sig, "disciplina": disc, "professor": p, "apoio": False})
                for p in q["apoio"]: saida["aulas"].append({"turma": nt, "dia": di, "aula": ai + 1, "sigla": sig, "disciplina": disc, "professor": p, "apoio": True})
    for k, v in quem.items():
        if v["titular"] or v["apoio"]: saida["avisos"].append(f"professor sem aula correspondente na turma: {k} {v}")

for k, vs in sorted(nomes.items()):
    com_acento = sorted(vs, key=lambda n: (n == sem_acento(n), -len(n)))[0]
    saida["professores"][k] = bonito(com_acento) if k != "ANAVIEIRA" else "Ana Vieira"

json.dump(saida, open(SAIDA, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(f"{len(saida['turmas'])} turmas, {len(saida['professores'])} professores, {len(saida['aulas'])} aulas "
      f"({sum(a['apoio'] for a in saida['aulas'])} de apoio), disponibilidade {dict(Counter(d['tipo'] for d in saida['disponibilidade']))}")
print("horas:", saida["horas"])
print("professores:", ", ".join(saida["professores"].values()))
print(f"CORRIGIDO ({len(saida['avisos_corrigidos'])}):"); [print("  -", a) for a in saida["avisos_corrigidos"]]
print(f"AVISOS ({len(saida['avisos'])}):"); [print("  -", a) for a in saida["avisos"]]
print("Gravado:", SAIDA)
