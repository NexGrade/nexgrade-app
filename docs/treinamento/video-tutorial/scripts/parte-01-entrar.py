# Monta a parte 1 dos vídeos curtos: "Entrar e conhecer a tela principal".
# Cenas: (A) login gravado do sistema no ar, só o quadro de entrar (sem o painel da direita);
#        (B) Visão Geral do passo a passo; (C) a mesma tela parada, com destaque em cada grupo do menu.
# uso: python parte-01-entrar.py <login.webm> <passo-a-passo-sem-legenda.mp4> <pasta_saida>
import sys, os, subprocess, wave, array, textwrap

LOGIN, TUTORIAL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
VOZ, SR = 'pt-BR-ThalitaMultilingualNeural', 44100
FONTE_T = "C\\:/Windows/Fonts/segoeuib.ttf"

LOGIN_INI, LOGIN_FIM = 2.4, 18.3      # trecho útil da gravação do login
VG_INI, VG_FIM = 15.45, 23.3          # Visão Geral no passo a passo
A_DUR = LOGIN_FIM - LOGIN_INI
B_DUR = VG_FIM - VG_INI

# (início em s no vídeo final, texto, destaque do menu ou None)
falas = [
    (0.6, 'Para entrar, abra o NexGrade e digite o e-mail que a escola cadastrou.', None),
    (6.6, 'Depois, clique em Continuar e digite a sua senha.', None),
    (10.4, 'No primeiro acesso, clique em Cadastre-se e use esse mesmo e-mail.', None),
    (A_DUR + 0.3, 'Depois de entrar, você chega à Visão Geral, a tela principal: os números da escola e os avisos que pedem atenção.', None),
    (None, 'O menu ao lado segue a ordem do trabalho.', None),
    (None, 'Primeiro, o cadastro da escola.', (10, 208, 236, 218)),
    (None, 'Depois, a grade de horário.', (10, 456, 236, 150)),
    (None, 'E, por fim, o arquivo para o RCO.', (10, 634, 236, 86)),
]

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def tts(texto, f):
    mp3 = f + '.mp3'
    subprocess.run(['edge-tts', '--voice', VOZ, '--rate=+5%', '--text', texto, '--write-media', mp3], check=True, capture_output=True)
    flt = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,volume=4dB'
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', mp3, '-af', flt, '-ar', str(SR), '-ac', '1', f], check=True)
    return dur(f)

t = 0; colocadas = []
for i, (ini, texto, caixa) in enumerate(falas):
    f = os.path.join(OUT, f'f{i}.wav'); d = tts(texto, f)
    if ini is None: ini = t + 0.45
    if colocadas and ini < colocadas[-1][1] + 0.3: ini = colocadas[-1][1] + 0.3
    colocadas.append((ini, ini + d, texto, caixa, f)); t = ini + d
TOTAL = t + 1.0
C_DUR = TOTAL - A_DUR - B_DUR
print('total', round(TOTAL, 2), 'cena C', round(C_DUR, 2))
for c in colocadas: print(round(c[0], 2), round(c[1], 2), c[2])

# áudio
buf = array.array('h', bytes(2 * int(TOTAL * SR)))
for ini, fim, _, _, f in colocadas:
    w = wave.open(f); a = array.array('h', w.readframes(w.getnframes())); w.close()
    o = int(ini * SR)
    for k, v in enumerate(a): buf[o + k] = v
w = wave.open(os.path.join(OUT, 'narracao.wav'), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(buf.tobytes()); w.close()

# legenda (quebra em linhas de até 46 caracteres, no máximo 2 por bloco)
def s2t(x):
    ms = round(x * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
blocos = []
for ini, fim, texto, _, _ in colocadas:
    linhas = textwrap.wrap(texto, 46); grupos = [linhas[k:k + 2] for k in range(0, len(linhas), 2)]
    tot = sum(len(' '.join(g)) for g in grupos); tt = ini
    for g in grupos:
        dd = (fim - ini) * len(' '.join(g)) / tot
        blocos.append((tt, tt + dd - 0.05, g)); tt += dd
with open(os.path.join(OUT, 'legenda.srt'), 'w', encoding='utf-8') as s:
    for n, (a, z, g) in enumerate(blocos, 1): s.write(f"{n}\n{s2t(a)} --> {s2t(z)}\n" + '\n'.join(g) + "\n\n")
open(os.path.join(OUT, 'titulo.txt'), 'w', encoding='utf-8').write('1 · Entrar e conhecer a tela principal')

# vídeo: A (quadro de entrar centralizado num fundo da cor da página) + B + C (parado, com destaques)
caixas = [(c[3], c[0] - (A_DUR + B_DUR), c[1] - (A_DUR + B_DUR) + 0.25) for c in colocadas if c[3]]
dbox = ','.join(f"drawbox=x={x}:y={y}:w={w}:h={h}:c=0xFACC15:t=4:enable='between(t,{max(a,0):.2f},{z:.2f})'" for (x, y, w, h), a, z in caixas)
alpha = "if(lt(t,0.3),t/0.3,if(lt(t,3.5),1,if(lt(t,3.9),(3.9-t)/0.4,0)))"
ST = "FontName=Segoe UI,FontSize=15,PrimaryColour=&H00FFFFFF,BorderStyle=4,Outline=1,Shadow=0,BackColour=&H50000000,MarginV=20"
fc = (
    f"[0:v]trim={LOGIN_INI}:{LOGIN_FIM},setpts=PTS-STARTPTS,fps=30,crop=460:720:128:0[card];"
    f"color=c=0xF8FAFC:s=1280x720:r=30:d={A_DUR}[fundo];[fundo][card]overlay=x=410:y=0:shortest=1,format=yuv420p,setsar=1[A];"
    f"[1:v]trim={VG_INI}:{VG_FIM},setpts=PTS-STARTPTS,fps=30,format=yuv420p,setsar=1[B0];[B0]split[B][Bl];"
    f"[Bl]trim=start={B_DUR - 0.04},setpts=PTS-STARTPTS,loop=loop=-1:size=1,trim=duration={C_DUR},setpts=PTS-STARTPTS,{dbox}[C];"
    f"[A][B][C]concat=n=3:v=1:a=0,"
    f"drawtext=fontfile='{FONTE_T}':textfile=titulo.txt:fontsize=26:fontcolor=white:box=1:boxcolor=0x1d4ed8@0.95:boxborderw=14:x=(w-tw)/2:y=14:alpha='{alpha}',"
    f"subtitles=legenda.srt:force_style='{ST}',fade=t=in:st=0:d=0.25,fade=t=out:st={TOTAL - 0.35:.2f}:d=0.35[v]"
)
cmd = ['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', os.path.abspath(LOGIN), '-i', os.path.abspath(TUTORIAL), '-i', 'narracao.wav',
       '-filter_complex', fc, '-map', '[v]', '-map', '2:a', '-t', f'{TOTAL:.2f}',
       '-af', f'afade=t=out:st={TOTAL - 0.35:.2f}:d=0.35',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k',
       '-metadata:s:a:0', 'language=por', '-movflags', '+faststart', 'nexgrade-parte-01-entrar.mp4']
subprocess.run(cmd, check=True, cwd=OUT)
subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-ss', '3.0', '-i', 'nexgrade-parte-01-entrar.mp4', '-frames:v', '1',
                '-c:v', 'libwebp', '-quality', '80', 'nexgrade-parte-01-entrar-capa.webp'], check=True, cwd=OUT)
print('ok', os.path.join(OUT, 'nexgrade-parte-01-entrar.mp4'))
