> **Esta é a v1 (5 min 22 s, depois 3 min 31 s).** O vídeo atual segue o [roteiro-v2.md](roteiro-v2.md).

# Vídeo tutorial do NexGrade — roteiro e narração (11/11/2026)

Escola usada: **Escola Demonstração NexGrade** (professores de nome fictício), numa **cópia local** do banco (nada mudou no ar).
Regra de texto: a narração e a legenda não usam "oficial", "integrado" nem "gravado no RCO"; a grade "passa a valer na escola". As telas mostram os botões com o nome que têm no sistema (por exemplo, "Promover para oficial").

Arquivos nesta pasta:
- `nexgrade-tutorial.mp4`: legenda que liga e desliga no player (VLC, Windows, navegadores).
- `nexgrade-tutorial-legenda-na-imagem.mp4`: legenda gravada na imagem (para WhatsApp, Instagram e players sem legenda).
- `nexgrade-tutorial.srt`: a legenda separada (YouTube, Drive).

## Mudança em relação ao roteiro aprovado

As cenas 8 e 9 mudaram depois de um teste na cópia local. Gerar a manhã do zero deixou a grade com **mais janelas** que a de hoje (1 → 4; com o Melhorar no rascunho, 1 → 2), e o sistema mostrou "Não recomendo promover". Promover essa grade no vídeo ensinaria o caminho errado. Por isso o vídeo mostra:
1. gerar no rascunho e simular, com o aviso de que não compensa;
2. descartar o rascunho, usar o **Melhorar**, simular de novo ("Vale promover") e promover.

É o mesmo caminho que a passagem de 09/11 recomenda.

## Mascote: Nexy

A Nexy (cartaz enviado pela dona em 11/11) aparece na abertura (cartaz inteiro), no fechamento (busto) e num círculo no canto inferior direito nas duas dicas (6c e 9b). Arquivos em `docs/treinamento/mascote/`: `nexy-cartaz.png`, `nexy-busto.png`, `nexy-rosto.png`. Só existe uma pose, com fundo; para poses com fundo transparente, gerar na mesma ferramenta do cartaz. Os desenhos da Lia (proposta anterior) ficaram na pasta e não entram no vídeo.

## Narração (texto da voz e da legenda)

**0. Abertura (cartaz da Nexy)**
- Olá! Eu sou a Nexy, da Nexus Core, e vou mostrar como o NexGrade organiza o horário da sua escola.
- Vamos ver como conferir o cadastro, fazer mudanças com segurança e gerar a grade.

**1. Visão Geral**
- Na Visão Geral você vê, de uma vez, quantos professores, turmas e aulas a escola tem, e os avisos que pedem atenção.

**2. Turmas**
- O cadastro fica no menu da esquerda. Comece por Turmas.
- As turmas aparecem separadas por turno. Aqui filtramos só as da manhã.
- No lápis, você abre a turma. A matriz curricular traz as disciplinas e a carga de cada uma.
- Mais abaixo, cada disciplina tem o seu professor. A lista mostra só os professores habilitados para ela.

**3. Professores**
- Em Professores está a equipe da escola, com as disciplinas que cada um pode dar.
- Ao abrir um professor, você confere os dados, as disciplinas e as turmas dele.

**4. Cursos e Disciplinas**
- Em Cursos e Disciplinas ficam os cursos ofertados e as matrizes. É da matriz que vem a carga de cada turma.

**5. Disponibilidade e bloqueio**
- Agora, a Disponibilidade. Escolha o professor para ver a semana dele.
- Verde é horário livre, amarelo é hora-atividade e vermelho é bloqueado. O quadro de cima confere se as aulas e a hora-atividade cabem no turno.
- Para marcar um bloqueio, vá ao turno e clique no horário. Ele fica vermelho, e o motor não põe aula ali.
- Depois, clique em Salvar.

**6. Trocar professor**
- Para trocar o professor de uma disciplina, abra a turma e escolha o novo professor na lista. A troca grava na hora.
- O sistema leva as aulas da grade para o novo professor. Se ele já tiver aula no mesmo horário, o sistema avisa, e as aulas ficam como estavam.
- Dica: você também pode trocar pelo lápis na aula, na grade colorida, e ver na hora onde as aulas caem.

