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