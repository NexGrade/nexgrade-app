# Grava as cenas 3 a 10 do passo a passo do NexGrade, numa cópia LOCAL da Escola Demonstração.
# Antes: ambiente-local/subir.sh recriar (banco), motor/api/site no ar, e preparar_dados.py (Ana Teste).
# uso: python gravar_passo_a_passo.py <pasta_saida> [--ate=CENA] [--fotos]
#   saída: video.webm (contínuo, 1280×720) e marcas.json (início de cada fala e das esperas a acelerar)
#   --fotos: tira uma foto da tela em cada marca (para conferir sem ver o vídeo)
import os, re, sys, shutil, glob
from playwright.sync_api import sync_playwright, expect
from comum import Gravador, CURSOR_JS, LARGURA, ALTURA

SITE = 'http://localhost:5173'
SAIDA = sys.argv[1]
ATE = next((a.split('=')[1] for a in sys.argv if a.startswith('--ate=')), '10')
FOTOS = '--fotos' in sys.argv
DE = next((a.split('=')[1] for a in sys.argv if a.startswith('--de=')), None)  # só para ensaio
INICIO = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--pagina=')), '/professores')
os.makedirs(SAIDA, exist_ok=True)


def main():
    with sync_playwright() as p:
        nav = p.chromium.launch(args=['--force-device-scale-factor=1'])
        ctx = nav.new_context(viewport={'width': LARGURA, 'height': ALTURA}, locale='pt-BR',
                              record_video_dir=os.path.join(SAIDA, 'bruto'), record_video_size={'width': LARGURA, 'height': ALTURA})
        ctx.add_init_script(CURSOR_JS)
        page = ctx.new_page()
        page.set_default_timeout(30000)
        g = Gravador(page, os.path.join(SAIDA, 'marcas.json'))
        marca_orig = g.marca
        def marca(nome):
            marca_orig(nome)
            if FOTOS: page.screenshot(path=os.path.join(SAIDA, f'foto-{len(g.marcas):02}-{nome}.png'))
        g.marca = marca

        # aquece as telas (o Vite compila cada uma na primeira visita; no vídeo apareceria a tela carregando)
        for rota in ['/horario', '/disponibilidade', '/imprimir-grade', '/assistente', '/turmas', '/professores']:
            page.goto(SITE + rota); page.wait_for_load_state('networkidle')
        # a cena 2 (reaproveitada) termina na lista de Professores
        page.goto(SITE + INICIO)
        page.wait_for_load_state('networkidle')
        g.pausa(2.0)
        g.comecar()
        g.pausa(0.6)
        try:
            comecou = DE is None
            for n, cena in CENAS:
                comecou = comecou or n == DE
                if comecou: cena(g, page)
                if n == ATE: break
            g.pausa(1.5)
            g.marca('fim')
        except Exception:
            page.screenshot(path=os.path.join(SAIDA, 'erro.png'))
            raise
        finally:
            video = page.video
            ctx.close(); nav.close()
            shutil.move(video.path(), os.path.join(SAIDA, 'video.webm'))


# ---------- utilidades de tela
def menu(page, nome):
    return page.locator('nav, aside').get_by_role('link', name=re.compile(r'^\s*' + re.escape(nome))).first

def escolher(g, page, gatilho, opcao, exato=True):
    g.clicar(gatilho, depois=0.5)
    op = page.get_by_role('option', name=opcao, exact=exato)
    g.clicar(op, depois=0.5)

def esperar_toast_sumir(page):
    page.wait_for_timeout(300)


