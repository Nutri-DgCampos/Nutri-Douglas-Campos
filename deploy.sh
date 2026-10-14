#!/bin/bash

# ========================================================================
# Script de Deploy - Acompanhamento Nutricional
# ========================================================================
# Mesmo esquema do deploy.sh do LTM Manager: identifica o ambiente, faz
# backup do banco, sincroniza com o GitHub, confere o nginx do host,
# reconstroi os containers, aplica migrations e verifica o resultado.

# Carrega as variaveis do .env (allexport exporta tudo o que for atribuido).
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# ------------------------------------------------------------------------
# HELPERS DE FORMATACAO
# ------------------------------------------------------------------------

WIDTH=72
TOTAL_SECTIONS=8

# Cores so quando a saida e um terminal (NO_COLOR=1 tambem desliga).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_RESET=$'\033[0m'
    C_BOLD=$'\033[1m'
    C_DIM=$'\033[2m'
    C_RED=$'\033[31m'
    C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'
    C_MAGENTA=$'\033[35m'
    C_CYAN=$'\033[36m'
else
    C_RESET=''; C_BOLD=''; C_DIM=''
    C_RED=''; C_GREEN=''; C_YELLOW=''; C_MAGENTA=''; C_CYAN=''
fi

line_double() {
    printf '%s' "${C_BOLD}${C_CYAN}"
    printf '=%.0s' $(seq 1 $WIDTH)
    printf '%s\n' "${C_RESET}"
}

line_single() {
    printf -- '-%.0s' $(seq 1 $WIDTH)
    echo
}

# Cabecalho de secao: "----- [N/8] TITULO ---------..."
section() {
    local prefix="----- [${1}/${TOTAL_SECTIONS}] ${2} "
    local pad=$((WIDTH - ${#prefix}))
    echo
    printf '%s%s' "${C_BOLD}${C_CYAN}" "$prefix"
    printf -- '-%.0s' $(seq 1 $pad)
    printf '%s\n' "${C_RESET}"
}

log_tag() {
    printf '  %s%s%s  %s[%s]%s  %s\n' \
        "${C_DIM}" "$(date '+%H:%M:%S')" "${C_RESET}" \
        "$1" "$2" "${C_RESET}" \
        "$3"
}

log_info() { log_tag "${C_CYAN}"         " INFO " "$1"; }
log_ok()   { log_tag "${C_GREEN}"        "  OK  " "$1"; }
log_warn() { log_tag "${C_YELLOW}"       " WARN " "$1"; }
log_fail() { log_tag "${C_BOLD}${C_RED}" " FAIL " "$1"; }
log_skip() { log_tag "${C_DIM}"          " SKIP " "$1"; }
log_step() { log_tag "${C_MAGENTA}"      " STEP " "$1"; }

log_raw() {
    printf '  %s%s%s          %s\n' \
        "${C_DIM}" "$(date '+%H:%M:%S')" "${C_RESET}" \
        "$1"
}

# ------------------------------------------------------------------------
# ARGUMENTOS
# ------------------------------------------------------------------------

# --yes pula a confirmacao do deploy em producao.
ASSUME_YES=0
# --sem-backup roda sem o dump do banco.
SKIP_BACKUP=0
# --nginx autoriza trocar o nginx do host em PRODUCAO sem terminal (o --yes nao cobre).
NGINX_ASSUME_YES=0
# Resultado do passo do nginx: OK, SKIP, DIFERE... ou FAIL.
NGINX_STATUS="SKIP"

for arg in "$@"; do
    case "$arg" in
        -y|--yes)     ASSUME_YES=1 ;;
        --sem-backup) SKIP_BACKUP=1 ;;
        --nginx)      NGINX_ASSUME_YES=1 ;;
        -h|--help)
            echo "Uso: ./deploy.sh [--yes] [--sem-backup] [--nginx]"
            echo "  --yes         nao pede confirmacao em producao (nao vale para o nginx do host)"
            echo "  --sem-backup  nao faz o dump do banco antes do deploy"
            echo "  --nginx       troca o nginx do host em producao sem perguntar"
            exit 0
            ;;
        *) log_warn "Argumento desconhecido ignorado: $arg" ;;
    esac
done

# ------------------------------------------------------------------------
# CABECALHO
# ------------------------------------------------------------------------

