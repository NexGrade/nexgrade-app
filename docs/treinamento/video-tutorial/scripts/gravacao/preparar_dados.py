# Deixa o banco do vídeo no ponto em que a cena 3 começa: a professora "Ana Teste" (Língua Portuguesa)
# já cadastrada, como no fim da cena 2 (reaproveitada do vídeo anterior).
# Fala só com a API LOCAL (login simulado); o banco é recriado antes por ambiente-local/subir.sh recriar.
import json, sys, urllib.request

API = 'http://localhost:3000/api'

def chamar(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(API + caminho, data=dados, method=metodo, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode() or 'null')

def main():
    profs = chamar('GET', '/professores')
    if any(p['nome'] == 'Ana Teste' for p in profs):
        print('Ana Teste já existe'); return
    lp = [d for d in chamar('GET', '/disciplinas') if d['nome'] == 'Língua Portuguesa']
    if len(lp) != 1: sys.exit(f'esperava 1 "Língua Portuguesa", achei {len(lp)}')
    p = chamar('POST', '/professores', {'nome': 'Ana Teste', 'email': 'ana.teste@demonstracao.invalid', 'disciplinaIds': [lp[0]['id']]})
    print('criada', p['id'], p['nome'])

if __name__ == '__main__':
    main()