# ---------- 3. Cadastrar turma e atribuir professores
def cena3(g, page):
    g.marca('3a')
    g.clicar(menu(page, 'Turmas'), depois=0.6)
    g.clicar(page.get_by_role('button', name='Nova Turma'), depois=0.9)
    d = page.get_by_role('dialog')
    g.marca('3b')
    escolher(g, page, d.get_by_role('combobox').nth(0), 'Ensino Fundamental')
    escolher(g, page, d.get_by_role('combobox').nth(1), 'Ensino Fundamental - Anos Finais - Tempo Parcial Diurno')
    escolher(g, page, d.get_by_role('combobox').nth(2), '6º Ano (25h/semana)')
    g.apontar(d.get_by_text('Matemática (4h)').first); g.pausa(0.5)
    g.apontar(d.get_by_text('Língua Portuguesa (4h)').first); g.pausa(0.8)
    g.marca('3c')
    g.clicar(d.get_by_placeholder('Ex: 1º Ano A'), depois=0.2)
    g.digitar('6º Ano Teste')
    g.pausa(0.4)
    escolher(g, page, d.get_by_role('combobox').nth(3), 'Vespertino')
    g.clicar(d.get_by_role('button', name='Salvar Turma'), depois=1.6)
    g.marca('3d')
    d = page.get_by_role('dialog')
    d.get_by_text('Professores, co-docência e trio').wait_for()
    g.rolar_ate(d.get_by_text('Arte (2h)').last, 'start'); g.pausa(0.3)
    bloco_arte = d.locator('div', has=page.get_by_text('Arte (2h)', exact=True)).filter(has=page.get_by_role('combobox')).last
    escolher(g, page, bloco_arte.get_by_role('combobox').first, 'Adriana Ribeiro')
    g.marca('3e')
    g.rolar_ate(d.get_by_text('Língua Portuguesa (4h)').last, 'start'); g.pausa(0.3)
    bloco_lp = d.locator('div', has=page.get_by_text('Língua Portuguesa (4h)', exact=True)).filter(has=page.get_by_role('combobox')).last
    g.clicar(bloco_lp.get_by_role('combobox').first, depois=0.8)
    ana = page.get_by_role('option', name='Ana Teste', exact=True)
    g.apontar(ana); g.pausa(1.2)
    g.clicar(ana, depois=1.0)
    g.marca('3f')
    cont = d.get_by_text(re.compile(r'\d+ sem professor')).first
    g.rolar_ate(cont); g.apontar(cont); g.pausa(2.0)
    g.marca('3g')
    g.clicar(d.get_by_role('button', name='Close'), depois=0.9)
    g.clicar(page.get_by_role('button', name=re.compile(r'Sem professor')), depois=1.6)


# ---------- 4. Trocar professor da turma (Educação Física da 1MA EM: Patrícia Fernandes → Sandra Lopes, sem choque)
def cena4(g, page):
    g.marca('4a')
    # desliga o filtro "Sem professor" da cena 3 (o botão alterna)
    g.clicar(page.get_by_role('button', name=re.compile(r'Sem professor')), depois=1.0)
    # cartão da 1MA EM: o menor bloco que tem o nome e o botão Horário; o lápis vem logo depois do Horário
    card = page.locator('div').filter(has=page.get_by_text('1MA EM', exact=True)).filter(has=page.get_by_role('link', name='Horário')).last
    lapis = card.get_by_role('link', name='Horário').locator('xpath=following-sibling::button[1]')
    g.clicar(lapis, depois=1.2)
    d = page.get_by_role('dialog')
    d.get_by_text('Educação Física (2h)').last.wait_for()
    bloco = d.locator('div', has=page.get_by_text('Educação Física (2h)', exact=True)).filter(has=page.get_by_role('combobox')).last
    g.rolar_ate(bloco, 'center'); g.pausa(0.3)
    g.clicar(bloco.get_by_role('combobox').first, depois=0.8)
    sandra = page.get_by_role('option', name='Sandra Lopes', exact=True)
    g.apontar(sandra); g.pausa(0.6)
    g.clicar(sandra, depois=0.6)
    conf = page.get_by_role('alertdialog')
    if conf.count() and conf.is_visible():
        g.clicar(conf.get_by_role('button').last, depois=0.6)
    g.pausa(2.0)
    g.marca('4b')
    g.clicar(d.get_by_role('button', name='Close'), depois=0.8)
    g.clicar(card.get_by_role('link', name='Horário'), depois=2.0)
    page.get_by_text('Educação Física').first.wait_for()
    aula = page.get_by_text('Sandra L.').first
    g.rolar_ate(aula); g.apontar(aula); g.pausa(2.0)
    g.marca('4c')
    # (o lápis na aula só existe no rascunho: aqui a Nexy aparece no canto e o cursor passeia pela grade)
    g.apontar(page.get_by_text('Educação Física').nth(1)); g.pausa(1.5)
    g.apontar(aula); g.pausa(3.0)


# ---------- 5. Disponibilidade (Patrícia Fernandes)
def celula(page, aula, dia):
    """botão do horário: aula '3ª aula', dia 1=SEG ... 5=SEX"""
    return page.locator('tr', has=page.get_by_text(aula, exact=True)).locator('td').nth(dia).locator('button').first

