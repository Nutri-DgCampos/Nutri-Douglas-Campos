#!/bin/sh
# Agendador: substitui o cron da Vercel e o pg_cron do Supabase.
# A cada minuto esvazia a fila de notificacoes (os avisos de dieta e
# devolutiva ja saem na hora; aqui ficam lembretes e reenvios); a cada 5
# minutos agenda os lembretes de relatorio; uma vez por dia, inativa os
# pacientes com acesso vencido.

chamar() {
    if resposta=$(wget -q -T 60 -O - --header "Authorization: Bearer $CRON_SECRET" "$APP_INTERNO$1" 2>&1); then
        echo "$(date "+%Y-%m-%d %H:%M:%S") OK   $1 $resposta"
    else
        echo "$(date "+%Y-%m-%d %H:%M:%S") ERRO $1 $resposta"
    fi
}

ultimo_dia=""
volta=0

while true; do
    chamar /api/processar-notificacoes

    if [ $((volta % 5)) -eq 0 ]; then
        chamar /api/agendar-relatorios
    fi
    volta=$((volta + 1))

    hoje=$(date +%F)
    if [ "$hoje" != "$ultimo_dia" ]; then
        chamar /api/tarefas/inativar-vencidos
        ultimo_dia=$hoje
    fi

    sleep 60
done
