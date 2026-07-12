# dev-backend.ps1 — sobe o backend em janela isolada, sem herdar variáveis da sessão atual
Remove-Item Env:\PORT -ErrorAction SilentlyContinue
Set-Location "C:\projetos\nexgrade-app"
Write-Host "Buildando backend..." -ForegroundColor Cyan
pnpm --filter @workspace/api-server run build
Write-Host "Subindo backend na porta 3000..." -ForegroundColor Green
node --env-file="artifacts\api-server\.env" --enable-source-maps artifacts\api-server\dist\index.mjs