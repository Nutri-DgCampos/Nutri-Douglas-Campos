import { after } from "next/server";
import { obterPool } from "./banco";
import { processarFila } from "./filaDeNotificacoes";

// Aviso no celular do paciente quando o nutricionista publica uma dieta ou
// uma devolutiva. Entra na fila de notificações, enviada pelo agendador.

export const TITULO_ATUALIZACAO = "Olá! Você tem atualização do seu nutricionista";

const MENSAGENS = {
  dieta: { corpo: "Sua nova dieta já está disponível no aplicativo.", destino: "/area-paciente/dietas" },
  devolutiva: { corpo: "A devolutiva do seu relatório já está disponível.", destino: "/area-paciente/relatorios" },
  avaliacao: { corpo: "O resultado da sua avaliação física já está disponível.", destino: "/area-paciente/avaliacoes" },
  formulario: { corpo: "Seu nutricionista enviou um formulário para você preencher.", destino: "/area-paciente/formularios" },
} as const;

export async function enfileirarAtualizacao(
  tipo: keyof typeof MENSAGENS,
  pacienteId: string,
  referenciaId: string,
  // Chave para não repetir o aviso; por padrão, um aviso por referência.
  chave: string = referenciaId
) {
  const { corpo, destino } = MENSAGENS[tipo];

  await obterPool().query(
    `insert into public.notification_queue
       (patient_id, notification_type, title, body, target_url, reference_id, dedup_key, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'pendente')
     on conflict (dedup_key) do nothing`,
    [pacienteId, tipo, TITULO_ATUALIZACAO, corpo, destino, referenciaId, `${tipo}:${chave}`]
  );

  // Envia já, depois da resposta, sem esperar a próxima passada do agendador
  // (que continua como reserva se algo falhar aqui).
  after(() =>
    processarFila(20).catch((erro) => console.error("Erro no envio imediato de notificações:", erro))
  );
}
