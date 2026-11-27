# Monta o vídeo-base (sem áudio) do passo a passo v4 e a legenda com os tempos de cada fala.
# Junta: cenas 0–2 do vídeo anterior + gravação nova das cenas 3–10 + fechamento (cena 11) do vídeo anterior.
# - mede cada fala com a voz (edge-tts, sem acelerar) e, se não couber até a próxima marca, congela a tela
#   no fim do trecho pelo tempo que falta (a fala nunca precisa correr);
# - acelera as esperas marcadas com acel+/acel- (Melhorar, Promover) para ACEL segundos;
# - põe o selo redondo da Nexy no canto nas falas de NEXY.
# Depois: narrar.py <pasta>/leg.srt <pasta>/francisca pt-BR-FranciscaNeural <fim>  e  montar.sh (V_DIR=<pasta>)
# uso: python montar_passo_a_passo.py <pasta_gravacao> <pasta_saida>
import json, os, re, subprocess, sys, hashlib, time
from falas import FALAS, NEXY

G, W = sys.argv[1], sys.argv[2]
os.makedirs(W, exist_ok=True)
D = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))  # video-tutorial/
VELHO = os.path.join(D, 'versao-francisca', 'nexgrade-tutorial.mp4')
VELHO_SRT = os.path.join(D, 'versao-francisca', 'nexgrade-tutorial.srt')
NEXY_PNG = os.path.abspath(os.path.join(D, '..', 'mascote', 'nexy-rosto.png'))
VOZ = 'pt-BR-FranciscaNeural'
CORTE_A = 45.15     # vídeo anterior: fim da cena 2 (Professores, antes de recarregar a página)
CORTE_B = 246.23    # vídeo anterior: início do fechamento (fundo azul da Nexy)
ULTIMA_VELHA_A = 13  # legendas 1–13 são das cenas 0–2
LEAD, FOLGA, ACEL = 0.14, 0.45, 2.5
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-an']


def run(*a):
    subprocess.run(a, check=True)

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def t2s(t):
    h, m, r = t.split(':'); s, ms = r.split(',')
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

