"use client";

import { useEffect, useRef } from "react";
import { addLocale, PrimeReactProvider } from "primereact/api";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";
import { avisoExibido, registrarExibicao } from "@/lib/avisos";

addLocale("pt-BR", {
  accept: "Sim",
  reject: "Não",
  choose: "Escolher",
  upload: "Enviar",
  cancel: "Cancelar",
  clear: "Limpar",
  today: "Hoje",
  weekHeader: "Sem",
  firstDayOfWeek: 0,
  dateFormat: "dd/mm/yy",
  dayNames: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  dayNamesShort: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  dayNamesMin: ["D", "S", "T", "Q", "Q", "S", "S"],
  monthNames: [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ],
  monthNamesShort: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  emptyMessage: "Nenhum resultado encontrado",
  emptyFilterMessage: "Nenhum resultado encontrado",
});

const TITULOS = {
  success: "Tudo certo",
  info: "Aviso",
  warn: "Atenção",
  error: "Não deu certo",
};

// Configuração do PrimeReact e os componentes globais de aviso e confirmação.
export default function Provedores({ children }: { children: React.ReactNode }) {
  const toast = useRef<Toast>(null);

  useEffect(() => {
    registrarExibicao((aviso) => {
      toast.current?.show({
        severity: aviso.tipo,
        summary: TITULOS[aviso.tipo],
        detail: aviso.mensagem,
        life: aviso.tipo === "error" || aviso.tipo === "warn" ? 8000 : 5000,
      });
    });

    return () => registrarExibicao(null);
  }, []);

  return (
    <PrimeReactProvider
      value={{
        locale: "pt-BR",
        ripple: false,
      }}
    >
      {children}

      <Toast
        ref={toast}
        position="top-center"
        onHide={avisoExibido}
        pt={{ detail: { style: { whiteSpace: "pre-line" } } }}
      />
      <ConfirmDialog />
    </PrimeReactProvider>
  );
}
