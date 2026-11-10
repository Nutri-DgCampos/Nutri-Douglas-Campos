import { after } from "next/server";
import webpush from "web-push";
import { obterPool } from "./banco";
import { configurarWebPush } from "./filaDeNotificacoes";

// Push para os profissionais: alerta de desconforto do Treino e avisos ao
// nutricionista (anamnese, relatório, exames e renovação, criados por gatilho
// no banco; ver migração 023).
//
// Mesmo provedor e mesmas chaves VAPID do push do paciente, com inscrições e
// fila próprias: um aviso de profissional nunca vai para o celular de um
// paciente. O alerta já está gravado no painel antes de entrar aqui; o push
// é um aviso a mais (sem aparelho inscrito, fica "sem_dispositivo").

const MAXIMO_DE_TENTATIVAS = 3;

export type AvisoProfissional = {
  tipo: "desconforto" | "renovacao_treino" | "pagamento_treino" | "vinculo";
  pacienteId: string;
  titulo: string;
  corpo: string;
  destino: string;
  referenciaId: string;
};

export async function enfileirarParaProfissionais(usuarios: string[], aviso: AvisoProfissional) {
  for (const usuarioId of new Set(usuarios)) {
    await obterPool().query(
      `insert into public.notificacoes_profissionais
         (usuario_id, patient_id, tipo, titulo, corpo, destino, referencia_id, dedup_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (dedup_key) do nothing`,
      [usuarioId, aviso.pacienteId, aviso.tipo, aviso.titulo, aviso.corpo, aviso.destino, aviso.referenciaId, `${aviso.tipo}:${aviso.referenciaId}:${usuarioId}`]
    );
  }

  // Envia já, depois da resposta; o agendador repete o que ficar pendente.
  after(() => processarFilaProfissional().catch((erro) => console.error("Erro no push ao profissional:", erro)));
}

type Reservada = { id: string; usuario_id: string; titulo: string; corpo: string; destino: string; tentativas: number };

async function reservar() {
  const r = await obterPool().query<Reservada>(
    `update public.notificacoes_profissionais n
        set status = 'processando', processando_desde = now(), tentativas = n.tentativas + 1
      where n.id = (
        select id from public.notificacoes_profissionais
         -- Nova tentativa só depois de alguns minutos (a cada passada do agendador).
         where (status = 'pendente' and liberar_em <= now()
                and (tentativas = 0 or criada_em < now() - interval '2 minutes' * tentativas))
            or (status = 'processando' and processando_desde < now() - interval '5 minutes')
         order by criada_em
         for update skip locked
         limit 1)
      returning n.id, n.usuario_id, n.titulo, n.corpo, n.destino, n.tentativas`
  );
  return r.rows[0] ?? null;
}

async function finalizar(id: string, status: "enviada" | "falhou" | "sem_dispositivo" | "pendente", erro: string | null) {
  await obterPool().query(
    `update public.notificacoes_profissionais
        set status = $2, ultimo_erro = $3, processando_desde = null,
            enviada_em = case when $2 = 'enviada' then now() else enviada_em end
      where id = $1`,
    [id, status, erro]
  );
}

async function enviar(aviso: Reservada) {
  const dispositivos = await obterPool().query<{ id: string; endpoint: string; p256dh: string; auth_key: string }>(
    "select id, endpoint, p256dh, auth_key from public.push_profissionais where usuario_id = $1 and ativo",
    [aviso.usuario_id]
  );
  if (!dispositivos.rows.length) return finalizar(aviso.id, "sem_dispositivo", null);

  configurarWebPush();
  const mensagem = JSON.stringify({ title: aviso.titulo, body: aviso.corpo, url: aviso.destino });
  let enviados = 0;
  const erros: string[] = [];

  for (const dispositivo of dispositivos.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: dispositivo.endpoint, keys: { p256dh: dispositivo.p256dh, auth: dispositivo.auth_key } },
        mensagem
      );
      enviados++;
    } catch (erro) {
      const codigo = typeof erro === "object" && erro && "statusCode" in erro ? erro.statusCode : undefined;
      if (codigo === 404 || codigo === 410) {
        await obterPool().query("delete from public.push_profissionais where id = $1", [dispositivo.id]).catch(() => undefined);
      }
      erros.push(erro instanceof Error ? erro.message : "Falha no envio.");
    }
  }

  if (enviados > 0) return finalizar(aviso.id, "enviada", null);
  return finalizar(aviso.id, aviso.tentativas >= MAXIMO_DE_TENTATIVAS ? "falhou" : "pendente", erros.join(" | ").slice(0, 1000));
}

export async function processarFilaProfissional(limite = 20) {
  let processadas = 0;
  for (; processadas < limite; processadas++) {
    const aviso = await reservar();
    if (!aviso) break;
    try {
      await enviar(aviso);
    } catch (erro) {
      await finalizar(aviso.id, aviso.tentativas >= MAXIMO_DE_TENTATIVAS ? "falhou" : "pendente", erro instanceof Error ? erro.message : "Erro.");
    }
  }
  return processadas;
}