def cena5(g, page):
    g.marca('5a')
    g.clicar(menu(page, 'Disponibilidade'), depois=1.0)
    g.clicar(page.get_by_role('button', name='Selecione um professor'), depois=0.5)
    g.digitar('Patr', atraso=120); g.pausa(0.5)
    g.clicar(page.get_by_text('Patrícia Fernandes', exact=True), depois=1.5)
    g.marca('5b')
    g.apontar(page.get_by_text(re.compile(r'tabela SEED')).first); g.pausa(1.2)
    g.apontar(page.get_by_text(re.compile(r'Vespertino: \d+ aula')).first, dx=0.2); g.pausa(1.2)
    g.apontar(page.get_by_text(re.compile(r'^Cabe na')).first); g.pausa(2.0)
    g.marca('5c')
    leg = page.get_by_text('Disponível', exact=True).first
    g.rolar_ate(page.get_by_text('Patrícia Fernandes', exact=True).last, 'start')
    g.apontar(leg); g.pausa(0.9)
    g.apontar(page.get_by_text('Bloqueado', exact=True).first); g.pausa(0.9)
    g.apontar(page.get_by_text('Hora-Atividade obrigatória', exact=True).first); g.pausa(1.5)
    g.marca('5d')
    g.clicar(page.get_by_role('tab', name='Vespertino', exact=True), depois=1.0)
    g.rolar_ate(page.get_by_text('Patrícia Fernandes', exact=True).last, 'start')
    g.clicar(celula(page, '3ª aula', 1), depois=1.8)
    g.marca('5e')
    c = celula(page, '4ª aula', 1)
    g.clicar(c, depois=0.35); g.clicar(c, antes=0.1, depois=1.5)
    seg = page.locator('thead th').nth(1)
    g.apontar(seg.get_by_text('Bloquear', exact=True)); g.pausa(1.0)
    g.apontar(seg.get_by_text('Liberar', exact=True)); g.pausa(1.5)
    g.marca('5f')
    g.clicar(page.get_by_role('button', name='Salvar', exact=True), depois=1.2)
    conf = page.get_by_role('alertdialog')
    if conf.count() and conf.is_visible():
        g.pausa(1.0); g.clicar(conf.get_by_role('button').last, depois=1.0)
    g.pausa(1.5)


# ---------- 6. Conflitos (a turma nova com carga insuficiente; pausa entre turnos do Diego Ferreira)
def aba(page, nome):
    return page.locator('main').get_by_text(nome, exact=True).first

def cena6(g, page):
    g.marca('6a')
    g.clicar(menu(page, 'Gerar Grade'), depois=1.2)
    g.clicar(aba(page, 'Conflitos'), depois=1.5)
    page.get_by_text('Total de conflitos').first.wait_for()
    g.apontar(page.get_by_text('Total de conflitos').first); g.pausa(1.0)
    g.apontar(page.get_by_text('Críticos', exact=True).first); g.pausa(0.8)
    g.apontar(page.get_by_text('Alta prioridade', exact=True).first); g.pausa(1.0)
    g.marca('6b')
    c = page.get_by_text(re.compile(r'Turma 6º Ano Teste: "Ensino Religioso"')).first
    g.rolar_ate(c); g.apontar(c, dx=0.3); g.pausa(3.5)
    g.marca('6c')
    g.clicar(page.get_by_role('button', name=re.compile(r'^Pausa Entre Turnos')), depois=1.2)
    # o 1º cartão do filtro é o do Diego Ferreira na segunda (1MB DES → 6TC)
    page.get_by_text(re.compile(r'Diego Ferreira na segunda')).first.wait_for()
    g.clicar(page.get_by_role('button', name=re.compile(r'Ver sugestões')).first, depois=2.5)
    g.marca('6d')
    g.clicar(page.get_by_role('button', name=re.compile(r'Ver conflito')).first, depois=2.5)
    # mostra o horário em destaque na grade do professor e volta ao aviso do conflito
    g.rolar(420); g.pausa(1.8)
    g.marca('6e')
    ac = page.get_by_role('button', name=re.compile(r'Aceito como está|Aceitar como está')).first
    g.apontar(ac); g.pausa(1.2)
    g.clicar(ac, depois=1.0)
    # desde o #206 o "Aceitar como está" pede confirmação numa janela
    conf = page.get_by_role('alertdialog')
    if conf.count() and conf.is_visible():
        g.pausa(1.2)
        g.clicar(conf.get_by_role('button', name='Aceitar como está'), depois=0.6)
    g.pausa(1.5)


