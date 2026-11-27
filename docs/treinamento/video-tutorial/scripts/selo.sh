# Encurta o selo "Com a Nexy, da Nexus Core" para "Com a Nexy", só durante a abertura:
# cobre ", da Nexus Core" com o fundo limpo (quadro da abertura antes de o selo surgir, [1:v]),
# com bordas suaves, e fecha o selo com a ponta esquerda espelhada, recortada por uma máscara arredondada.
CORTE=${CORTE:-850}; PX=${PX:-712}; PW=${PW:-30}
filtro_selo() {
  local dy=$1 fim=$2 y0=$((442+$1)) h=64
  local en="enable='lt(t,$fim)'"
  local fx=$((CORTE)) fw=$((1040-CORTE)) fy=$((y0-4)) fh=$((h+40))
  local mcap="color=black:s=${PW}x${h},format=gray,geq=lum='255*clip((28-if(gte(X,$((PW-29))),hypot(X-$((PW-29)),Y-33),abs(Y-33)))/3,0,1)'"
  local mfun="color=black:s=${fw}x${fh},format=gray,geq=lum='255*clip(min(min(X+1,W-X),min(Y+1,H-Y))/8,0,1)'"
  echo "$mcap[m];$mfun[mf];[1:v]crop=$fw:$fh:$fx:$fy,format=yuva420p[f0];[f0][mf]alphamerge[fundo];[0:v]split[a][c];[c]crop=$PW:$h:$PX:$y0,hflip,format=yuva420p[c2];[c2][m]alphamerge[cap];[a][fundo]overlay=x=$fx:y=$fy:$en[f1];[f1][cap]overlay=x=$CORTE:y=$y0:$en[sel]"
}
# Versão com a entrada: enquanto o selo sobe (até $3 s), ele fica escondido pelo fundo limpo, que some em 0,4 s.
# [1:v] precisa ser a imagem em laço (-loop 1 -t ...).
filtro_selo_anim() {
  local dy=$1 fim=$2 anim=$3 y0=$((442+$1))
  local base; base=$(filtro_selo $dy $fim)
  local cx=704 cw=336 cy=$((y0-14)) ch=100
  local mfun="color=black:s=${cw}x${ch},format=gray,geq=lum='255*clip(min(min(X+1,W-X),min(Y+1,H-Y))/8,0,1)'"
  echo "${base/\[1:v\]crop/[i1]crop};[1:v]split[i1][i2];$mfun[mt];[i2]crop=$cw:$ch:$cx:$cy,format=yuva420p[t0];[t0][mt]alphamerge,fade=t=out:st=$(awk "BEGIN{print $anim-0.4}"):d=0.4:alpha=1[tampa];[sel][tampa]overlay=x=$cx:y=$cy:enable='lt(t,$anim)'[sel2]"
}
