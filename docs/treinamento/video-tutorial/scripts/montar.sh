#!/bin/bash
# Monta, para cada vídeo: versão local com legenda separada, local com legenda na imagem, versão comprimida do site
# e a capa — com a narração tratada (-16 LUFS; [AUDIO-2711]) e o selo da abertura encurtado para "Com a Nexy".
set -e
S="${S:?defina S com a pasta de trabalho (narracoes, selo.sh e imagens limpo-*.png)}"  # [AUDIO-2711]
D=/c/projetos/nexgrade-app/docs/treinamento/video-tutorial
cd "$S"; source selo.sh; mkdir -p saida
ST="FontName=Segoe UI,FontSize=15,PrimaryColour=&H00FFFFFF,BorderStyle=4,Outline=1,Shadow=0,BackColour=&H50000000,MarginV=20"
# base:pasta da narração:legenda:limpo:dy:fim da abertura:fim da entrada do selo:tempo da capa
SO=${1:-}
for par in "nexgrade-tutorial:${VOZ_PASTA:-francisca}:leg.srt:limpo-tutorial.png:0:15.4333:2.0:5" \
           "nexgrade-app-professor:${VOZ_PASTA:-francisca}-professor:leg-professor.srt:limpo-professor.png:0:9.8333:1.6:4" \
           "nexgrade-app-pedagogia:${VOZ_PASTA:-francisca}-pedagogia:leg-pedagogia.srt:limpo-pedagogia.png:0:11.5333:1.6:4" \
           "nexgrade-app-gestor-reservas:${VOZ_PASTA:-francisca}-gestor-reservas:leg-gestor-reservas.srt:limpo-gestor-reservas.png:50:13.2333:1.9:4"; do
  IFS=: read base pasta leg limpo dy fim anim capa <<< "$par"
  [ -n "$SO" ] && [ "$base" != "$SO" ] && continue
  # V_DIR: pasta de um vídeo-base novo (ex.: passo a passo v4, gravacao/montar_passo_a_passo.py)
  V=${V_DIR:-$D/versao-francisca}/$base.mp4; A=$pasta/narracao.wav; cp $pasta/legenda.srt $leg
  T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $A)
  SEL=$(filtro_selo_anim $dy $fim $anim)
  IN="-i $V -loop 1 -t 30 -i $limpo -i $A"
  AUD="-c:a aac -metadata:s:a:0 language=por"
  echo "== $base ($T s)"
  ffmpeg -y -v error $IN -i $leg -filter_complex "$SEL;[sel2]tpad=stop_mode=clone:stop_duration=3[v]" -map "[v]" -map 2:a -map 3 -t $T -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p $AUD -b:a 160k -c:s mov_text -metadata:s:s:0 language=por -movflags +faststart saida/$base.mp4
  ffmpeg -y -v error $IN -filter_complex "$SEL;[sel2]tpad=stop_mode=clone:stop_duration=3,subtitles=$leg:force_style='$ST'[v]" -map "[v]" -map 2:a -t $T -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p $AUD -b:a 160k -movflags +faststart saida/$base-legenda-na-imagem.mp4
  ffmpeg -y -v error $IN -filter_complex "$SEL;[sel2]tpad=stop_mode=clone:stop_duration=3,subtitles=$leg:force_style='$ST'[v]" -map "[v]" -map 2:a -t $T -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p $AUD -b:a 128k -movflags +faststart saida/$base-site.mp4
  ffmpeg -y -v error -ss $capa -i saida/$base.mp4 -frames:v 1 -c:v libwebp -quality 82 saida/$base-capa.webp
  cp $leg saida/$base.srt
done
for f in saida/*; do echo "$f $(stat -c %s $f)"; done
