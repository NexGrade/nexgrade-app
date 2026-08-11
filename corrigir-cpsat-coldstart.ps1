# [FIX-COLDSTART] O servico nexgrade-cpsat roda no free tier do Render,
# que hiberna apos ~15min sem trafego "real" e pode levar 50s+ para
# voltar a aceitar conexoes (cold start de um container Docker com
# OR-Tools, bem mais pesado que subir um servico Node simples). Quando
# isso acontece no meio de uma geracao pesada (ex.: matutino do Mario
# Braga, 24 turmas), a chamada fetch() do backend Node pro servico
# Python falha com "fetch failed" -- erro de conexao, nao um erro de
# negocio do solver.
#
# Este patch adiciona:
#   1. Um "esquenta" (health-check com espera) antes de mandar a carga
#      pesada, dando tempo do container acordar de forma controlada.
#   2. Uma segunda tentativa automatica se a primeira falhar por erro
#      de conexao (nao insiste em erros de negocio como INVIAVEL).
#
# Sem custo adicional -- alternativa ao upgrade de plano pago no Render.
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\corrigir-cpsat-coldstart.ps1

$ErrorActionPreference = "Stop"

$arquivo = "artifacts\api-server\src\routes\horarios.ts"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo. Rode este script na raiz do repo (C:\Projetos\nexgrade-app)." -ForegroundColor Red
    exit 1
}

Write-Host "Lendo $arquivo..." -ForegroundColor Cyan
$conteudoBruto = Get-Content -Path $arquivo -Raw -Encoding UTF8
$usaCRLF = $conteudoBruto -match "`r`n"
# [DIAGNOSTICO] Normaliza pra LF antes de comparar -- se o arquivo no
# disco estiver em CRLF (comum em checkouts Windows), a comparacao
# literal contra os blocos abaixo (escritos em LF) falharia mesmo com
# o texto visualmente identico. Restauramos CRLF ao salvar, se for o
# caso, pra nao mudar o estilo de quebra de linha do arquivo.
$conteudo = $conteudoBruto -replace "`r`n", "`n"

if ($conteudo -match [regex]::Escape("aguardarCpsatServiceAcordado")) {
    Write-Host "AVISO: 'aguardarCpsatServiceAcordado' ja existe no arquivo -- parece que este patch ja foi aplicado antes. Abortando sem alterar nada." -ForegroundColor Yellow
    exit 0
}

# ── Parte 1: insere a funcao de wake-up logo apos a declaracao de
#    CPSAT_SERVICE_URL ────────────────────────────────────────────

$anchorUrl = 'const CPSAT_SERVICE_URL = process.env.CPSAT_SERVICE_URL || "https://nexgrade-cpsat.onrender.com";'

$ocorrenciasUrl = ([regex]::Matches($conteudo, [regex]::Escape($anchorUrl))).Count
if ($ocorrenciasUrl -ne 1) {
    Write-Host "ERRO: esperava 1 ocorrencia da declaracao de CPSAT_SERVICE_URL, encontrei $ocorrenciasUrl." -ForegroundColor Red
    exit 1
}

$funcaoWakeup = @'


