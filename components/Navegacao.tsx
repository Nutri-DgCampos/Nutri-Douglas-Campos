"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

const ITENS_NUTRI: Item[] = [
  { rotulo: "Início", icone: "pi-home", destino: "/" },
  { rotulo: "Pacientes", icone: "pi-users", destino: "/pacientes" },
  { rotulo: "Relatórios", icone: "pi-chart-bar", destino: "/relatorios" },
  { rotulo: "Dietas", icone: "pi-book", destino: "/dietas" },
  { rotulo: "Pagamentos", icone: "pi-wallet", destino: "/pagamentos" },
];

const ALERTAS: Item = { rotulo: "Alertas", icone: "pi-bell", destino: "/alertas" };

export function NavegacaoNutri() {
  const caminho = usePathname();
  const sair = useSair();

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
          {[...ITENS_NUTRI.slice(0, 4), ALERTAS, ITENS_NUTRI[4]].map((item) => (
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

        <button type="button" onClick={sair} className="menu-lateral__item">
          <i className="pi pi-sign-out" aria-hidden />
          Sair
        </button>
      </aside>

      <nav className="barra-inferior" aria-label="Principal">
        {ITENS_NUTRI.map((item) => (
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
    prefixos: ["/area-paciente/acompanhamento"],
  },
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
