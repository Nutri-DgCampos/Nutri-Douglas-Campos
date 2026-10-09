"use client";

import { useEffect } from "react";

export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          console.log("Service Worker registrado com sucesso!");
        })
        .catch((erro) => {
          console.error("Erro ao registrar Service Worker:", erro);
        });
    }
  }, []);

  return null;
}