# nginx do host

O nginx **do host** da VPS recebe o HTTPS e repassa tudo para o container `nutri-app` em `127.0.0.1:3000`.

O arquivo versionado leva o nome do domínio: `deploy/nginx/<dominio>`, igual ao `DOMINIO_PRODUCAO` (ou `DOMINIO_TESTE`) do `.env`. O `deploy.sh` compara esse arquivo com `/etc/nginx/sites-enabled/<dominio>` e, se forem diferentes, faz backup, instala, roda `nginx -t` e recarrega. Em produção ele pede para digitar `NGINX` antes de trocar (ou use `./deploy.sh --nginx`).

## Primeira instalação (manual)

O arquivo versionado aponta para certificados que ainda não existem em um servidor novo, então a ordem é:

1. Aponte o DNS do domínio para a VPS e instale: `apt install -y nginx certbot python3-certbot-nginx`.
2. Crie um bloco provisório só HTTP em `/etc/nginx/sites-available/<dominio>`, com link em `sites-enabled/`:
   `server { listen 80; server_name <dominio>; location / { return 200; } }`
   Depois: `nginx -t && systemctl reload nginx`.
3. Emita o certificado: `certbot --nginx -d <dominio>`.
4. Copie `deploy/nginx/modelo` para `deploy/nginx/<dominio>`, troque `SEU_DOMINIO` pelo domínio e faça o commit.
5. Instale: `cp deploy/nginx/<dominio> /etc/nginx/sites-available/<dominio> && nginx -t && systemctl reload nginx`.
6. No `.env` da VPS, defina `DOMINIO_PRODUCAO=<dominio>`, `APP_URL=https://<dominio>` e `SESSAO_COOKIE_SEGURO=true`.

Daí em diante o `deploy.sh` mantém o arquivo. Ele identifica o ambiente pelo certificado em `/etc/letsencrypt/live/<dominio>`, por isso o passo 3 vem antes do primeiro deploy.
