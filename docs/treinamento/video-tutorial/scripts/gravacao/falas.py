# Narração do passo a passo (v4, 27/11/2026): a da v3 com a fala nova da cena 7 e os nomes dos botões
# que mudaram nas telas (#201–#206). Regra de texto do site: sem "oficial", "integrado" ou "gravado no RCO"
# na narração e na legenda (os botões aparecem na tela com o nome que têm no sistema).
# Cada fala começa numa marca da gravação com o mesmo id (gravar_passo_a_passo.py).
# Cenas 0–2 e 11 vêm do vídeo anterior (tempos fixos na montagem).

FALAS = [
    # 3. Cadastrar turma e atribuir professores
    ('3a', 'Agora, uma turma nova. Em Turmas, clique em Nova Turma.'),
    ('3b', 'Escolha o curso e a série. A matriz curricular já traz as disciplinas e a carga de cada uma.'),
    ('3c', 'Dê o nome da turma, confira o turno e clique em Salvar Turma.'),
    ('3d', 'Logo depois, o sistema pede para distribuir os professores. Em cada disciplina, escolha o professor na lista.'),
    ('3e', 'A lista mostra só os professores habilitados. Veja: a professora que acabamos de cadastrar já aparece.'),
    ('3f', 'O contador mostra quantas disciplinas ainda estão sem professor.'),
    ('3g', 'Na lista de turmas, o filtro Sem professor mostra o que falta.'),
    # 4. Trocar professor da turma
    ('4a', 'Para trocar o professor de uma turma, abra a turma pelo lápis e escolha o novo professor na disciplina. A troca grava na hora.'),
    ('4b', 'O sistema leva as aulas da grade para o novo professor. Confira o resultado na grade da turma.'),
    ('4c', 'Dica: no Modo Rascunho, você também pode trocar pelo lápis na aula, na grade colorida, e ver na hora onde as aulas caem.'),  # o lápis na aula só existe no rascunho
    # 5. Disponibilidade, bloqueios e HA
    ('5a', 'Agora, a Disponibilidade. Escolha o professor para ver a semana dele.'),
    ('5b', 'O quadro de cima usa a tabela da SEED: mostra quantas horas-atividade o professor precisa em cada turno e se tudo cabe.'),
    ('5c', 'Na grade, verde é livre, vermelho é bloqueado e amarelo é hora-atividade. Cada clique muda o estado do horário.'),
    ('5d', 'Para marcar um bloqueio, vá ao turno e clique no horário. Ele fica vermelho, e o motor não põe aula ali.'),
    ('5e', 'Com dois cliques, o horário vira hora-atividade. Os botões em cima de cada dia bloqueiam ou liberam o dia inteiro.'),
    ('5f', 'Depois, clique em Salvar.'),
    # 6. Conferir conflitos e ajustar
    ('6a', 'Antes de gerar, confira os conflitos. Em Gerar Grade, abra a aba Conflitos. Os cartões mostram quantos há em cada prioridade.'),
    ('6b', 'A turma nova aparece com carga insuficiente, porque ainda não tem aulas na grade. Isso se resolve quando a grade dela for gerada.'),
    ('6c', 'Escolha um tipo para filtrar. Em Ver sugestões, o sistema explica como resolver.'),
    ('6d', 'Em Ver conflito, a grade abre no professor, com o horário em destaque, para você ajustar trocando a aula de lugar.'),
    ('6e', 'Se o caso estiver certo, por exemplo um combinado da escola, clique em Aceitar como está, e ele sai da lista.'),
    # 7. Modo Rascunho
    ('7a', 'Quer testar mudanças sem mexer na escola? Use o Modo Rascunho.'),
    ('7b', 'Escolha o que entra no rascunho, por exemplo, só a manhã, dê um nome e clique em Começar.'),
    ('7c', 'A faixa e a moldura roxas mostram que você está no rascunho, e o menu marca as telas que ele muda.'),
    ('7d', 'O que mudar na Grade, na Disponibilidade e em Turmas fica só nele.'),
    ('7e', 'Em Ver mudanças, você confere tudo o que já mudou em relação à grade da escola.'),
    # 8. Melhorar a grade e simular
    ('8a', 'Para montar a grade, abra a aba Modo Experimental e escolha Turno inteiro.'),
    ('8b', 'Aqui há dois caminhos. Gerar do zero monta tudo de novo, e é para o começo do ano. Para ajustar uma grade que já está funcionando, use o Melhorar.'),
    ('8c', 'O Melhorar parte da grade de hoje, só troca aulas de lugar e nunca deixa a grade pior. Leva até dois minutos; aqui, aceleramos a espera.'),
    ('8d', 'Pronto! Antes de aplicar, clique em Simular promoção.'),
    ('8e', 'A simulação compara as janelas e a hora-atividade com a grade de hoje e mostra se há choque de professor. Com tudo certo, é só promover.'),
    # 9. Promover
    ('9a', 'Clique em Promover e confirme. O sistema guarda uma cópia de segurança, e a grade nova passa a valer na escola.'),
    ('9b', 'Se precisar, em Voltar à grade anterior, você recupera a cópia guardada.'),
    # 10. Imprimir e Assistente
    ('10a', 'Em Imprimir Grade, você baixa os PDFs por turma e por professor.'),
    ('10b', 'E, se tiver dúvida, pergunte ao Assistente de IA, aqui no menu.'),
]

# falas em que a Nexy aparece no canto (dicas), como na v3
NEXY = {'4c', '8b'}