echo
line_double
echo "  ACOMPANHAMENTO NUTRICIONAL  -  DEPLOY"
echo "  Iniciado em: $(date '+%Y-%m-%d %H:%M:%S')"
line_double

if [ ! -f "docker-compose.yml" ]; then
    log_fail "Execute este script no diretorio do projeto (onde esta o docker-compose.yml)"
    exit 1
fi

# Compose v2 ("docker compose") ou o antigo "docker-compose".
if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
else
    log_fail "Docker Compose nao encontrado"
    exit 1
fi

# psql dentro do container do banco, sempre parando no primeiro erro.
psql_banco() {
    docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -q \
        -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}


# ========================================================================
# 1. IDENTIFICAR O AMBIENTE E FAZER O BACKUP DO BANCO
# ========================================================================
section 1 "AMBIENTE E BACKUP"

# O certificado emitido e o que distingue producao de teste.
if [ -n "${DOMINIO_PRODUCAO:-}" ] && [ -d "/etc/letsencrypt/live/${DOMINIO_PRODUCAO}" ]; then
    ENV_NAME="PRODUCAO"
    DOMINIO="$DOMINIO_PRODUCAO"
elif [ -n "${DOMINIO_TESTE:-}" ] && [ -d "/etc/letsencrypt/live/${DOMINIO_TESTE}" ]; then
    ENV_NAME="TESTE"
    DOMINIO="$DOMINIO_TESTE"
else
    log_fail "Ambiente nao identificado: defina DOMINIO_PRODUCAO/DOMINIO_TESTE no .env e emita o certificado (deploy/nginx/README.md)"
    exit 1
fi
SITE_URL="https://${DOMINIO}"
log_ok "Ambiente: ${ENV_NAME} (${SITE_URL})"

if [ "$ENV_NAME" = "PRODUCAO" ] && [ "$ASSUME_YES" -eq 0 ]; then
    if [ -t 0 ]; then
        printf '  %sDeploy em PRODUCAO. Digite PRODUCAO para continuar: %s' \
            "${C_BOLD}${C_YELLOW}" "${C_RESET}" >&2
        read -r confirmacao
        if [ "$confirmacao" != "PRODUCAO" ]; then
            log_fail "Confirmacao nao recebida - deploy cancelado"
            exit 1
        fi
    else
        log_fail "Deploy em PRODUCAO sem terminal - use --yes se for intencional"
        exit 1
    fi
fi

BACKUP_FILE="db_backup_pre_deploy_$(date +%Y%m%d_%H%M).sql"

if [ "$SKIP_BACKUP" -eq 1 ]; then
    log_skip "Backup do banco ignorado (--sem-backup)"