# ---------- 7. Modo Rascunho (só a manhã, "Manhã 2027")
def cena7(g, page):
    g.marca('7a')
    g.rolar(-2000, passos=8)
    bt = page.get_by_role('button', name='Começar rascunho').first
    g.apontar(bt); g.pausa(1.5)
    g.clicar(bt, depois=1.0)
    d = page.get_by_role('dialog')
    g.marca('7b')
    g.apontar(d.get_by_role('combobox').first); g.pausa(1.5)  # "Só a Manhã" já vem escolhido
    g.clicar(d.get_by_role('textbox').first, depois=0.2)
    g.digitar('Manhã 2027')
    g.pausa(0.5)
    g.clicar(d.get_by_role('button', name='Começar', exact=True), depois=2.0)
    g.marca('7c')
    faixa = page.get_by_text(re.compile(r'^Modo rascunho$', re.I)).first
    g.apontar(faixa); g.pausa(1.2)
    g.apontar(page.get_by_text(re.compile(r'^Nada vale para a escola')).first); g.pausa(1.5)
    g.mover_para(262, 420); g.pausa(0.6)          # a moldura roxa (borda da área principal)
    g.mover_para(262, 620); g.pausa(0.6)
    selos = page.locator('nav, aside').get_by_text('Rascunho', exact=True)
    g.apontar(selos.nth(0)); g.pausa(0.8)
    g.marca('7d')
    g.apontar(selos.nth(1)); g.pausa(0.9)
    g.apontar(selos.nth(2)); g.pausa(1.2)
    g.marca('7e')
    g.clicar(page.get_by_role('button', name='Ver mudanças').first, depois=3.0)
    g.clicar(page.get_by_role('dialog').get_by_role('button', name='Close'), depois=0.8)


# ---------- 8. Melhorar a grade (no rascunho) e simular
def cena8(g, page):
    g.marca('8a')
    g.clicar(aba(page, 'Modo Experimental'), depois=1.5)
    g.clicar(page.get_by_role('button', name='Turno inteiro').first, depois=1.5)
    d = page.get_by_role('dialog')
    g.marca('8b')
    g.apontar(d.get_by_role('button', name='Gerar do zero')); g.pausa(2.5)
    mel = d.get_by_role('button', name=re.compile(r'Melhorar \(recomendado\)'))
    g.apontar(mel); g.pausa(2.0)
    g.clicar(mel, depois=1.0)
    conf = page.get_by_role('alertdialog')
    g.pausa(1.0)
    g.clicar(conf.get_by_role('button', name='Melhorar', exact=True), depois=1.0)
    g.marca('8c')
    # (27/11: ao confirmar, a janela "Gerar grade" também fecha — defeito avisado à dona; o cálculo segue por trás)
    if d.is_visible():
        g.apontar(d.get_by_text(re.compile(r'Andamento')).first); g.pausa(1.0)
    g.pausa(3.0)
    g.marca('acel+')
    page.get_by_role('button', name=re.compile(r'Simular promoção')).first.wait_for(timeout=20 * 60_000)
    g.pausa(1.0)
    g.marca('acel-')
    g.pausa(1.0)
    g.marca('8d')
    sim = page.get_by_role('button', name=re.compile(r'Simular promoção')).first
    g.rolar_ate(sim)
    g.clicar(sim, depois=1.0)
    page.get_by_text(re.compile(r'Grade oficial hoje|janela')).first.wait_for(timeout=120_000)
    g.pausa(1.5)
    g.marca('8e')
    res = page.get_by_text(re.compile(r'^(Vale promover|Não recomendo|Pode promover)')).first
    if res.count():
        g.rolar_ate(res, 'start'); g.apontar(res); g.pausa(2.0)
    g.rolar(260); g.pausa(4.0)


# ---------- 9. Promover
def cena9(g, page):
    g.marca('9a')
    prom = page.get_by_role('button', name=re.compile(r'Promover para oficial')).first
    g.rolar_ate(prom)
    g.clicar(prom, depois=1.2)
    conf = page.get_by_role('alertdialog')
    g.pausa(1.5)
    g.marca('acel+')
    g.clicar(conf.get_by_role('button').last, depois=0.5)
    page.get_by_text(re.compile(r'promovido|Voltar à grade anterior')).first.wait_for(timeout=10 * 60_000)
    g.marca('acel-')
    g.pausa(3.0)
    g.marca('9b')
    volta = page.get_by_text(re.compile(r'Voltar à grade anterior \(')).first
    g.rolar_ate(volta)
    g.clicar(volta, depois=3.0)


# ---------- 10. Imprimir e Assistente
def cena10(g, page):
    g.marca('10a')
    g.clicar(menu(page, 'Imprimir Grade'), depois=3.0)
    g.marca('10b')
    g.clicar(menu(page, 'Assistente de IA'), depois=3.5)


CENAS = [('3', cena3), ('4', cena4), ('5', cena5), ('6', cena6), ('7', cena7), ('8', cena8), ('9', cena9), ('10', cena10)]

if __name__ == '__main__':
    main()
