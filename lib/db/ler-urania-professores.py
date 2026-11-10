# Le o "Relatorio de Professores" do Urania (tarde) pelas coordenadas e grava JSON no formato
# de lib/db/urania-mario-braga-2026-11-02.json: {nome: {slots:[...], grade:{Seg:[...]}}}
import pdfplumber, sys, json, re
DIAS=["Seg","Ter","Qua","Qui","Sex"]
RE_H=re.compile(r"^\d{1,2}:\d{2}$")
out={}; avisos=[]
# Uso: python ler-urania-professores.py <pdf> <saida.json> [turno=vespertino] [data-do-cabecalho=02/11] [fonte]
TURNO=sys.argv[3] if len(sys.argv)>3 else "vespertino"
CAB=sys.argv[4] if len(sys.argv)>4 else "02/11"
FONTE=sys.argv[5] if len(sys.argv)>5 else "Urania - Relatorio de Professores TARDE 02 a 06/11/2026 (CORRETO, recebido 03/11), lido pelas coordenadas do PDF"
pdf=pdfplumber.open(sys.argv[1])
for pn,p in enumerate(pdf.pages):
    ws=p.extract_words(x_tolerance=1.5)
    mid=p.width/2
    # pagina com um professor por linha (manha): nenhum cabecalho na metade direita -> pagina inteira
    duas=any(w['text']==CAB and w['x0']>=mid for w in ws)
    for metade in ((0,1) if duas else (0,)):
        W=[w for w in ws if (not duas) or (w['x0']<mid)==(metade==0)]
        W.sort(key=lambda w:(round(w['top']),w['x0']))
        # cabecalhos de professor
        heads=[w for w in W if w['text']==CAB]
        heads.sort(key=lambda w:w['top'])
        for hi,h in enumerate(heads):
            top=h['top']; bot=heads[hi+1]['top'] if hi+1<len(heads) else 1e9
            nome=" ".join(w['text'] for w in W if abs(w['top']-top)<2 and w['x1']<=h['x0']+0.5)
            B=[w for w in W if top+2<w['top']<bot-2]
            cab={w['text']:(w['x0']+w['x1'])/2 for w in B if w['text'] in DIAS+["Hor"] and abs(w['top']-min(x['top'] for x in B))<2}
            xs=[cab[d] for d in DIAS]
            lim=[(xs[i]+xs[i+1])/2 for i in range(4)]
            col=lambda x: sum(x>l for l in lim)
            horas=[w for w in B if RE_H.match(w['text']) and abs((w['x0']+w['x1'])/2-cab['Hor'])<15]
            horas.sort(key=lambda w:w['top'])
            slots=[w['text'] for w in horas]
            grade={d:["" for _ in slots] for d in DIAS}
            for i,hw in enumerate(horas):
                cel={d:[] for d in DIAS}
                for w in B:
                    if abs(w['top']-hw['top'])<2 and w['x0']>hw['x1']+1:
                        cel[DIAS[col((w['x0']+w['x1'])/2)]].append(w)
                for d in DIAS:
                    txt=" ".join(w['text'] for w in sorted(cel[d],key=lambda w:w['x0']))
                    if txt and set(txt.replace(" ",""))=={"-"}: txt="---"
                    grade[d][i]=txt
            if nome in out: avisos.append(f"nome repetido {nome}")
            out[nome]={"slots":slots,"grade":grade}
json.dump({"fonte":FONTE,TURNO:out},open(sys.argv[2],"w",encoding="utf8"),ensure_ascii=False,indent=1)
print(len(out),"professores", avisos)
from collections import Counter
print(Counter(tuple(v["slots"]) for v in out.values()))
