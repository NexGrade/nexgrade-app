# Infra da VM do CP-SAT (GCP)

Configuração que vive **dentro da VM** `nexgrade-cpsat-teste` e não é instalada pelo `scripts/deploy-cpsat.ps1`. Guardada aqui para não se perder se a VM for recriada.

Última alteração: 16/10/2026 (HTTPS + filtro de IPs).

## Como o caminho funciona

```
Render (nexgrade-app)
  └─ https://cpsat.nexuscoretecnologia.com.br  (porta 443)
       └─ Caddy na VM  (certificado Let's Encrypt automático, filtro de IPs)
            └─ uvicorn em 127.0.0.1:8000  (cpsat.service)
```

- **VM:** `nexgrade-cpsat-teste`, zona `southamerica-east1-a`, n2d-standard-4, Debian 13.
- **IP fixo:** `34.95.232.215` (endereço reservado `nexgrade-cpsat-ip`).
- **DNS:** registro A `cpsat` → `34.95.232.215`, no Registro.br (modo avançado).
- **Render:** `CPSAT_SERVICE_URL=https://cpsat.nexuscoretecnologia.com.br` (sem porta, sem barra no final).

## Arquivos na VM

| Arquivo | O que é |
|---|---|
| `/etc/caddy/Caddyfile` | cópia do `Caddyfile` desta pasta |
| `/etc/caddy/Caddyfile.original` | o padrão do pacote (página de exemplo na porta 80) |
| `/etc/caddy/Caddyfile.sem-filtro` | HTTPS sem filtro de IPs (versão intermediária de 16/10) |
| `/etc/systemd/system/cpsat.service` | uvicorn com `--host 127.0.0.1` |
| `/etc/systemd/system/cpsat.service.original` | versão antiga, com `--host 0.0.0.0` |
| `/usr/local/bin/cpsat-auto-desligar.sh` + `.timer` | desliga a VM após 20 min ociosa (`/etc/cpsat-auto-desligar.conf`, `MODO=real`) |

## Firewall do GCP

- `permitir-https-cpsat`: tcp 80 e 443, de qualquer origem, só para VMs com a etiqueta `cpsat-https`. Precisa ficar aberta para todos porque o Let's Encrypt valida e renova o certificado de vários servidores. A restrição de quem usa o CP-SAT é feita no Caddy.
- `default-allow-ssh`: tcp 22.
- **Removidas em 16/10:** `permitir-porta-8000` (porta do uvicorn, agora só interna) e `default-allow-rdp` (sem uso em Linux).

## ⚠️ Se a geração de grade parar de funcionar

**1. O Render mudou os IPs de saída.** O Caddy só aceita `74.220.50.0/24` e `74.220.58.0/24`. Se o Render trocar, as gerações começam a falhar com conexão cortada. Confira os IPs no painel do Render (serviço `nexgrade-app` → Connect → Outbound) e atualize a linha `@permitido` no `Caddyfile`.

**2. Robôs impedindo o auto-desligar.** O script considera a VM ocupada se o `uvicorn.log` mudou nos últimos 20 minutos. Sem o filtro de IPs, os robôs que varrem a internet batem na porta 443 o tempo todo e a VM nunca desliga. Foi o que aconteceu em 16/10, antes do filtro. Se a VM ficar ligada sem motivo, olhe o fim do `uvicorn.log`.

## Como aplicar uma mudança no Caddyfile

Sempre com dry-run (validar antes de recarregar). A partir do PowerShell, sem abrir sessão interativa:

```powershell
gcloud compute scp .\cpsat-service\infra\Caddyfile nexgrade-cpsat-teste:Caddyfile.novo --zone southamerica-east1-a
gcloud compute ssh nexgrade-cpsat-teste --zone southamerica-east1-a --command "sed -i 's/\r$//' ~/Caddyfile.novo && caddy validate --config ~/Caddyfile.novo --adapter caddyfile 2>&1 | tail -n 1"
# só se der "Valid configuration":
gcloud compute ssh nexgrade-cpsat-teste --zone southamerica-east1-a --command "sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.anterior && sudo cp ~/Caddyfile.novo /etc/caddy/Caddyfile && sudo caddy fmt --overwrite /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

A VM precisa estar ligada (`gcloud compute instances start ...`). Se o trabalho for demorado, pause o auto-desligar com `sudo systemctl stop cpsat-auto-desligar.timer` e **lembre de religar** com `start` no final.

## Como voltar para o modelo antigo (HTTP direto na porta 8000)

1. Na VM: `sudo cp /etc/systemd/system/cpsat.service.original /etc/systemd/system/cpsat.service && sudo systemctl daemon-reload && sudo systemctl restart cpsat`
2. Recriar a regra de firewall da porta 8000 restrita aos IPs do Render.
3. No Render: `CPSAT_SERVICE_URL=http://34.95.232.215:8000`.

## Dica de terminal

Na sessão interativa (`gcloud compute ssh` sem `--command`), clicar com o botão direito **cola**, e o terminal tenta executar o texto colado. Para copiar, só selecione com o mouse. Na primeira vez em cada sessão, digite à mão `bind 'set enable-bracketed-paste off'` para a colagem funcionar.
