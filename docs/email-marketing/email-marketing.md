# E-mail marketing — NexGrade para escolas estaduais do Paraná

Mala direta para direção, coordenação e secretaria. **Rascunho para revisão da Simone — nada foi enviado.**
Versão HTML pronta para colar na ferramenta de envio: [email-marketing.html](email-marketing.html).

Fontes: `docs/treinamento/treinamento-comercial.html` (dores, argumentos, o que não prometer),
`docs/relatorio-executivo/relatorio-executivo.html` (números), `docs/apresentacao/slides-novos.html`
e `docs/manual-escola/manual-uso-escola.html` (avaliação de 30 dias, endereço do sistema).

## Versão escolhida (04/11/2026): opção 2

**Assunto:** A grade da sua escola pelas regras da SEED, pronta para o RCO (mesma frase do título; trocado a pedido da Simone em 04/11)

Corpo pronto para colar: [email-opcao-2.html](email-opcao-2.html). Só usa estilos dentro das próprias tags (sem CSS externo) e o título no topo é "A grade da sua escola pelas regras da SEED, pronta para o RCO" (escolha da Simone).

- **Gmail ou Outlook:** abra `email-opcao-2.html` no Chrome ou no Edge, aperte Ctrl+A, depois Ctrl+C, e cole com Ctrl+V no corpo de um e-mail novo. A logo, o botão e os links vão juntos.
- **Ferramenta de envio (Brevo, Mailchimp...):** cole o código do arquivo no editor de HTML. Se a ferramenta tiver link de descadastro próprio, acrescente a etiqueta dela no rodapé.
- **Mala direta pelo Gmail:** coloque as escolas em **Cco**, nunca em "Para", para uma escola não ver o endereço das outras.

## Opções de assunto

1. **Grade 2026 pelas regras da SEED, pronta para o RCO**
2. **Hora-atividade, assíncronas e trios: a grade da sua escola sem retrabalho**
3. **Menos janelas na grade dos professores**

Texto de pré-visualização (aparece ao lado do assunto na caixa de entrada):
> Grade pelas regras SEED-PR, HA pela tabela oficial e arquivo para o RCO. 30 dias de avaliação.

## Texto do e-mail

Olá, equipe gestora!

Montar a grade, conferir a hora-atividade e depois lançar tudo no RCO costuma tomar semanas da direção e da coordenação.

O **NexGrade** foi feito para as escolas estaduais do Paraná:

- **Regras SEED-PR 2026:** aulas assíncronas, trio e co-docência, com o catálogo oficial (78 cursos com matrizes) e o calendário letivo da SEED.
- **Hora-atividade pela tabela oficial** (Res. 7.200/2025), colocada nos buracos entre as aulas.
- **Menos janelas:** o motor monta a grade buscando o menor número de janelas para os professores, sem mudar a carga horária de ninguém.
- **Do RCO para o RCO:** o cadastro vem do arquivo do próprio RCO, e a grade sai em arquivo por turno, que a secretaria inclui no RCO — sem redigitar aula por aula.
- **O ano inteiro:** agenda no celular do professor, presença, licenças com substituto, reservas de salas e relatórios em PDF e Excel.

Nenhuma grade vira oficial sem a coordenação aprovar, e sempre dá para voltar à anterior. Do professor, o sistema guarda só nome, e-mail e telefone.

**Experimente por 30 dias.** A implantação é feita com a nossa equipe, a partir do arquivo do RCO. Emitimos nota fiscal e contrato, com pagamento pela APMF ou pelo Fundo Rotativo.

Posso mostrar o NexGrade em 20 minutos para a sua equipe pedagógica?

**[Agendar demonstração pelo WhatsApp]** → https://wa.me/5541998180353

Simone Barros
NexGrade · Nexus Core Tecnologia
WhatsApp (41) 99818-0353 · simone@nexuscoretecnologia.com.br
nexgrade.nexuscoretecnologia.com.br

---
*Você recebeu este e-mail no endereço institucional da escola. Remetente: Nexus Core Tecnologia — CNPJ 48.542.365/0001-74 — nexuscoretecnologia.com.br. Não quer mais receber? [Descadastre-se] ou responda com "SAIR".*

## Antes de enviar (conferir com a Simone)

1. **Descadastro:** no HTML, troque `{{LINK_DESCADASTRO}}` pela etiqueta da ferramenta (Brevo: `{{ unsubscribe }}`; Mailchimp: `*|UNSUB|*`). Se a ferramenta não tiver, deixe o `mailto:` com "SAIR" que já está lá e retire os pedidos de descadastro da lista em até poucos dias.
2. **Remetente:** rodapé com CNPJ 48.542.365/0001-74 e o site (identificação do remetente). Não tem endereço físico; se quiser, dá para acrescentar.
3. **Logo:** o HTML usa a logo já publicada em `https://nexgrade.nexuscoretecnologia.com.br/icon-192.png` (conferida no ar em 04/11/2026). Se preferir, suba `logo.png` desta pasta na ferramenta e troque o endereço da imagem.
4. **Sem valores:** a pedido da Simone (04/11/2026), o e-mail não traz preços; eles ficam para a demonstração.
5. **Lista:** só endereços institucionais das escolas (direção, coordenação, secretaria), sem e-mail pessoal de servidor.
6. **Teste:** mande primeiro para você mesma (Gmail e Outlook, computador e celular) e confira a logo, o botão e o link de descadastro.

O que ficou **de fora de propósito**, para não prometer demais: integração automática com o RCO (é um arquivo que a secretaria inclui), gravação de trio no RCO pela própria escola (hoje é com o suporte), nomes de escolas e depoimentos, comparação com concorrente pelo nome e a implantação grátis "até [data]".
