# dev-frontend.ps1 — sobe o frontend em janela isolada, sem herdar variáveis da sessão atual
Set-Location "C:\projetos\nexgrade-app"
$env:PORT = "5173"
$env:BASE_PATH = "/"
$env:VITE_CLERK_PUBLISHABLE_KEY = "pk_test_bWF4aW11bS1kb3J5LTkxLmNsZXJrLmFjY291bnRzLmRldiQ"
Write-Host "Subindo frontend na porta 5173..." -ForegroundColor Green
pnpm --filter @workspace/horario-escolar run dev