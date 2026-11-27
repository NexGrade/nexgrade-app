# Troca só a voz da parte 1 (Thalita -> Francisca) sem remontar a imagem: a gravação do login se perdeu,
# e a imagem da parte 1 (com a legenda gravada) continua certa. Cada fala da Francisca começa no mesmo
# instante da fala da Thalita (recalculado com o mesmo método do parte-01-entrar.py); se não couber até a
# próxima, acelera no máximo 10%.
# uso: python revozear-parte-01.py <parte-01-atual.mp4> <pasta_saida>
import sys, os, subprocess, wave, array

ATUAL, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SR = 48000
A_DUR = 18.3 - 2.4
TEXTOS = [
    (0.6, 'Para entrar, abra o NexGrade e digite o e-mail que a escola cadastrou.'),
    (6.6, 'Depois, clique em Continuar e digite a sua senha.'),
    (10.4, 'No primeiro acesso, clique em Cadastre-se e use esse mesmo e-mail.'),
    (A_DUR + 0.3, 'Depois de entrar, você chega à Visão Geral, a tela principal: os números da escola e os avisos que pedem atenção.'),
    (None, 'O menu ao lado segue a ordem do trabalho.'),
    (None, 'Primeiro, o cadastro da escola.'),
    (None, 'Depois, a grade de horário.'),
    (None, 'E, por fim, o arquivo para o RCO.'),
]

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def tts(voz, rate, texto, f):
    mp3 = f + '.mp3'
    subprocess.run(['edge-tts', '--voice', voz, f'--rate=+{rate}%', '--text', texto, '--write-media', mp3], check=True, capture_output=True)
    flt = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', mp3, '-af', flt, '-ar', str(SR), '-ac', '1', f], check=True)
    return dur(f)

# 1. instantes de cada fala na versão da Thalita (mesma conta do parte-01-entrar.py)
inis, t, fim_ant = [], 0, None
for i, (ini, tx) in enumerate(TEXTOS):
    d = tts('pt-BR-ThalitaMultilingualNeural', 5, tx, os.path.join(OUT, f't{i}.wav'))
    if ini is None: ini = t + 0.45
    if fim_ant is not None and ini < fim_ant + 0.3: ini = fim_ant + 0.3
    inis.append(ini); t = fim_ant = ini + d
TOTAL = dur(ATUAL)

# 2. Francisca nos mesmos instantes
falas = []
for i, (_, tx) in enumerate(TEXTOS):
    vaga = (inis[i + 1] if i + 1 < len(inis) else TOTAL - 0.4) - inis[i] - 0.15
    f = os.path.join(OUT, f'f{i}.wav'); rate = 0; d = tts('pt-BR-FranciscaNeural', rate, tx, f)
    while d > vaga and rate < 10:
        rate = min(10, rate + 3); d = tts('pt-BR-FranciscaNeural', rate, tx, f)
    print(f'{inis[i]:6.2f}  {d:5.2f}/{vaga:5.2f}  +{rate}%  {"ok" if d <= vaga else "NÃO CABE"}  {tx[:50]}')
    falas.append((inis[i], f))

buf = array.array('h', bytes(2 * int(TOTAL * SR)))
for ini, f in falas:
    w = wave.open(f); a = array.array('h', w.readframes(w.getnframes())); w.close()
    o = int(ini * SR)
    for k, v in enumerate(a[:len(buf) - o]): buf[o + k] = v
crua = os.path.join(OUT, 'narracao-crua.wav')
w = wave.open(crua, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(buf.tobytes()); w.close()
# mesmo tratamento do narrar.py ([AUDIO-2711])
TRAT = ('highpass=f=70,equalizer=f=180:t=q:w=1:g=2,equalizer=f=3500:t=q:w=1.2:g=1.5,deesser=i=0.4,'
        'acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9,'
        f'afade=t=out:st={TOTAL - 0.35:.2f}:d=0.35')
saida = os.path.join(OUT, 'nexgrade-parte-01-entrar.mp4')
subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', ATUAL, '-i', crua, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-af', TRAT, '-ar', str(SR), '-c:a', 'aac', '-b:a', '96k', '-metadata:s:a:0', 'language=por',
                '-movflags', '+faststart', saida], check=True)
print('ok', saida)
