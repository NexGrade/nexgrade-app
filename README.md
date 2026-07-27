# Pipeline de sincronização da grade oficial (PDF -> NexGrade)

Processo pra manter a grade oficial do sistema batendo com o PDF que a
escola manda toda semana (sistema Urânia). Validado com o noturno em
2026-07-24 (150/150 aulas, 100% de acerto).

## Pré-requisitos (só na primeira vez)

```powershell
pip install pdfplumber --break-system-packages
```

(o `ortools` você já instalou antes; `pdfplumber` é novo, só pra isso aqui)

## Passo a passo, toda semana

**1. Extrai o PDF novo pra JSON estruturado:**

```powershell
cd C:\Projetos\nexgrade-app
python scripts\extrair_grade_pdf.py "caminho\do\PROFESSORES_NOITE.pdf" noturno scripts\aulas_noturno.json --pular-hora 18:00
```

Pra matutino ou vespertino (sem a peculiaridade do horário informativo):

```powershell
python scripts\extrair_grade_pdf.py "caminho\do\PROFESSORES_MANHA.pdf" matutino scripts\aulas_matutino.json
python scripts\extrair_grade_pdf.py "caminho\do\PROFESSORES_TARDE.pdf" vespertino scripts\aulas_vespertino.json
```

Confira a saída no terminal: quantos professores e aulas foram extraídos, e a lista de turmas/siglas encontradas. Se o número de professores parecer muito baixo comparado ao PDF real, algo deu errado na extração — me avisa antes de seguir.

**2. Sincroniza com o banco:**

```powershell
$env:DATABASE_URL = "sua-connection-string"
npx tsx scripts\sincronizar-grade.ts noturno scripts\aulas_noturno.json
```

Ele mostra:
- Quantas aulas foram resolvidas (turma + disciplina + professor encontrados no banco)
- Se houver problemas de mapeamento (sigla nova, professor não encontrado), ele **aborta sem gravar nada** e lista os problemas — normal na primeira vez com matutino/vespertino, já que têm disciplinas diferentes do noturno
- Se tudo resolver, mostra o que vai mudar (inserir/atualizar/remover) e **pede confirmação** antes de gravar

**3. Se aparecerem problemas de mapeamento:**

Isso é esperado ao rodar matutino/vespertino pela primeira vez — são disciplinas diferentes do noturno, ainda sem entrada no dicionário `ABREV_PARA_NOME` dentro de `sincronizar-grade.ts`. Me manda a lista de "problemas" que aparece no terminal, que eu atualizo o dicionário (só isso, sem precisar reescrever o resto do script).

## Arquivos deste pipeline

- `scripts/extrair_grade_pdf.py` — extrai qualquer PDF de grade de professores (usa as linhas de grade reais do PDF, não a posição do texto — método confiável)
- `scripts/sincronizar-grade.ts` — compara o extraído com o banco e sincroniza a grade oficial, com confirmação antes de gravar

## Limitações conhecidas

- O dicionário de siglas (`ABREV_PARA_NOME`) só cobre o que já apareceu no noturno até agora. Turmas/disciplinas novas no matutino ou vespertino vão aparecer como "problema" até eu atualizar o dicionário.
- O matutino tem Fundamental (5 aulas/dia) e Médio/Técnico (6 aulas/dia) misturados no mesmo turno — isso ainda não foi tratado neste pipeline. Precisa ser resolvido antes de sincronizar o matutino de verdade (a numeração de aula por professor pode ficar errada se não diferenciar os dois esquemas).
