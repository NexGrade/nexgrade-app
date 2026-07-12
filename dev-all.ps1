# dev-all.ps1 — abre backend e frontend cada um em sua própria janela isolada
Start-Process powershell -ArgumentList "-NoExit", "-File", "C:\projetos\nexgrade-app\dev-backend.ps1"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-File", "C:\projetos\nexgrade-app\dev-frontend.ps1"