"use client";

// Uso sem internet no "Meu treino" (T5, resposta R5).
//
// - Dados: a última resposta de cada tela (treino, corridas e pedais) fica
//   guardada no aparelho; sem internet, a tela mostra essa cópia e avisa.
// - Fila: registro de treino, corrida/pedal e relato de desconforto feitos
//   sem internet ficam na fila e são enviados sozinhos quando a conexão
//   volta (ao voltar o sinal, ao abrir o app e a cada 30 s com pendências).
//   Cada envio é idempotente no servidor (mesma chave ou mesmo dia/semana),
//   então reenviar nunca duplica. A ordem de gravação é mantida.
// - Recusa do servidor (ex.: semana já fechada): o item sai da fila e fica
//   numa lista de não enviados, para o aluno ver; nada some em silêncio.
// - Nada disso substitui o servidor: relatórios, devolutivas e cadastros
//   continuam precisando de internet.

const BANCO = "treino-offline";
const VERSAO = 1;

export type TipoNaFila = "registro_musculacao" | "atividade" | "desconforto";

export type ItemDaFila = {
  id: string;
  tipo: TipoNaFila;
  url: string;
  metodo: "PUT" | "POST";
  corpo: unknown;
  descricao: string;
  criado_em: string;
};

export type ItemRecusado = ItemDaFila & { erro: string; recusado_em: string };

type Estado = { pendentes: ItemDaFila[]; recusados: ItemRecusado[]; enviando: boolean; ultimoEnvio: string | null };

let estado: Estado = { pendentes: [], recusados: [], enviando: false, ultimoEnvio: null };
const ouvintes = new Set<(e: Estado) => void>();
let iniciado = false;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains("dados")) db.createObjectStore("dados");
      if (!db.objectStoreNames.contains("fila")) db.createObjectStore("fila", { keyPath: "id" });
      if (!db.objectStoreNames.contains("recusados")) db.createObjectStore("recusados", { keyPath: "id" });
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function operar<T>(loja: string, modo: IDBTransactionMode, acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolver, rejeitar) => {
      const pedido = acao(db.transaction(loja, modo).objectStore(loja));
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Cópia dos dados da tela

export async function guardarDados(chave: string, valor: unknown) {
  try {
    await operar("dados", "readwrite", (s) => s.put({ valor, salvo_em: new Date().toISOString() }, chave));
  } catch {
    // Sem armazenamento (modo privado): a tela funciona só com internet.
  }
}

export async function lerDados<T>(chave: string): Promise<{ valor: T; salvo_em: string } | null> {
  try {
    return ((await operar("dados", "readonly", (s) => s.get(chave))) as { valor: T; salvo_em: string } | undefined) ?? null;
  } catch {
    return null;
  }
}

// Busca na rede; sem conexão, devolve a cópia guardada (e de quando é).
export async function buscarComCopia<T>(url: string, chave: string): Promise<{ dados: T; copiaDe: string | null } | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const dados = (await r.json()) as T;
      void guardarDados(chave, dados);
      return { dados, copiaDe: null };
    }
    if (r.status === 401 || r.status === 403) return null;
  } catch {
    // Sem conexão: segue para a cópia.
  }
  const copia = await lerDados<T>(chave);
  return copia ? { dados: copia.valor, copiaDe: copia.salvo_em } : null;
}

// ---------------------------------------------------------------------------
// Fila

function avisar() {
  for (const ouvinte of ouvintes) ouvinte(estado);
}

async function recarregarEstado() {
  try {
    const [pendentes, recusados] = await Promise.all([
      operar<ItemDaFila[]>("fila", "readonly", (s) => s.getAll() as IDBRequest<ItemDaFila[]>),
      operar<ItemRecusado[]>("recusados", "readonly", (s) => s.getAll() as IDBRequest<ItemRecusado[]>),
    ]);
    estado = { ...estado, pendentes: pendentes.sort((a, b) => a.criado_em.localeCompare(b.criado_em)), recusados };
  } catch {
    estado = { ...estado, pendentes: [], recusados: [] };
  }
  avisar();
}

export function acompanharFila(ouvinte: (e: Estado) => void) {
  ouvintes.add(ouvinte);
  ouvinte(estado);
  iniciar();
  return () => void ouvintes.delete(ouvinte);
}

// O envio falhou por falta de conexão (não por recusa do servidor)?
export function semConexao(erro: unknown) {
  return erro instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}