def s2t(x):
    ms = round(x * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def ler_srt(p):
    out = []
    for b in open(p, encoding='utf-8').read().replace('\r\n', '\n').strip().split('\n\n'):
        l = b.split('\n'); a, z = l[1].split(' --> ')
        out.append((t2s(a), t2s(z), l[2:]))
    return out

def medir_fala(texto):
    """duração da fala (mesmo corte de silêncio do narrar.py), com cache"""
    cache = os.path.join(W, 'medidas'); os.makedirs(cache, exist_ok=True)
    k = hashlib.md5((VOZ + texto).encode()).hexdigest()[:12]
    wav = os.path.join(cache, k + '.wav')
    if not os.path.exists(wav):
        mp3 = wav + '.mp3'
        for tent in range(6):
            r = subprocess.run(['edge-tts', '--voice', VOZ, '--rate=+0%', '--text', texto, '--write-media', mp3], capture_output=True)
            if r.returncode == 0: break
            time.sleep(3 * (tent + 1))
        else:
            raise RuntimeError(r.stderr.decode(errors='replace')[-500:])
        flt = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
        run('ffmpeg', '-y', '-v', 'error', '-i', mp3, '-af', flt, '-ar', '48000', '-ac', '1', wav)
    return dur(wav)

def linhas(texto, larg=46):
    out, l = [], ''
    for p in texto.split():
        if l and len(l) + 1 + len(p) > larg: out.append(l); l = p
        else: l = (l + ' ' + p).strip()
    return out + [l]


# ---- 1. gravação em 30 quadros/s e o fim da tela preta do começo (marca "inicio")
grav = os.path.join(W, 'gravacao.mp4')
if not os.path.exists(grav):
    run('ffmpeg', '-y', '-v', 'error', '-i', os.path.join(G, 'video.webm'), '-vf', 'fps=30', *ENC, grav)
log = subprocess.run(['ffmpeg', '-i', grav, '-t', '60', '-vf', 'blackdetect=d=0.1:pix_th=0.05', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
# o aquecimento troca de página várias vezes e cada troca pisca a tela (fração de segundo):
# o fim da tela preta é o primeiro black_end depois do qual a imagem fica mais de 1 s sem preto
pretos = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', log)]
OFF = next(b for (a, b), prox in zip(pretos, pretos[1:] + [(1e9, 0)]) if prox[0] - b > 1.0)
marcas = json.load(open(os.path.join(G, 'marcas.json'), encoding='utf-8'))
print('fim da tela preta', OFF)

# ---- 2. trechos entre marcas (os de espera, acelerados)
ids = {f[0] for f in FALAS}
pts = [(m['nome'], OFF + m['t']) for m in marcas]
trechos, acel = [], False   # cada trecho: [ini, fim, velocidade, congela, fala_que_comeca]
for (n0, a), (n1, b) in zip(pts, pts[1:]):
    if n0 == 'acel+': acel = True
    if n0 == 'acel-': acel = False
    v = max(1.0, (b - a) / ACEL) if acel else 1.0
    trechos.append([a, b, v, 0.0, n0 if n0 in ids else None])
assert [t[4] for t in trechos if t[4]] == [f[0] for f in FALAS], 'marcas e falas fora de ordem'

# ---- 3. cada fala cabe até a próxima? se não, congela o fim do trecho
texto = dict(FALAS)
inicios = [i for i, t in enumerate(trechos) if t[4]]
relat = []
for k, i in enumerate(inicios):
    j = inicios[k + 1] if k + 1 < len(inicios) else len(trechos)
    vaga = sum((t[1] - t[0]) / t[2] for t in trechos[i:j])
    d = medir_fala(texto[trechos[i][4]])
    falta = LEAD + d + FOLGA - vaga
    if falta > 0: trechos[j - 1][3] += falta
    relat.append({'fala': trechos[i][4], 'fala_s': round(d, 2), 'vaga_s': round(vaga, 2), 'congela_s': round(max(0, falta), 2)})
    print(relat[-1])

# ---- 4. pedaços: cenas 0–2 velhas, trechos novos, fechamento velho
ped = os.path.join(W, 'pedacos'); os.makedirs(ped, exist_ok=True)
lista = []
def pedaco(nome, src, a, b, v=1.0, cong=0.0):
    f = os.path.join(ped, nome + '.mp4')
    vf = f'setpts=(PTS-STARTPTS)/{v:.4f},fps=30'
    if cong > 0: vf += f',tpad=stop_mode=clone:stop_duration={cong:.3f}'
    run('ffmpeg', '-y', '-v', 'error', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src, '-vf', vf, *ENC, f)
    lista.append(f)
    return dur(f)

t_saida = pedaco('a-cenas0a2', VELHO, 0, CORTE_A)
t_fala = {}
for n, (a, b, v, cong, fala) in enumerate(trechos):
    if fala: t_fala[fala] = t_saida
    t_saida += pedaco(f'n{n:03}', grav, a, b, v, cong)
INI_B = t_saida
t_saida += pedaco('z-fechamento', VELHO, CORTE_B, dur(VELHO))
with open(os.path.join(ped, 'lista.txt'), 'w', encoding='utf-8') as fl:
    fl.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in lista)
juntos = os.path.join(W, 'juntos.mp4')
run('ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(ped, 'lista.txt'), '-c', 'copy', juntos)

# ---- 5. legenda: velhas das cenas 0–2 e 11, novas a partir das marcas
velhas = ler_srt(VELHO_SRT)
cues = [c for c in velhas[:ULTIMA_VELHA_A]]
for fala_id, tx in FALAS:
    ini = t_fala[fala_id]; d = medir_fala(tx) + LEAD
    ls = linhas(tx); grupos = [ls[i:i + 2] for i in range(0, len(ls), 2)]
    tot = sum(len(' '.join(g)) for g in grupos); t = ini
    for g in grupos:
        dd = d * len(' '.join(g)) / tot
        cues.append((t, t + dd, g)); t += dd
desloc = INI_B - CORTE_B
fech = [c for c in velhas if c[0] >= CORTE_B]
cues += [(a + desloc, z + desloc, l) for a, z, l in fech]
with open(os.path.join(W, 'leg.srt'), 'w', encoding='utf-8') as s:
    for n, (a, z, l) in enumerate(cues, 1):
        s.write(f"{n}\n{s2t(a)} --> {s2t(z)}\n" + '\n'.join(l) + "\n\n")

# ---- 6. selo da Nexy nas dicas: x, y, tamanho (na 8b, à esquerda, para não cobrir o botão "Gerar do zero")
POS_NEXY = {'8b': (8, 552, 150)}
base = os.path.join(W, 'nexgrade-tutorial.mp4')
ent, flt, ult = ['-i', juntos], [], '0:v'
for k, fid in enumerate([f for f, _ in FALAS if f in NEXY]):
    a = t_fala[fid]; b = a + LEAD + medir_fala(texto[fid]) + 0.4; L = b - a
    ent += ['-loop', '1', '-t', f'{L:.3f}', '-i', NEXY_PNG]
    x, y, tam = POS_NEXY.get(fid, (1080, 516, 180))
    flt.append(f"[{k+1}:v]scale={tam}:{tam},format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st={L-0.35:.3f}:d=0.35:alpha=1,"
               f"setpts=PTS-STARTPTS+{a:.3f}/TB[n{k}];[{ult}][n{k}]overlay=x={x}:y={y}:eof_action=pass[v{k}]")
    ult = f'v{k}'
if flt:
    run('ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(flt), '-map', f'[{ult}]', *ENC, base)
else:
    os.replace(juntos, base)
fim = dur(base)
json.dump({'fim_video': fim, 'inicio_fechamento': INI_B, 'falas': relat, 't_fala': t_fala},
          open(os.path.join(W, 'montagem.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('vídeo-base', base, round(fim, 2), 's')