**7. Modo Rascunho**
- Quer testar mudanças sem mexer na escola? Use o Modo Rascunho.
- Escolha o que entra no rascunho, por exemplo, só a manhã, dê um nome e clique em Começar.
- A faixa roxa mostra que você está no rascunho. O que mudar na Grade, na Disponibilidade e em Turmas fica só nele.
- Em Ver mudanças, você confere tudo o que já mudou em relação à grade da escola.

**8. Gerar a grade e simular**
- Para gerar a grade, abra a aba Modo Experimental e escolha Turno inteiro.
- O nome do rascunho já vem preenchido. Confira o turno e clique em Gerar grade. O motor monta a manhã do zero.
- O andamento aparece passo a passo. A manhã inteira leva alguns minutos; aqui, aceleramos a espera.
- Pronto! A grade nova fica no cartão do rascunho. Antes de aplicar, clique em Simular promoção.
- A simulação compara as janelas e a hora-atividade com a grade de hoje. Neste exemplo, a grade feita do zero ficou com mais janelas, e o sistema não recomenda promover.

**9. Melhorar e Promover**
- Nesse caso, descarte o rascunho. A escola continua como está.
- Agora use o Melhorar. Ele parte da grade de hoje, só troca aulas de lugar e nunca deixa a grade pior. Leva até dois minutos.
- Simule de novo. Agora vale promover: a grade fica com menos janelas. Se houvesse choque de professor, ele apareceria em vermelho, para resolver antes.
- Clique em Promover e confirme. O sistema guarda uma cópia de segurança, e a grade nova passa a valer na escola.

**10. Imprimir e Assistente**
- Em Imprimir Grade, você baixa os PDFs por turma e por professor.
- E, se tiver dúvida, pergunte ao Assistente de IA, aqui no menu.

**11. Fechamento (Nexy)**
- Pronto! Agora é com você. Bom trabalho, e até a próxima!

## Como foi feito (para refazer)

- Banco: cópia da Demonstração no Postgres local (`copiar-escola-para-banco-local.ts`, que lê o real em READ ONLY), banco `nexgrade_video` recriado de `nexgrade_video_modelo` antes de cada gravação.
- Sistema: API e site rodando no PC, com um usuário simulado da coordenação (sem login do Clerk) e o motor CP-SAT local na porta 8001.
- Telas: gravação contínua pelo Playwright (Chromium), com o cursor desenhado na página e um círculo amarelo em cada clique. As esperas da geração, do Melhorar e do Promover foram aceleradas para 3 segundos cada.
- Voz: **Microsoft Francisca** (voz neural pt-BR, pelo serviço online da Microsoft via `edge-tts`, velocidade +8%), uma frase por vez; a legenda usa os mesmos tempos. A primeira versão usava a Maria do Windows (lenta, robótica). Os trechos de tela entre as falas foram acelerados até 1,6x para acompanhar a voz.
- Montagem: ffmpeg (H.264 + AAC, 1280×720, 30 qps).
- Na cena 6, a troca é Educação Física da 1MA EM: Patrícia Fernandes → **Sandra Lopes** (2 aulas, sem choque). Uma primeira tentativa com Diego Ferreira deu choque e deixou a manhã impossível de gerar (5 aulas para 3 horários livres), por isso foi trocada.
- A geração da cena 8 usou **600 s** de tempo total: com 300 s, uma das tentativas parou no tempo limite na etapa do Médio/Técnico. Na gravação final ela levou cerca de 9 minutos (acelerados para 3 s).
- Resultados na cópia local: gerar do zero → "Não recomendo promover" (mais janelas); Melhorar → "Vale promover" (2 → 1 janela); promovido com cópia de segurança.
- Duração final: **3 min 31 s** (era 5 min 22 s com a voz Maria).
- Os scripts ficaram fora do repositório (pasta temporária da sessão).
