"use client";

import { useEffect } from "react";

const CHAVE = "ultimo-registro-acesso";
const INTERVALO = 30 * 60 * 1000;

function abertoPeloApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Avisa o servidor que o paciente abriu a área do paciente (e se foi pelo
// app instalado). No máximo uma vez a cada 30 minutos por aparelho; também
// quando o app volta para a frente depois de um tempo em segundo plano.
export default function RegistrarAcesso() {
  useEffect(() => {
    function registrar() {
      if (document.visibilityState !== "visible") return;
      let ultimo = 0;
      try {
        ultimo = Number(localStorage.getItem(CHAVE) ?? 0);
      } catch {
        // Sem armazenamento: registra a cada abertura.
      }
      if (Date.now() - ultimo < INTERVALO) return;

      fetch("/api/area-paciente/acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instalado: abertoPeloApp() }),
      })
        .then((resposta) => {
          if (!resposta.ok) return;
          try {
            localStorage.setItem(CHAVE, String(Date.now()));
          } catch {
            // Sem armazenamento: tudo bem.
          }
        })
        .catch(() => {
          // Sem conexão: tenta na próxima abertura.
        });
    }

    registrar();
    document.addEventListener("visibilitychange", registrar);
    return () => document.removeEventListener("visibilitychange", registrar);
  }, []);

  return null;
}
