"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "primereact/sidebar";
import { api } from "@/lib/api";

type Item = {
  rotulo: string;
  icone: string;
  destino: string;
  // Rotas que também marcam este item como atual.
  prefixos?: string[];
};

function atual(caminho: string, item: Item) {
  if (item.destino === "/" || item.destino === "/area-paciente") {
    return (
      caminho === item.destino ||
      (item.prefixos ?? []).some((prefixo) => caminho.startsWith(prefixo))
    );
  }

  return caminho.startsWith(item.destino);
}

function Marca() {
  return (
    <div className="leading-tight">
      <p className="font-[family-name:var(--fonte-titulo)] text-lg font-bold tracking-tight">
        Douglas Campos
      </p>
      <p className="text-xs text-white/60">Acompanhamento nutricional</p>
    </div>
  );
}

function useSair() {
  const router = useRouter();

  return async () => {
    await api.auth.signOut();
    router.push("/login");
  };
}

// ------------------------------------------------------------------------
// Nutricionista
// ------------------------------------------------------------------------

const INICIO: Item = { rotulo: "Início", icone: "pi-home", destino: "/" };
const PACIENTES: Item = { rotulo: "Pacientes", icone: "pi-users", destino: "/pacientes" };
const RELATORIOS: Item = { rotulo: "Relatórios", icone: "pi-chart-bar", destino: "/relatorios" };
const DIETAS: Item = { rotulo: "Dietas", icone: "pi-book", destino: "/dietas" };
const ALERTAS: Item = { rotulo: "Alertas", icone: "pi-bell", destino: "/alertas" };
const PAGAMENTOS: Item = { rotulo: "Pagamentos", icone: "pi-wallet", destino: "/pagamentos" };
const EXAMES: Item = { rotulo: "Exames de sangue", icone: "pi-heart", destino: "/exames" };
const PARCEIROS: Item = { rotulo: "Parceiros", icone: "pi-briefcase", destino: "/parceiros" };
const NUTRICAO: Item = { rotulo: "Módulo de Nutrição", icone: "pi-th-large", destino: "/nutricao" };

// Menu lateral (computador): todos os itens.
const MENU_LATERAL = [INICIO, PACIENTES, NUTRICAO, RELATORIOS, DIETAS, ALERTAS, PAGAMENTOS, EXAMES, PARCEIROS];

// Barra inferior (celular): quatro abas e "Mais" com o restante.
const ABAS_CELULAR = [INICIO, PACIENTES, RELATORIOS, DIETAS];
const MENU_MAIS = [NUTRICAO, PAGAMENTOS, EXAMES, PARCEIROS, ALERTAS];

export function NavegacaoNutri() {
  const caminho = usePathname();
  const sair = useSair();
  const [maisAberto, setMaisAberto] = useState(false);
  const algumDoMaisAtual = MENU_MAIS.some((item) => atual(caminho, item));

  return (
    <>
      <header className="barra-superior">
        <Marca />

        <div className="flex items-center gap-1">
          <Link
            href={ALERTAS.destino}
            aria-label="Alertas"
            aria-current={atual(caminho, ALERTAS) ? "page" : undefined}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 aria-[current=page]:bg-white aria-[current=page]:text-primary-800"
          >
            <i className="pi pi-bell text-lg" aria-hidden />
          </Link>

          <button
            type="button"
            onClick={sair}
            aria-label="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <i className="pi pi-sign-out text-lg" aria-hidden />
          </button>
        </div>
      </header>

      <aside className="menu-lateral">
        <div className="mb-8 px-2">
          <Marca />
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {MENU_LATERAL.map((item) => (
            <Link
              key={item.destino}
              href={item.destino}
              aria-current={atual(caminho, item) ? "page" : undefined}
              className="menu-lateral__item"
            >
              <i className={`pi ${item.icone}`} aria-hidden />
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <Link href="/trocar-senha" className="menu-lateral__item">
          <i className="pi pi-key" aria-hidden />
          Alterar senha
        </Link>

        <button type="button" onClick={sair} className="menu-lateral__item">
          <i className="pi pi-sign-out" aria-hidden />
          Sair
        </button>
      </aside>

      <nav className="barra-inferior" aria-label="Principal">
        {ABAS_CELULAR.map((item) => (
          <Link
            key={item.destino}
            href={item.destino}
            aria-current={atual(caminho, item) ? "page" : undefined}
            className="barra-inferior__item"
          >
            <i className={`pi ${item.icone}`} aria-hidden />
            {item.rotulo}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setMaisAberto(true)}
          aria-current={algumDoMaisAtual ? "page" : undefined}
          aria-haspopup="dialog"
          className="barra-inferior__item"
        >
          <i className="pi pi-bars" aria-hidden />
          Mais
        </button>
      </nav>

      <Sidebar
        visible={maisAberto}
        position="bottom"
        onHide={() => setMaisAberto(false)}
        header={<span className="font-[family-name:var(--fonte-titulo)] text-lg font-bold">Mais opções</span>}
        className="h-auto rounded-t-2xl"
      >
        <nav className="flex flex-col gap-1 pb-[env(safe-area-inset-bottom)]" aria-label="Mais opções">
          {MENU_MAIS.map((item) => (
            <Link
              key={item.destino}
              href={item.destino}
              onClick={() => setMaisAberto(false)}
              aria-current={atual(caminho, item) ? "page" : undefined}
              className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-gray-800 hover:bg-gray-100 aria-[current=page]:bg-primary-50 aria-[current=page]:text-primary-800"
            >
              <i className={`pi ${item.icone} text-lg text-primary-700`} aria-hidden />
              {item.rotulo}
            </Link>
          ))}

          <Link
            href="/trocar-senha"
            onClick={() => setMaisAberto(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-gray-800 hover:bg-gray-100"
          >
            <i className="pi pi-key text-lg text-primary-700" aria-hidden />
            Alterar senha
          </Link>
        </nav>
      </Sidebar>
    </>
  );
}

// ------------------------------------------------------------------------
// Paciente
// ------------------------------------------------------------------------

const ITENS_PACIENTE: Item[] = [
  {
    rotulo: "Início",
    icone: "pi-home",
    destino: "/area-paciente",
    prefixos: ["/area-paciente/acompanhamento", "/area-paciente/parceiros", "/area-paciente/treino", "/area-paciente/avaliacoes"],
  },
  { rotulo: "Fotos", icone: "pi-camera", destino: "/area-paciente/fotos" },
  { rotulo: "Dieta", icone: "pi-book", destino: "/area-paciente/dietas" },
  { rotulo: "Relatórios", icone: "pi-chart-bar", destino: "/area-paciente/relatorios" },
  { rotulo: "Pagamentos", icone: "pi-credit-card", destino: "/area-paciente/pagamentos" },
];

export function NavegacaoPaciente() {
  const caminho = usePathname();

  return (
    <nav className="barra-inferior" aria-label="Principal">
      {ITENS_PACIENTE.map((item) => (
        <Link
          key={item.destino}
          href={item.destino}
          aria-current={atual(caminho, item) ? "page" : undefined}
          className="barra-inferior__item"
        >
          <i className={`pi ${item.icone}`} aria-hidden />
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}
