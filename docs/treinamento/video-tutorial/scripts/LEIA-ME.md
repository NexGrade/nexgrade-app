# Scripts dos vídeos tutoriais do NexGrade

Tudo roda no PC da dona (Git Bash). Os MP4 ficam fora do Git: cópia no Google Drive (pasta privada "NexGrade — Vídeos tutoriais").
Voz: Francisca (`pt-BR-FranciscaNeural`, edge-tts) desde 27/11/2026. Regra de texto do site: sem "oficial", "integrado" ou "gravado no RCO" na narração e na legenda.

## Passo a passo (cenas 3 a 10 regravadas; 0–2 e 11 vêm de `versao-francisca/nexgrade-tutorial.mp4`)

1. Ambiente local (cópia da Escola Demonstração, sem Clerk, banco Postgres **local**):
   - `git worktree add --detach <wt> origin/main`, `pnpm install --frozen-lockfile` na worktree e `bash ambiente-local/preparar-worktree.sh <wt>` (login simulado; nada disso vai para a main).
   - venv com o motor: `python -m venv <venv>` e `pip install -r <wt>/cpsat-service/requirements.txt`.
   - `WT=<wt> VENV=<venv> bash ambiente-local/subir.sh recriar`, depois `motor`, `api` e `site` (cada um em segundo plano).
2. Gravar: `bash gravacao/gravar.sh <saida> --fotos` (recria o banco, cadastra a "Ana Teste" e grava 1280×720 com cursor e marcas; ~7 min, o Melhorar demora).
   Conferir as fotos `foto-NN-<marca>.png`; se quebrar, `erro.png` mostra a tela.
3. Montar: `python gravacao/montar_passo_a_passo.py <saida> <mont>` (mede cada fala, congela a tela se não couber, acelera as esperas, Nexy nas dicas).
4. Narrar: `python narrar.py <mont>/leg.srt <mont>/francisca pt-BR-FranciscaNeural <fim do vídeo-base>`.
5. Versões finais: copiar `selo.sh` e `limpo-tutorial.png` para `<mont>` e rodar `S=<mont> V_DIR=<mont> bash montar.sh nexgrade-tutorial` (saída em `<mont>/saida`).
6. Partes curtas: `bash cortar-partes.sh <pasta>` (tempos da tabela = 0,2 s antes da 1ª fala de cada cena, no silêncio). A parte 1 tem script próprio (`parte-01-entrar.py`; a gravação do login se perdeu, por isso a voz dela foi trocada com `revozear-parte-01.py`).

Falas do passo a passo: `gravacao/falas.py`. Resultado de 27/11 (v4): `../passo-a-passo-v4/` (legenda, marcas, montagem; `base/` guarda o vídeo sem áudio e a `leg.srt` para renarrar sem regravar).

## Apps (professor, pedagogia, gestor de reservas)

Imagem em `versao-francisca/`; `narrar.py` sobre a legenda e `montar.sh` (sem `V_DIR`). `limpo-*.png` = quadro da abertura sem o selo, usado por `selo.sh`.

## Site

Repositório `nexus-core-site`, pasta `video/` (versões `-site.mp4`) e `video/partes/`; trocar o `?v=` nos endereços de `nexgrade.html` (Cloudflare leva até 5 min).
