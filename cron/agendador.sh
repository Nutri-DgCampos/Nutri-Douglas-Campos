#!/bin/sh
# Agendador: substitui o cron da Vercel e o pg_cron do Supabase.
# A cada 5 minutos chama as rotinas de notificacao; uma vez por dia, a de
# inativacao de pacientes com acesso vencido.

chamar() {
    if resposta=$(wget -q -T 60 -O - --header "Authorization: Bearer $CRON_SECRET" "$APP_INTERNO$1" 2>&1); then
        echo "$(date "+%Y-%m-%d %H:%M:%S") OK   $1 $resposta"
    else
        echo "$(date "+%Y-%m-%d %H:%M:%S") ERRO $1 $resposta"
    fi
}

ultimo_dia=""

while true; do
    chamar /api/processar-notificacoes
    chamar /api/agendar-relatorios

    hoje=$(date +%F)
    if [ "$hoje" != "$ultimo_dia" ]; then
        chamar /api/tarefas/inativar-vencidos
        ultimo_dia=$hoje
    fi

    sleep 300
done
