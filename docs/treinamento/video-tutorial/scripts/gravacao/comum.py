# Peças comuns da gravação automática das telas do NexGrade (Playwright, Chromium, 1280×720).
# - cursor desenhado na página (a gravação do Playwright não mostra o cursor do sistema)
#   e um círculo amarelo em cada clique;
# - movimentos suaves até o elemento antes de clicar; digitação com ritmo de pessoa;
# - marcas de tempo (marca()) que a montagem usa para encaixar a narração e acelerar as esperas.
# O vídeo começa com a tela preta; a marca "inicio" é o instante em que ela some
# (a montagem acha esse instante com o blackdetect do ffmpeg e alinha as marcas).
import json, math, time

LARGURA, ALTURA = 1280, 720

CURSOR_JS = r"""
(() => {
  if (window.__cursorVideo) return; window.__cursorVideo = true;
  const montar = () => {
    if (!document.body) return setTimeout(montar, 20);
    const c = document.createElement('div');
    c.id = '__cursor_video';
    c.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 24 L7.5 18.5 L11.5 27.5 L15 26 L11 17.2 L18.5 17.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'0px', top:'0px', width:'22px', height:'30px', zIndex:2147483647,
      pointerEvents:'none', transform:'translate(-2px,-2px)', filter:'drop-shadow(0 1px 1.5px rgba(0,0,0,.35))'});
    const p = (window.__posVideo || {x: 640, y: 360}); c.style.left = p.x + 'px'; c.style.top = p.y + 'px';
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; window.__posVideo = {x:e.clientX, y:e.clientY}; }, true);
    window.addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, {position:'fixed', left:(e.clientX-18)+'px', top:(e.clientY-18)+'px', width:'36px', height:'36px',
        borderRadius:'50%', background:'rgba(250,204,21,.45)', border:'2px solid rgba(234,179,8,.95)', zIndex:2147483646,
        pointerEvents:'none', transition:'transform .45s ease-out, opacity .45s ease-out', transform:'scale(.4)', opacity:'1'});
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.25)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    // tela preta do começo (a montagem usa para alinhar o tempo das marcas)
    if (!window.__semPreto) {
      const k = document.createElement('div'); k.id = '__preto_video';
      Object.assign(k.style, {position:'fixed', inset:'0', background:'#000', zIndex:2147483645});
      document.documentElement.appendChild(k);
    }
  };
  montar();
})();
"""


class Gravador:
    def __init__(self, page, marcas_arq):
        self.page = page
        self.marcas = []
        self.t0 = None
        self.arq = marcas_arq
        self.x, self.y = 640, 360

    # ---- tempo
    def comecar(self):
        """Tira a tela preta e zera o relógio das marcas."""
        self.page.evaluate("() => { const k = document.getElementById('__preto_video'); if (k) k.remove(); window.__semPreto = true; }")
        self.t0 = time.monotonic()
        self.marca('inicio')

    def marca(self, nome):
        t = 0.0 if self.t0 is None else time.monotonic() - self.t0
        self.marcas.append({'nome': nome, 't': round(t, 3)})
        print(f'  [{t:7.2f}] {nome}', flush=True)
        with open(self.arq, 'w', encoding='utf-8') as f:
            json.dump(self.marcas, f, ensure_ascii=False, indent=1)

    def pausa(self, s):
        self.page.wait_for_timeout(int(s * 1000))

    # ---- mouse
    def mover_para(self, x, y, dur=None):
        dist = math.hypot(x - self.x, y - self.y)
        if dur is None:
            dur = min(0.9, 0.25 + dist / 1400)
        passos = max(6, int(dur * 60))
        x0, y0 = self.x, self.y
        for i in range(1, passos + 1):
            k = i / passos
            k = k * k * (3 - 2 * k)  # suaviza começo e fim
            self.page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k)
            self.page.wait_for_timeout(int(dur * 1000 / passos))
        self.x, self.y = x, y

    def centro(self, loc, dx=0.5, dy=0.5):
        loc.wait_for(state='visible', timeout=20000)
        b = loc.bounding_box()
        # à vista de verdade? (dentro da tela e não coberto: o ponto do clique cai no próprio elemento)
        alcanca = f"e => {{ const r = e.getBoundingClientRect(); const x = r.left + r.width*{dx}, y = r.top + r.height*{dy};" \
                  " if (y < 0 || y > innerHeight - 4) return false; const h = document.elementFromPoint(x, y);" \
                  " return !!h && (h === e || e.contains(h) || h.contains(e)); }"
        if b is None or not loc.evaluate(alcanca):
            self.rolar_ate(loc)
            b = loc.bounding_box()
        return b['x'] + b['width'] * dx, b['y'] + b['height'] * dy

    def apontar(self, loc, dx=0.5, dy=0.5, dur=None):
        x, y = self.centro(loc, dx, dy)
        self.mover_para(x, y, dur)

    def clicar(self, loc, dx=0.5, dy=0.5, antes=0.25, depois=0.5):
        self.apontar(loc, dx, dy)
        self.pausa(antes)
        self.page.mouse.down(); self.page.wait_for_timeout(70); self.page.mouse.up()
        self.pausa(depois)

    def digitar(self, texto, atraso=65):
        self.page.keyboard.type(texto, delay=atraso)

    def rolar_ate(self, loc, bloco='center'):
        loc.evaluate(f"e => e.scrollIntoView({{behavior: 'smooth', block: '{bloco}'}})")
        self.pausa(0.9)

    def rolar(self, dy, passos=12):
        """Rola com a roda do mouse, em passos (fica suave no vídeo)."""
        for _ in range(passos):
            self.page.mouse.wheel(0, dy / passos)
            self.page.wait_for_timeout(25)
        self.pausa(0.4)
