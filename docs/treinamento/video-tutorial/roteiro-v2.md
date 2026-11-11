# Vídeo tutorial do NexGrade — roteiro v2 para aprovação (11/11/2026)

Pedido da dona: incluir cadastro de professores, cadastro de turmas, disponibilidade do professor, bloqueios e HA, trocar professor da turma, atribuir professor para turma, conferir conflitos e ajustar, gerar experimento da grade, melhorar e promover.

Mesma base da v1: Escola Demonstração numa cópia local, voz Francisca, Nexy na abertura, nas dicas e no fechamento. Duração estimada: **7 a 9 minutos**.
Os nomes novos (professor e turma) são fictícios, só da cópia local.

| # | Cena | O que aparece na tela | Novo? |
|---|------|------------------------|-------|
| 0 | Abertura | Nexy se apresenta e diz o que o vídeo cobre | — |
| 1 | Visão Geral | Números da escola e avisos | — |
| 2 | **Cadastrar professor** | Professores → Novo Professor → nome, e-mail, disciplinas que pode dar → Salvar; o professor aparece na lista | sim |
| 3 | **Cadastrar turma** | Turmas → Nova Turma → nível, curso e série (a matriz traz as disciplinas e a carga) → nome, turno, código do SERE → Salvar | sim |
| 4 | **Atribuir professor** | Na turma nova, cada disciplina recebe o professor (a lista mostra só os habilitados); o filtro "Sem professor" mostra o que falta | sim |
| 5 | Trocar professor | Abrir uma turma, trocar o professor de uma disciplina; as aulas vão junto; aviso quando há choque; dica da grade colorida (lápis na aula) | já tinha, fica igual |
| 6 | **Disponibilidade, bloqueios e HA** | Escolher o professor; quadro "Aulas e HA por turno (tabela SEED)"; cores; clicar num horário passa por Disponível → Bloqueado → HA obrigatória → HA fixa; marcar um bloqueio e uma HA; botões Bloquear/Liberar do dia; Salvar | ampliada |
| 7 | **Conferir conflitos e ajustar** | Gerar Grade → aba Conflitos: o que cada tipo quer dizer, como resolver (trocar aula de lugar na grade) ou aceitar quando está certo | sim |
| 8 | Modo Rascunho | Começar rascunho da manhã, faixa roxa, Ver mudanças | — |
| 9 | Gerar experimento | Modo Experimental → Turno inteiro → Gerar grade → andamento (acelerado) → Simular promoção | — |
| 10 | Melhorar e promover | Melhorar → Simular de novo → Promover (cópia de segurança; a grade passa a valer na escola) | — |
| 11 | Imprimir e Assistente | PDFs por turma e professor; Assistente de IA | — |
| 12 | Fechamento | Nexy | — |

Observação: a cena 9 mostra o caso real da cópia local. Se a grade gerada do zero sair pior que a de hoje, a narração explica que, nesse caso, o caminho é o Melhorar, como na v1.

## Versão gravada (11/11/2026, noite)

- Arquivos: a legenda `nexgrade-tutorial.srt` fica aqui. O vídeo (MP4) **não** entra no repositório: está no site (`nexus-core-site`, `video/nexgrade-tutorial.mp4`, página do NexGrade). As versões em tamanho cheio (com legenda na imagem e com legenda que liga e desliga) ficaram no PC da dona, em `docs/treinamento/video-tutorial/`, fora do Git.
- Duração: **4 min 32 s**. Voz neural Francisca (pt-BR). Nexy na abertura, nas dicas e no fechamento.
- Dados fictícios criados só na cópia local: professora **Ana Teste** (Língua Portuguesa) e turma **6º Ano Teste** (Vespertino).
- Resultados: gerar do zero → "Não recomendo promover"; Melhorar → "Vale promover"; promovido com cópia de segurança.

### Narração final

**0. Abertura (Nexy)**
- Olá! Eu sou a Nexy, da Nexus Core, e vou mostrar como o NexGrade organiza o horário da sua escola.
- Vamos ver o cadastro de professores e turmas, a disponibilidade e a hora-atividade, os conflitos e, no fim, como gerar, melhorar e promover a grade.

**1. Visão Geral**
- Na Visão Geral você vê, de uma vez, quantos professores, turmas e aulas a escola tem, e os avisos que pedem atenção.