// [FIX-COLDSTART] "Esquenta" o servico nexgrade-cpsat antes de mandar
// uma carga pesada -- ver comentario no topo deste arquivo/patch. Faz
// um GET leve em /api/healthz repetidamente ate ele responder OK ou
// ate estourar o prazo maximo; nunca lanca erro, so retorna mais cedo
// se conseguir confirmar que o servico esta acordado (o timeout da
// chamada principal continua sendo a rede de seguranca final).
async function aguardarCpsatServiceAcordado(maxEsperaMs = 90_000): Promise<void> {
  const inicio = Date.now();
  while (Date.now() - inicio < maxEsperaMs) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${CPSAT_SERVICE_URL}/api/healthz`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) return;
    } catch {
      // Ainda hibernado/acordando (ou instavel) -- tenta de novo.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  // Nao conseguiu confirmar dentro do prazo -- segue mesmo assim; a
  // chamada principal tem seu proprio timeout e retry, e vai reportar
  // o erro adequado se o servico realmente estiver fora do ar.
}
'@

$conteudo = $conteudo.Replace($anchorUrl, ($anchorUrl + $funcaoWakeup))

# ── Parte 2: substitui a chamada unica ao servico CP-SAT por uma
#    versao com wake-up previo + retry em falhas de conexao ────────

$originalChamada = @'
  try {
    const controller = new AbortController();
    const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${CPSAT_SERVICE_URL}/gerar-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Servico CP-SAT respondeu ${response.status}: ${errBody}`);
    }
    resultado = (await response.json()) as typeof resultado;
  } catch (err) {
    return {
      httpStatus: 502,
      body: {
        error: "Nao foi possivel gerar a grade com o motor CP-SAT.",
        detalhe: err instanceof Error ? err.message : String(err),
        dica: "Verifique se o servico nexgrade-cpsat esta no ar (pode estar hibernado se estiver no free tier do Render).",
      },
    };
  }
'@

$novaChamada = @'
  // [FIX-COLDSTART] Da tempo do servico acordar antes da carga
  // pesada -- ver comentario no topo do arquivo/patch.
  await aguardarCpsatServiceAcordado();

  const MAX_TENTATIVAS_CPSAT = 2;
  let ultimoErroCpsat: unknown = null;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_CPSAT; tentativa++) {
    try {
      const controller = new AbortController();
      const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${CPSAT_SERVICE_URL}/gerar-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Servico CP-SAT respondeu ${response.status}: ${errBody}`);
      }
      resultado = (await response.json()) as typeof resultado;
      ultimoErroCpsat = null;
      break;
    } catch (err) {
      ultimoErroCpsat = err;
      // So vale a pena tentar de novo em falha de conexao (cold
      // start ainda rolando, rede instavel) -- um erro HTTP real do
      // servico (4xx/5xx com corpo) nao muda tentando de novo.
      const mensagemErroCpsat = err instanceof Error ? err.message : String(err);
      const pareceFalhaConexao =
        mensagemErroCpsat.includes("fetch failed") ||
        mensagemErroCpsat.includes("ECONNREFUSED") ||
        mensagemErroCpsat.includes("ETIMEDOUT");
      if (!pareceFalhaConexao || tentativa === MAX_TENTATIVAS_CPSAT) break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  if (ultimoErroCpsat != null) {
    return {
      httpStatus: 502,
      body: {
        error: "Nao foi possivel gerar a grade com o motor CP-SAT.",
        detalhe: ultimoErroCpsat instanceof Error ? ultimoErroCpsat.message : String(ultimoErroCpsat),
        dica: "Verifique se o servico nexgrade-cpsat esta no ar (pode estar hibernado se estiver no free tier do Render).",
      },
    };
  }
'@

$ocorrenciasChamada = ([regex]::Matches($conteudo, [regex]::Escape($originalChamada))).Count
if ($ocorrenciasChamada -ne 1) {
    Write-Host "ERRO: esperava exatamente 1 ocorrencia do bloco de chamada ao CP-SAT, encontrei $ocorrenciasChamada." -ForegroundColor Red
    Write-Host "DIAGNOSTICO: arquivo usa CRLF? $usaCRLF" -ForegroundColor Yellow
    exit 1
}

$conteudo = $conteudo.Replace($originalChamada, $novaChamada)

if ($usaCRLF) {
    $conteudo = $conteudo -replace "`n", "`r`n"
}

Set-Content -Path $arquivo -Value $conteudo -Encoding UTF8 -NoNewline

Write-Host "Pronto! Backend agora 'esquenta' o servico CP-SAT antes de chamadas pesadas e tenta de novo em falhas de conexao." -ForegroundColor Green
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. npx tsc --noEmit   (conferir que compila sem erros)"
Write-Host "  2. git diff $arquivo  (revisar a mudanca)"
Write-Host "  3. git add -A; git commit -m 'fix: esquenta e tenta novamente o servico CP-SAT antes de desistir'"
Write-Host "  4. git push"
