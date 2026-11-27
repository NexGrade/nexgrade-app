#!/bin/bash
# Corta o passo a passo (versão com legenda na imagem) em vídeos curtos, um por parte do sistema,
# com o número e o nome da parte no alto nos primeiros segundos. Saída: versão do site + capa.
# uso: bash cortar-partes.sh <pasta_saida>
set -e
D=/c/projetos/nexgrade-app/docs/treinamento/video-tutorial
SRC=${SRC:-$D/passo-a-passo-v4/nexgrade-tutorial-legenda-na-imagem.mp4}
OUT=${1:-$D/partes}; mkdir -p "$OUT"; cd "$OUT"
FONTE="C\\:/Windows/Fonts/segoeuib.ttf"
# A parte 1 (login e tela principal) é montada à parte por parte-01-entrar.py.
# arquivo|início|fim|título — tempos do passo a passo v4 (27/11/2026, Francisca): 0,2 s antes da 1ª fala de cada cena
# (montagem.json do v4, t_fala), ajustado para o esmaecimento cair no silêncio da narração. A parte 1 ganhou a voz da Francisca com revozear-parte-01.py.
while IFS='|' read -r nome ini fim titulo; do
  [ -z "$nome" ] && continue
  dur=$(awk "BEGIN{print $fim-$ini}")
  printf '%s' "$titulo" > "$OUT/.titulo.txt"
  # título: entra em 0,3 s, fica até 3,5 s e sai em 0,4 s
  alpha="if(lt(t,0.3),t/0.3,if(lt(t,3.5),1,if(lt(t,3.9),(3.9-t)/0.4,0)))"
  vf="drawtext=fontfile='$FONTE':textfile=.titulo.txt:fontsize=26:fontcolor=white:box=1:boxcolor=0x1d4ed8@0.95:boxborderw=14:x=(w-tw)/2:y=14:alpha='$alpha',fade=t=in:st=0:d=0.25,fade=t=out:st=$(awk "BEGIN{print $dur-0.35}"):d=0.35"
  af="afade=t=in:st=0:d=0.15,afade=t=out:st=$(awk "BEGIN{print $dur-0.35}"):d=0.35"
  echo "== $nome ($dur s) $titulo"
  ffmpeg -nostdin -y -v error -ss $ini -i "$SRC" -t $dur -vf "$vf" -af "$af" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -c:a aac -b:a 96k -metadata:s:a:0 language=por -movflags +faststart "$OUT/$nome.mp4"
  ffmpeg -nostdin -y -v error -ss 3.0 -i "$OUT/$nome.mp4" -frames:v 1 -c:v libwebp -quality 80 "$OUT/$nome-capa.webp"
done <<'EOF'
nexgrade-parte-02-cadastrar-professor|23.40|45.70|2 · Cadastrar professor
nexgrade-parte-03-cadastrar-turma|45.70|99.40|3 · Cadastrar turma e atribuir professores
nexgrade-parte-04-trocar-professor|99.40|133.63|4 · Trocar o professor da turma
nexgrade-parte-05-disponibilidade|133.63|175.43|5 · Disponibilidade, bloqueios e HA
nexgrade-parte-06-conflitos|175.43|219.70|6 · Conferir os conflitos
nexgrade-parte-07-modo-rascunho|219.70|256.57|7 · Modo Rascunho
nexgrade-parte-08-gerar-melhorar|256.57|283.68|8 · Gerar e melhorar a grade
nexgrade-parte-09-simular-promover|283.68|313.57|9 · Simular e promover
nexgrade-parte-10-imprimir-assistente|313.57|325.25|10 · Imprimir e Assistente de IA
EOF
rm -f "$OUT/.titulo.txt"
ls -la "$OUT"
