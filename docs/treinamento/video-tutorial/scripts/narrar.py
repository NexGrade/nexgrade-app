# Renarra o vídeo com outra voz, encaixando cada frase no tempo da cena.
# uso: python narrar.py <srt> <pasta_saida> <voz>
import sys, os, re, subprocess, wave, array, json

srt, out, voz = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
SR = 48000  # [AUDIO-2711] 48 kHz, padrao de video
LEAD = 0.14  # o início da legenda inclui ~0,14 s de silêncio antes da fala

def t2s(t):
    h, m, r = t.split(':'); s, ms = r.split(',')
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000
def s2t(x):
    ms = round(x*1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

txt = open(srt, encoding='utf-8').read().replace('\r\n', '\n').strip()
cues = []
for b in txt.split('\n\n'):
    l = b.split('\n'); a, z = l[1].split(' --> ')
    cues.append({'ini': t2s(a), 'fim': t2s(z), 'linhas': l[2:]})

grupos = []
for c in cues:
    if grupos and c['ini'] - grupos[-1][-1]['fim'] < 0.2: grupos[-1].append(c)
    else: grupos.append([c])

def juntar(linhas):
    t = ''
    for l in linhas:
        t = t + l if (t.endswith('-') or not t) else t + ' ' + l
    return t

# Só para a voz: palavras que a Thalita (voz multilíngue) lê em inglês. A legenda fica como está.
PRONUNCIA = {
    'na Grade, na Disponibilidade': 'na gráde, na Disponibilidade',  # "Grade" saía como a palavra inglesa (12/11)
}
def para_voz(t):
    if 'Multilingual' not in voz:  # [AUDIO-2711] a Francisca (so pt-BR) le certo; a correcao era so da Thalita
        return t
    for a, b in PRONUNCIA.items(): t = t.replace(a, b)
    return t

def dur(f):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]))

def gerar(texto, rate, f):
    mp3 = f + '.mp3'
    import time
    for tent in range(6):
        r = subprocess.run(['edge-tts','--voice',voz,f'--rate=+{rate}%','--text',para_voz(texto),'--write-media',mp3], capture_output=True)
        if r.returncode == 0: break
        time.sleep(3*(tent+1))
    else:
        raise RuntimeError(r.stderr.decode(errors='replace')[-500:])
    # corta silêncio do começo e do fim; wav mono 44,1 kHz
    flt = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
    subprocess.run(['ffmpeg','-y','-v','error','-i',mp3,'-af',flt+',aresample=48000:resampler=soxr','-ar',str(SR),'-ac','1',f], check=True)
    return dur(f)

RATE_MAX = int(os.environ.get('RATE_MAX', '10'))
VIDEO_FIM = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
falas, novas, relat = [], [], []
for i, g in enumerate(grupos):
    texto = ' '.join(juntar(c['linhas']) for c in g)
    ini = g[0]['ini'] + LEAD
    prox = grupos[i+1][0]['ini'] + LEAD if i+1 < len(grupos) else VIDEO_FIM + 30
    vaga = prox - ini - 0.25  # deixa um respiro antes da próxima frase
    f = os.path.join(out, f'g{i:03}.wav')
    rate = 0; d = gerar(texto, rate, f)
    # [AUDIO-2711] pedido da dona: fala natural. Acelera no maximo 10% (antes ate 25%, soava robotico);
    # o que nao couber aparece no relatorio ('cabe': false) para esticar a cena no video.
    while d > vaga and rate < RATE_MAX:
        rate = min(RATE_MAX, rate + max(2, int((d/vaga - 1)*100) + 2))
        d = gerar(texto, rate, f)
    relat.append({'g': i, 'ini': round(ini,2), 'dur': round(d,2), 'vaga': round(vaga,2), 'rate': rate, 'cabe': d <= vaga, 'texto': texto[:60]})
    falas.append((ini, f))
    # legendas do grupo: tempo proporcional ao tamanho do texto
    tot = sum(len(' '.join(c['linhas'])) for c in g); t = ini - LEAD
    total_t = d + LEAD
    for c in g:
        dd = total_t * len(' '.join(c['linhas'])) / tot
        novas.append((t, t + dd - 0.05, c['linhas'])); t += dd

fim = max(i + dur(f) for i, f in falas) + 0.6
buf = array.array('h', bytes(2*int(fim*SR)))
for ini, f in falas:
    w = wave.open(f); a = array.array('h', w.readframes(w.getnframes())); w.close()
    o = int(ini*SR)
    for k, v in enumerate(a): buf[o+k] = v
w = wave.open(os.path.join(out, 'narracao-crua.wav'), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(buf.tobytes()); w.close()
# [AUDIO-2711] tratamento: corta grave inutil, mais corpo e clareza, suaviza o 's', compressao leve e volume padrao (-16 LUFS)
TRAT = ('highpass=f=70,equalizer=f=180:t=q:w=1:g=2,equalizer=f=3500:t=q:w=1.2:g=1.5,deesser=i=0.4,'
        'acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9')
subprocess.run(['ffmpeg','-y','-v','error','-i',os.path.join(out,'narracao-crua.wav'),'-af',TRAT,'-ar',str(SR),'-ac','1',os.path.join(out,'narracao.wav')], check=True)

with open(os.path.join(out, 'legenda.srt'), 'w', encoding='utf-8') as s:
    for n, (a, z, l) in enumerate(novas, 1):
        s.write(f"{n}\n{s2t(a)} --> {s2t(z)}\n" + '\n'.join(l) + "\n\n")
json.dump({'fim_audio': fim, 'grupos': relat}, open(os.path.join(out, 'relatorio.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('fim do áudio', round(fim,2))
for r in relat:
    if r['rate'] or not r['cabe']: print(r)
