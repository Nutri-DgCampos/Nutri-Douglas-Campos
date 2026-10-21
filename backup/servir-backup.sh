#!/bin/sh
# Backup externo do Acompanhamento Nutricional (lado do servidor).
#
# Executado SOMENTE pela chave SSH de backup: o authorized_keys desta chave
# força este script (command="...",restrict), então ela não abre terminal nem
# roda nenhum outro comando. O computador de backup pede uma parte por vez e
# recebe o conteúdo pela própria conexão SSH (nada fica gravado no servidor):
#   banco         -> pg_dump do PostgreSQL (formato custom, comprimido)
#   arquivos      -> tar.gz da pasta de arquivos (dietas, exames, receitas, fotos, PDFs)
#   configuracao  -> .env (segredos necessários para restaurar: sessão, push, chaves)
#   versao        -> commit do código em produção

set -eu
cd /opt/nutri

case "${SSH_ORIGINAL_COMMAND:-}" in
  banco)
    exec docker exec nutri-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'
    ;;
  arquivos)
    exec docker exec nutri-app tar czf - -C /dados/arquivos .
    ;;
  configuracao)
    exec cat /opt/nutri/.env
    ;;
  versao)
    exec git -C /opt/nutri log -1 --format='%H %cI %s'
    ;;
  *)
    echo "Comando nao permitido para a chave de backup." >&2
    exit 1
    ;;
esac
