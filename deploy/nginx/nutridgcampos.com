# nginx do HOST da VPS: recebe o HTTPS de nutridgcampos.com e repassa para o
# container nutri-app. Instalado e mantido pelo deploy.sh (deploy/nginx/README.md).

# HTTP -> HTTPS, sempre no endereco sem "www".
server {
    listen 80;
    server_name nutridgcampos.com www.nutridgcampos.com;

    return 301 https://nutridgcampos.com$request_uri;
}

# www -> sem "www".
server {
    listen 443 ssl;
    server_name www.nutridgcampos.com;

    ssl_certificate /etc/letsencrypt/live/nutridgcampos.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/nutridgcampos.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    return 301 https://nutridgcampos.com$request_uri;
}

server {
    listen 443 ssl;
    server_name nutridgcampos.com;

    ssl_certificate /etc/letsencrypt/live/nutridgcampos.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/nutridgcampos.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    # Dietas em PDF chegam a 50 MB; a folga cobre o cabecalho da requisicao.
    client_max_body_size 55m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # O app usa estes cabecalhos para saber o endereco publico (links de
        # e-mail) e para recusar requisicoes vindas de outros sites.
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # A devolutiva gerada por IA pode levar dezenas de segundos.
        proxy_read_timeout 120s;
    }
}
