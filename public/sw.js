// Service worker do app: avisos (push) e, desde a etapa T5 do Treino, o
// "Meu treino" abrindo sem internet.
//
// - Arquivos do app (/_next/static) e ícones, e a página do "Meu treino":
//   sempre buscam na rede (nunca servem versão velha com internet) e guardam
//   a cópia; sem rede, abrem a última cópia. Os dados vêm da cópia guardada pela própria tela (IndexedDB).
// - Nada da API passa por aqui. Ao sair da conta, o app apaga as páginas
//   guardadas ("paginas-*").

const VERSAO = "t5-1";
const CACHE_ESTATICO = `estatico-${VERSAO}`;
const CACHE_PAGINAS = `paginas-${VERSAO}`;
const PAGINAS_SEM_INTERNET = ["/area-paciente/treino"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_ESTATICO && n !== CACHE_PAGINAS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-")) {
    event.respondWith(
      fetch(pedido)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_ESTATICO).then((cache) => cache.put(pedido, copia));
          }
          return resposta;
        })
        .catch(async () => (await caches.match(pedido, { cacheName: CACHE_ESTATICO })) ?? Response.error())
    );
    return;
  }

  if (pedido.mode === "navigate" && PAGINAS_SEM_INTERNET.includes(url.pathname)) {
    event.respondWith(
      fetch(pedido)
        .then((resposta) => {
          // Só guarda a página de quem está conectado (não um redirecionamento).
          if (resposta.ok && !resposta.redirected) {
            const copia = resposta.clone();
            caches.open(CACHE_PAGINAS).then((cache) => cache.put(url.pathname, copia));
          }
          return resposta;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: CACHE_PAGINAS })) ?? Response.error())
    );
  }
});

self.addEventListener("push", (event) => {
  const dados = event.data ? event.data.json() : {};

  const titulo = dados.title || "Acompanhamento Nutricional";

  const opcoes = {
    body: dados.body || "Você tem um novo aviso.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: dados.url || "/area-paciente",
    },
  };

  event.waitUntil(
    self.registration.showNotification(titulo, opcoes)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/area-paciente";

  event.waitUntil(
    clients.openWindow(url)
  );
});
