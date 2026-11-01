import { obterPool } from "./banco";

// Sino de avisos do profissional (histórico em notificacoes_profissionais).
// O estado de leitura é por conta, no servidor: vale em todos os aparelhos.
// Só abrir o conteúdo pelo aviso marca como lido (abrir o sino não marca).

export type Aviso = {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  quantidade: number;
  criada_em: string;
  lido_em: string | null;
};

export async function avisosDoUsuario(usuarioId: string, limite = 30) {
  const [lista, contagem] = await Promise.all([
    obterPool().query<Aviso>(
      `select id, tipo, titulo, corpo, quantidade, criada_em, lido_em
         from public.notificacoes_profissionais
        where usuario_id = $1
        order by criada_em desc
        limit $2`,
      [usuarioId, limite]
    ),
    obterPool().query<{ n: number }>(
      "select count(*)::int as n from public.notificacoes_profissionais where usuario_id = $1 and lido_em is null",
      [usuarioId]
    ),
  ]);
  return { avisos: lista.rows, naoLidos: contagem.rows[0].n };
}

// Marca o aviso como lido (só se for do próprio usuário) e devolve o destino.
export async function abrirAviso(usuarioId: string, id: string) {
  const r = await obterPool().query<{ destino: string }>(
    `update public.notificacoes_profissionais
        set lido_em = coalesce(lido_em, now())
      where id = $1 and usuario_id = $2
      returning destino`,
    [id, usuarioId]
  );
  const destino = r.rows[0]?.destino;
  // Só caminhos internos.
  return destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : null;
}

// Nome curto do aparelho a partir do navegador, para a lista em Configurações.
export function descricaoDoAparelho(agente: string | null) {
  const a = agente ?? "";
  const navegador = /Edg\//.test(a) ? "Edge" : /OPR\//.test(a) ? "Opera" : /Firefox\//.test(a) ? "Firefox" : /Chrome\//.test(a) ? "Chrome" : /Safari\//.test(a) ? "Safari" : "Navegador";
  const sistema = /Android/.test(a) ? "Android" : /iPhone|iPad/.test(a) ? "iPhone/iPad" : /Windows/.test(a) ? "Windows" : /Mac OS X/.test(a) ? "Mac" : /Linux/.test(a) ? "Linux" : "";
  return sistema ? `${navegador} no ${sistema}` : navegador;
}