**2. Cadastrar professor**
- Vamos começar pelo cadastro. Em Professores, clique em Novo Professor.
- Preencha o nome e o e-mail. É com esse e-mail que o professor entra no sistema.
- Em Disciplinas, marque o que ele pode dar. Só essas disciplinas vão aparecer para ele nas turmas.
- Clique em Salvar. Pronto: o professor já aparece na lista.

**3. Cadastrar turma e atribuir professores**
- Agora, uma turma nova. Em Turmas, clique em Nova Turma.
- Escolha o curso e a série. A matriz curricular já traz as disciplinas e a carga de cada uma.
- Dê o nome da turma, confira o turno e clique em Salvar Turma.
- Logo depois, o sistema pede para distribuir os professores. Em cada disciplina, escolha o professor na lista.
- A lista mostra só os professores habilitados. Veja: a professora que acabamos de cadastrar já aparece.
- O contador mostra quantas disciplinas ainda estão sem professor. Na lista de turmas, o filtro Sem professor mostra o que falta.

**4. Trocar professor da turma**
- Para trocar o professor de uma turma, abra a turma pelo lápis e escolha o novo professor na disciplina. A troca grava na hora.
- O sistema leva as aulas da grade para o novo professor. Se ele já tiver aula no mesmo horário, o sistema avisa, e as aulas ficam como estavam.
- Dica: você também pode trocar pelo lápis na aula, na grade colorida, e ver na hora onde as aulas caem.

**5. Disponibilidade, bloqueios e HA**
- Agora, a Disponibilidade. Escolha o professor para ver a semana dele.
- O quadro de cima usa a tabela da SEED: mostra quantas horas-atividade o professor precisa em cada turno e se tudo cabe.
- Na grade, verde é livre, vermelho é bloqueado e amarelo é hora-atividade. Cada clique muda o estado do horário.
- Para marcar um bloqueio, vá ao turno e clique no horário. Ele fica vermelho, e o motor não põe aula ali.
- Com dois cliques, o horário vira hora-atividade. Os botões em cima de cada dia bloqueiam ou liberam o dia inteiro.
- Depois, clique em Salvar.

**6. Conferir conflitos e ajustar**
- Antes de gerar, confira os conflitos. Em Gerar Grade, abra a aba Conflitos. Os cartões mostram quantos há em cada prioridade.
- A turma nova aparece com carga insuficiente, porque ainda não tem aulas na grade. Isso se resolve quando a grade dela for gerada.
- Escolha um tipo para filtrar. Em Ver sugestões, o sistema explica como resolver.
- Em Ver conflito, a grade abre no professor, com o horário em destaque, para você ajustar trocando a aula de lugar.
- Se o caso estiver certo, por exemplo um combinado da escola, clique em Aceitar como está, e ele sai da lista.

**7. Modo Rascunho**
- Quer testar mudanças sem mexer na escola? Use o Modo Rascunho.
- Escolha o que entra no rascunho, por exemplo, só a manhã, dê um nome e clique em Começar.
- A faixa roxa mostra que você está no rascunho. O que mudar na Grade, na Disponibilidade e em Turmas fica só nele.
- Em Ver mudanças, você confere tudo o que já mudou em relação à grade da escola.

**8. Gerar experimento e simular**
- Para gerar a grade, abra a aba Modo Experimental e escolha Turno inteiro.
- O nome do rascunho já vem preenchido. Confira o turno e clique em Gerar grade. O motor monta a manhã do zero.
- O andamento aparece passo a passo. A manhã inteira leva alguns minutos; aqui, aceleramos a espera.
- Pronto! A grade nova fica no cartão do rascunho. Antes de aplicar, clique em Simular promoção.
- A simulação compara as janelas e a hora-atividade com a grade de hoje. Neste exemplo, a grade feita do zero ficou com mais janelas, e o sistema não recomenda promover.

**9. Melhorar e promover**
- Nesse caso, descarte o rascunho. A escola continua como está.
- Agora use o Melhorar. Ele parte da grade de hoje, só troca aulas de lugar e nunca deixa a grade pior. Leva até dois minutos.
- Simule de novo. Agora vale promover: a grade fica com menos janelas. Se houvesse choque de professor, ele apareceria em vermelho, para resolver antes.
- Clique em Promover e confirme. O sistema guarda uma cópia de segurança, e a grade nova passa a valer na escola.

**10. Imprimir e Assistente**
- Em Imprimir Grade, você baixa os PDFs por turma e por professor.
- E, se tiver dúvida, pergunte ao Assistente de IA, aqui no menu.

**11. Fechamento (Nexy)**
- Pronto! Agora é com você. Bom trabalho, e até a próxima!