export async function enfileirar(item: Omit<ItemDaFila, "id" | "criado_em">) {
  const completo: ItemDaFila = { ...item, id: crypto.randomUUID(), criado_em: new Date().toISOString() };
  // Mesmo registro de treino (mesmo dia e semana) ainda na fila: vale o mais novo.
  const iguais = estado.pendentes.filter((p) => p.tipo === item.tipo && p.url === item.url && chaveDoItem(p) === chaveDoItem(completo));
  for (const p of iguais) await operar("fila", "readwrite", (s) => s.delete(p.id));
  await operar("fila", "readwrite", (s) => s.put(completo));
  await recarregarEstado();
  return completo;
}

function chaveDoItem(item: Pick<ItemDaFila, "tipo" | "corpo">) {
  const c = (item.corpo ?? {}) as Record<string, unknown>;
  if (item.tipo === "registro_musculacao") return `${c.prescricaoId}:${c.dia}:${c.dataPlanejada}`;
  if (item.tipo === "atividade") return String(c.chave_cliente);
  return String(c.chaveCliente);
}

const ouvintesDeEnvio = new Set<() => void>();
// A tela recarrega os dados quando a fila termina de enviar.
export function aoEnviar(f: () => void) {
  ouvintesDeEnvio.add(f);
  return () => void ouvintesDeEnvio.delete(f);
}

export async function sincronizar() {
  if (estado.enviando) return;
  await recarregarEstado();
  if (!estado.pendentes.length) return;
  estado = { ...estado, enviando: true };
  avisar();
  let enviou = false;
  try {
    for (const item of estado.pendentes) {
      let resposta: Response;
      try {
        resposta = await fetch(item.url, { method: item.metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.corpo) });
      } catch {
        break; // Ainda sem conexão: tenta depois, na mesma ordem.
      }
      if (resposta.status >= 500 || resposta.status === 401 || resposta.status === 403 || resposta.status === 429) break;
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        await operar("recusados", "readwrite", (s) => s.put({ ...item, erro: corpo?.erro ?? "O servidor recusou o registro.", recusado_em: new Date().toISOString() }));
      }
      await operar("fila", "readwrite", (s) => s.delete(item.id));
      enviou = true;
    }
  } finally {
    estado = { ...estado, enviando: false, ultimoEnvio: enviou ? new Date().toISOString() : estado.ultimoEnvio };
    await recarregarEstado();
  }
  if (enviou) for (const f of ouvintesDeEnvio) f();
}

export async function descartarRecusado(id: string) {
  await operar("recusados", "readwrite", (s) => s.delete(id));
  await recarregarEstado();
}

// Ao sair da conta: apaga as cópias e a fila deste aparelho.
export async function limparDoAparelho() {
  try {
    for (const loja of ["dados", "fila", "recusados"]) await operar(loja, "readwrite", (s) => s.clear());
  } catch {
    // Nada guardado.
  }
  await recarregarEstado();
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  window.addEventListener("online", () => void sincronizar());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void sincronizar());
  setInterval(() => {
    if (estado.pendentes.length) void sincronizar();
  }, 30_000);
  void sincronizar();
}

// Envia já; sem conexão, guarda na fila. Devolve a resposta do servidor,
// "na_fila" ou o erro do servidor (que não entra na fila).
export async function enviarOuGuardar<T>(
  item: Omit<ItemDaFila, "id" | "criado_em">
): Promise<{ ok: true; dados: T } | { ok: "na_fila" } | { ok: false; erro: string }> {
  iniciar();
  try {
    const r = await fetch(item.url, { method: item.metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.corpo) });
    const dados = await r.json().catch(() => null);
    if (r.ok) {
      void sincronizar();
      return { ok: true, dados: dados as T };
    }
    if (r.status >= 500) {
      await enfileirar(item);
      return { ok: "na_fila" };
    }
    return { ok: false, erro: dados?.erro ?? "Não foi possível salvar." };
  } catch {
    // fetch só falha assim sem conexão (ou com a conexão caindo no meio).
    await enfileirar(item);
    return { ok: "na_fila" };
  }
}

// Registros ainda não enviados neste aparelho (para avisar antes de sair).
export async function registrosNaoEnviados() {
  try {
    return (await operar<ItemDaFila[]>("fila", "readonly", (s) => s.getAll() as IDBRequest<ItemDaFila[]>)).length;
  } catch {
    return 0;
  }
}

// Ao sair da conta: apaga a fila, as cópias e as páginas guardadas pelo
// service worker. Nada do aluno fica no aparelho.
export async function apagarDoAparelho() {
  try {
    indexedDB.deleteDatabase(BANCO);
  } catch {
    // Nada guardado.
  }
  try {
    if ("caches" in window) for (const nome of await caches.keys()) if (nome.startsWith("paginas-")) await caches.delete(nome);
  } catch {
    // Nada guardado.
  }
}