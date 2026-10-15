import { obterPool } from "./banco";

// Aviso no celular do paciente quando o nutricionista publica uma dieta ou
// uma devolutiva. Entra na fila de notificações, enviada pelo agendador.

export const TITULO_ATUALIZACAO = "Olá! Você tem atualização do seu nutricionista";

const MENSAGENS = {
  dieta: { corpo: "Sua nova dieta já está disponível no aplicativo.", destino: "/area-paciente/dietas" },
  devolutiva: { corpo: "A devolutiva do seu relatório já está disponível.", destino: "/area-paciente/relatorios" },
} as const;

export async function enfileirarAtualizacao(
  tipo: keyof typeof MENSAGENS,
  pacienteId: string,
  referenciaId: string
) {
  const { corpo, destino } = MENSAGENS[tipo];

  await obterPool().query(
    `insert into public.notification_queue
       (patient_id, notification_type, title, body, target_url, reference_id, dedup_key, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'pendente')
     on conflict (dedup_key) do nothing`,
    [pacienteId, tipo, TITULO_ATUALIZACAO, corpo, destino, referenciaId, `${tipo}:${referenciaId}`]
  );
}
