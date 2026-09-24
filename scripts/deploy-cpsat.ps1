param([switch]$Executar)
$ErrorActionPreference = "Stop"
# Publica o servico CP-SAT do REPOSITORIO na instancia GCP.
#  - sem -Executar: DRY-RUN, so compara (hash com fim de linha LF) e lista o que mudou
#  - com -Executar: envia so os arquivos alterados, faz backup da pasta app no GCP,
#    testa a compilacao numa copia, instala, reinicia o cpsat e confere a saude.
# Regra: NUNCA editar direto no GCP. Mudou no repo -> commit -> este script.
$vm = "nexgrade-cpsat-teste"
$zona = "southamerica-east1-a"
$local = "C:\nexgrade-app-atualizado\cpsat-service\app"
$remoto = "/home/simone/cpsat-service/app"
$arquivos = @("main.py", "solver.py", "pipeline_coordenada.py", "reduzir_janelas.py", "__init__.py")

function Get-HashLF([string]$caminho) {
  $t = [IO.File]::ReadAllText($caminho).Replace("`r`n", "`n")
  $sha = [Security.Cryptography.SHA256]::Create()
  return ([BitConverter]::ToString($sha.ComputeHash((New-Object System.Text.UTF8Encoding($false)).GetBytes($t)))).Replace("-", "").ToLower()
}

$listaRemota = ($arquivos | ForEach-Object { "$remoto/$_" }) -join " "
$cmdHash = "sudo sha256sum " + $listaRemota
$saidaRemota = gcloud compute ssh $vm --zone=$zona "--command=$cmdHash"
$hashRemoto = @{}
foreach ($linha in $saidaRemota) {
  if ($linha -match '^([0-9a-f]{64})\s+.*/([^/]+)$') { $hashRemoto[$Matches[2]] = $Matches[1] }
}

if ($hashRemoto.Count -ne $arquivos.Count) { "ERRO: nao consegui ler os hashes de todos os arquivos no GCP. Nada feito."; exit 1 }

$mudados = @()
"=== comparacao repo x GCP ==="
foreach ($a in $arquivos) {
  $hl = Get-HashLF (Join-Path $local $a)
  $hr = $hashRemoto[$a]
  if ($hl -eq $hr) { "  igual     $a" } else { "  DIFERENTE $a"; $mudados += $a }
}
if ($mudados.Count -eq 0) { "Nada a publicar: GCP ja esta igual ao repositorio."; exit 0 }
if (-not $Executar) { "DRY-RUN: $($mudados.Count) arquivo(s) seriam publicados. Rode com -Executar para publicar."; exit 0 }

# 1) prepara copias com fim de linha LF
$tmp = Join-Path $env:TEMP "cpsat-deploy"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
$envio = @()
foreach ($a in $mudados) {
  $t = [IO.File]::ReadAllText((Join-Path $local $a)).Replace("`r`n", "`n")
  [IO.File]::WriteAllText((Join-Path $tmp $a), $t, (New-Object System.Text.UTF8Encoding($false)))
  $envio += (Join-Path $tmp $a)
}

# 2) envia para /tmp/cpsat-deploy na instancia
gcloud compute ssh $vm --zone=$zona --command="rm -rf /tmp/cpsat-deploy && mkdir -p /tmp/cpsat-deploy"
gcloud compute scp @envio "${vm}:/tmp/cpsat-deploy/" --zone=$zona

# 3) backup, teste de compilacao numa copia, instalacao, reinicio e saude
$cmd = @(
  'set -e',
  'TS=$(date +%Y%m%d-%H%M%S)',
  'sudo tar czf /home/simone/cpsat-service/backup-app-$TS.tgz --exclude=__pycache__ -C /home/simone/cpsat-service app',
  'echo BACKUP: /home/simone/cpsat-service/backup-app-$TS.tgz',
  'sudo rm -rf /tmp/cpsat-teste && sudo mkdir -p /tmp/cpsat-teste',
  'sudo cp -r /home/simone/cpsat-service/app /tmp/cpsat-teste/',
  'sudo cp /tmp/cpsat-deploy/*.py /tmp/cpsat-teste/app/',
  'sudo /home/simone/venv/bin/python -m py_compile /tmp/cpsat-teste/app/*.py',
  'echo COMPILA_OK',
  'sudo cp /tmp/cpsat-deploy/*.py /home/simone/cpsat-service/app/',
  'sudo chown -R simone:simone /home/simone/cpsat-service/app',
  'sudo systemctl restart cpsat',
  'sleep 6',
  'echo SERVICO: $(systemctl is-active cpsat)',
  'echo SAUDE: $(curl -s -m 5 http://localhost:8000/)',
  'echo ROTAS: $(curl -s -m 5 http://localhost:8000/openapi.json | grep -o -e /gerar-grade-coordenada -e /gerar-grade -e /melhorar-grade | sort -u | xargs)'
) -join ' && '
gcloud compute ssh $vm --zone=$zona "--command=$cmd"
if ($LASTEXITCODE -ne 0) { "ERRO: a etapa remota falhou (codigo $LASTEXITCODE). Veja as mensagens acima; o backup .tgz permite restaurar."; exit 1 }
"Publicado: $($mudados -join ', ')"