elif [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
    log_fail "POSTGRES_USER ou POSTGRES_DB ausentes no .env"
    exit 1
elif ! docker ps --format '{{.Names}}' | grep -q '^nutri-postgres$'; then
    # Primeira instalacao: ainda nao ha banco para salvar.
    log_warn "Container nutri-postgres nao esta rodando - sem backup (primeira instalacao?)"
    SKIP_BACKUP=1
else
    log_step "pg_dump -> ${BACKUP_FILE}"
    if ! docker exec nutri-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
            > "$BACKUP_FILE" 2>/tmp/nutri_pg_dump_err.txt; then
        log_fail "pg_dump falhou: $(tail -1 /tmp/nutri_pg_dump_err.txt)"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    # Dump interrompido no meio nao tem a linha final. Sem backup confiavel, nao comeca.
    if ! tail -5 "$BACKUP_FILE" | grep -q "PostgreSQL database dump complete"; then
        log_fail "Backup incompleto (sem 'PostgreSQL database dump complete') - deploy cancelado"
        exit 1
    fi
    log_ok "Backup: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"
fi


# ========================================================================
# 2. SINCRONIZAR CODIGO COM O GITHUB
# ========================================================================
section 2 "SINCRONIZACAO COM GITHUB"

log_info "Verificando conectividade com GitHub"
if ! timeout 30 git ls-remote origin HEAD >/dev/null 2>&1; then
    log_fail "Nao foi possivel conectar com GitHub (verifique internet ou chaves SSH)"
    exit 1
fi
log_ok "GitHub acessivel"

if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warn "Mudancas locais nao commitadas detectadas -> salvando em stash"
    git stash push -m "Deploy stash $(date)" 2>/dev/null || true
fi

log_info "Executando fetch --prune --force (timeout 60s)"
if ! timeout 60 git fetch origin --prune --force; then
    log_fail "Erro ao buscar atualizacoes do GitHub"
    exit 1
fi
log_ok "Fetch concluido"

COMMITS_NOVOS=$(git log --oneline HEAD..origin/main 2>/dev/null)
if [ -n "$COMMITS_NOVOS" ]; then
    log_info "Commits que vao entrar:"
    while IFS= read -r linha; do log_raw "$linha"; done <<< "$COMMITS_NOVOS"
else
    log_info "Nenhum commit novo (redeploy do mesmo codigo)"
fi

log_step "git reset --hard origin/main"
if ! git reset --hard origin/main; then
    log_fail "Erro ao resetar para origin/main"
    exit 1
fi

# Remove arquivos nao rastreados, preservando .env, backups e dumps.
git clean -fd --exclude='.env' --exclude='*.tar.gz' --exclude='*.sql' --exclude='banco/dump' || true

if [ "$(git rev-parse origin/main)" != "$(git rev-parse HEAD)" ]; then
    log_fail "Diretorio local nao sincronizou corretamente com o GitHub"
    exit 1
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
log_ok "Sincronizado no commit ${CURRENT_COMMIT:0:8}"


# ========================================================================
# 3. NGINX DO HOST
# ========================================================================
section 3 "NGINX DO HOST"

# O arquivo versionado leva o nome do dominio: deploy/nginx/<dominio>
NGINX_SITE="$DOMINIO"
NGINX_REPO_FILE="deploy/nginx/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"

log_info "nginx do host: ${NGINX_ENABLED} x ${NGINX_REPO_FILE}"

nginx_host_sync() {
    if [ "$(id -u)" -ne 0 ]; then
        log_warn "nginx: deploy sem root - conferencia do nginx ignorada"
        return 0
    fi
    if ! command -v nginx >/dev/null 2>&1; then
        log_warn "nginx: nao instalado neste servidor - ignorado"
        return 0
    fi
    if [ ! -f "$NGINX_REPO_FILE" ]; then
        log_warn "nginx: ${NGINX_REPO_FILE} nao existe no repositorio - ignorado"
        return 0
    fi
    if [ ! -e "$NGINX_ENABLED" ]; then
        log_warn "nginx: ${NGINX_ENABLED} nao existe - primeira instalacao e manual (deploy/nginx/README.md)"
        return 0
    fi

    # Outro arquivo habilitado com o mesmo server_name faria o nginx ignorar um dos dois.
    local nomes nome outro
    nomes=$(grep -hE '^\s*server_name' "$NGINX_REPO_FILE" | sed -E 's/^\s*server_name\s+//; s/;.*//' | tr ' ' '\n' | sort -u)
    for nome in $nomes; do
        for outro in /etc/nginx/sites-enabled/*; do
            [ "$outro" = "$NGINX_ENABLED" ] && continue
            if grep -qE "^\s*server_name\b.*[[:space:]]${nome//./\\.}([[:space:];]|$)" "$outro" 2>/dev/null; then
                log_fail "nginx: ${outro} tambem declara server_name ${nome} - nada foi trocado"
                return 1
            fi
        done
    done

    local alvo
    alvo=$(readlink -f "$NGINX_ENABLED")

    if cmp -s "$alvo" "$NGINX_REPO_FILE"; then
        log_ok "nginx: igual ao versionado"
        NGINX_STATUS="OK"
        return 0
    fi

    log_warn "nginx: servidor difere do versionado:"
    diff -u "$alvo" "$NGINX_REPO_FILE" | while IFS= read -r linha; do log_raw "$linha"; done

    if [ "$ENV_NAME" = "PRODUCAO" ] && [ "$NGINX_ASSUME_YES" -eq 0 ]; then
        if [ -t 0 ]; then
            printf '  %sTrocar o nginx de PRODUCAO pelo versionado? Digite NGINX para trocar: %s' \
                "${C_BOLD}${C_YELLOW}" "${C_RESET}" >&2
            read -r confirmacao_nginx
            if [ "$confirmacao_nginx" != "NGINX" ]; then
                log_skip "nginx: troca recusada - servidor continua com o arquivo atual"
                NGINX_STATUS="DIFERE do versionado (troca recusada)"
                return 0
            fi
        else
            log_skip "nginx: producao sem terminal - use --nginx para trocar"
            NGINX_STATUS="DIFERE do versionado (use --nginx)"
            return 0
        fi
    fi

    # Backup FORA de sites-enabled: tudo o que esta la e carregado pelo nginx.
    local backup="/etc/nginx/sites-available/${NGINX_SITE}.bak-$(date +%Y%m%d_%H%M%S)"
    if ! cp -p "$alvo" "$backup"; then
        log_fail "nginx: backup em ${backup} falhou - nada foi trocado"
        return 1
    fi
    log_step "nginx: backup em ${backup}"

    if ! cp "$NGINX_REPO_FILE" "$alvo"; then
        cp -p "$backup" "$alvo"
        log_fail "nginx: nao foi possivel copiar o versionado - backup restaurado"
        return 1
    fi

    if ! nginx -t >/tmp/nutri_nginx_t.txt 2>&1; then
        while IFS= read -r linha; do log_raw "$linha"; done < /tmp/nutri_nginx_t.txt
        cp -p "$backup" "$alvo"
        if nginx -t >/dev/null 2>&1; then
            log_fail "nginx: 'nginx -t' falhou com o versionado - backup restaurado, site sem mudanca"
        else
            log_fail "nginx: 'nginx -t' falha ATE com o backup restaurado - conferir /etc/nginx a mao (nada foi recarregado)"
        fi
        return 1
    fi

    if ! systemctl reload nginx; then
        log_fail "nginx: 'systemctl reload nginx' falhou - conferir 'systemctl status nginx'"
        return 1
    fi

    log_ok "nginx: versionado instalado e recarregado"
    NGINX_STATUS="OK"
    return 0
}

if ! nginx_host_sync; then
    NGINX_STATUS="FAIL"
fi


# ========================================================================
# 4. GERENCIAR CONTAINERS DOCKER
# ========================================================================
section 4 "CONTAINERS DOCKER"

log_info "Validando docker-compose.yml"
if ! $DC config > /dev/null 2>&1; then
    log_fail "Sintaxe invalida no docker-compose.yml (ou variavel faltando no .env)"
    exit 1
fi
log_ok "docker-compose.yml valido"

# O build vem ANTES do down: o site so sai do ar depois que a imagem nova existe.
log_info "Rebuilding containers (--no-cache) - pode demorar alguns minutos"
if ! $DC build --no-cache; then
    log_fail "Erro ao fazer build dos containers (os containers atuais continuam no ar)"
    exit 1
fi
log_ok "Build concluido"

log_step "$DC down"
$DC down 2>/dev/null || true

log_step "docker system prune -f"
docker system prune -f >/dev/null 2>&1 || true

log_info "Iniciando containers ($DC up -d)"
if ! $DC up -d; then
    log_fail "Erro ao iniciar containers - exibindo ultimos logs:"
    line_single
    $DC logs --tail=50
    line_single
    exit 1
fi
log_ok "Containers iniciados"


# ========================================================================
# 5. EXECUTAR MIGRATIONS DE BANCO DE DADOS
# ========================================================================
section 5 "MIGRATIONS DE BANCO DE DADOS"

# A estrutura inicial (banco/init) roda sozinha na primeira criacao do banco.
# Aqui entram as alteracoes posteriores, cada arquivo uma unica vez.
MIGRATIONS_DIR="./banco/migrations"

log_info "Aguardando o banco aceitar conexoes"
for i in {1..30}; do
    if docker exec nutri-postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

if ! psql_banco -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id serial PRIMARY KEY,
        migration_name varchar(255) NOT NULL UNIQUE,
        executed_at timestamp with time zone DEFAULT now() NOT NULL
    );" 2>>deploy.log; then
    log_fail "Nao foi possivel acessar o banco para as migrations (veja deploy.log)"
elif [ -d "$MIGRATIONS_DIR" ]; then
    TOTAL_MIGRATIONS=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" | wc -l)
    log_info "Encontradas ${TOTAL_MIGRATIONS} migrations em ${MIGRATIONS_DIR}"

    # sort garante a ordem pelos prefixos numericos (001, 002, 003...).
    for migration_file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" | sort); do
        migration_name=$(basename "$migration_file")
        ja_aplicada=$(psql_banco -At -c "SELECT count(*) FROM public.schema_migrations WHERE migration_name = '${migration_name}'" 2>/dev/null)

        if [ "$ja_aplicada" = "0" ]; then
            # --single-transaction: ou a migration entra inteira, ou nao entra.
            if psql_banco --single-transaction < "$migration_file" >>deploy.log 2>&1; then
                psql_banco -c "INSERT INTO public.schema_migrations (migration_name) VALUES ('${migration_name}')" 2>>deploy.log
                log_ok "Aplicada: ${migration_name}"
            else
                log_fail "Falha ao aplicar: ${migration_name} (deploy continua, revise deploy.log)"
            fi
        else
            log_skip "Ja aplicada: ${migration_name}"
        fi
    done
else
    log_warn "Diretorio nao encontrado: ${MIGRATIONS_DIR}"
fi


# ========================================================================
# 6. VERIFICACAO POS-DEPLOY
# ========================================================================
section 6 "VERIFICACAO POS-DEPLOY"

log_info "Aguardando 15s para estabilizacao"
sleep 15

log_info "Status dos containers:"
line_single
$DC ps
line_single

APP_LOCAL="http://127.0.0.1:${APP_PORTA:-3000}"
APP_STATUS="FAIL"

log_info "Testando app e banco em ${APP_LOCAL}/api/saude"
for i in {1..6}; do
    if curl -s -o /dev/null -w "%{http_code}" "${APP_LOCAL}/api/saude" | grep -q "200"; then
        log_ok "App respondendo e conectado ao banco (HTTP 200)"
        APP_STATUS="OK"
        break
    else
        log_warn "Tentativa ${i}/6 falhou - aguardando 5s"
        sleep 5
    fi
done

if [ "$APP_STATUS" = "OK" ]; then
    status_login=$(curl -s -o /dev/null -w "%{http_code}" "${APP_LOCAL}/login")
    if [ "$status_login" = "200" ]; then
        log_ok "/login -> HTTP 200"
    else
        log_fail "/login -> HTTP ${status_login}"
        APP_STATUS="FAIL"
    fi
else
    log_fail "App nao respondeu - ultimos logs:"
    line_single
    $DC logs --tail=40 app
    line_single
fi

if docker ps --format '{{.Names}}' | grep -q '^nutri-cron$'; then
    log_ok "Agendador (nutri-cron) em execucao"
else
    log_fail "Agendador (nutri-cron) nao esta em execucao - notificacoes paradas"
    APP_STATUS="FAIL"
fi


# ========================================================================
# 7. LIMPEZA DE BACKUPS ANTIGOS
# ========================================================================
section 7 "LIMPEZA DE BACKUPS ANTIGOS"

DAYS_TO_KEEP=7
log_info "Mantendo ultimos ${DAYS_TO_KEEP} dias"

sql_count=$(find . -maxdepth 1 -type f -name "db_backup_*.sql" -mtime +"$DAYS_TO_KEEP" | wc -l)
find . -maxdepth 1 -type f -name "db_backup_*.sql" -mtime +"$DAYS_TO_KEEP" -delete
log_ok "Removidos ${sql_count} backup(s) SQL"


# ========================================================================
# 8. FINALIZACAO
# ========================================================================
section 8 "FINALIZACAO"

if [ "$APP_STATUS" = "FAIL" ]; then
    log_fail "Deploy concluido COM FALHA na verificacao do app - ver a secao 6 do log"
elif [ "$NGINX_STATUS" = "FAIL" ]; then
    log_fail "Deploy concluido COM FALHA no nginx do host - ver a secao 3 do log"
else
    log_ok "Deploy concluido com sucesso"
fi
log_raw "Ambiente ........... ${ENV_NAME}"
log_raw "Commit ............. ${CURRENT_COMMIT:0:8}"
log_raw "Site ............... ${SITE_URL}"
if [ "$SKIP_BACKUP" -eq 0 ]; then
    log_raw "Backup ............. ${BACKUP_FILE}"
fi
log_raw "nginx do host ...... ${NGINX_STATUS}"

echo
line_double

if [ "$APP_STATUS" = "FAIL" ] || [ "$NGINX_STATUS" = "FAIL" ]; then
    exit 2
fi
