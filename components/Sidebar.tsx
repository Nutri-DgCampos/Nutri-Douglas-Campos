"use client";

import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  async function sair() {
  await supabase.auth.signOut();
  router.push("/login");
}
  return (
    <aside className="flex min-h-screen w-64 flex-col bg-slate-950 p-6 text-white">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
          Nutri
        </p>

        <h2 className="mt-1 text-xl font-bold">
          Acompanhamento
        </h2>
      </div>

      <nav className="space-y-2">
        <MenuItem
  texto="Dashboard"
  ativo={pathname === "/"}
  onClick={() => router.push("/")}
/>
        <MenuItem
  texto="Pacientes"
  ativo={pathname.startsWith("/pacientes")}
  onClick={() => router.push("/pacientes")}
/>
        <MenuItem
  texto="Relatórios"
  ativo={pathname.startsWith("/relatorios")}
  onClick={() => router.push("/relatorios")}
/>
        <MenuItem
  texto="Dietas"
  ativo={pathname.startsWith("/dietas")}
  onClick={() => router.push("/dietas")}
/>
        <MenuItem
  texto="Alertas"
  ativo={pathname.startsWith("/alertas")}
  onClick={() => router.push("/alertas")}
/>
        
<MenuItem
  texto="Pagamentos"
  ativo={pathname.startsWith("/pagamentos")}
  onClick={() => router.push("/pagamentos")}
/>

      </nav>

      <div className="mt-auto border-t border-slate-800 pt-6">
        <MenuItem texto="Configurações" />
        <MenuItem texto="Sair" onClick={sair} />
      </div>
    </aside>
  );
}

function MenuItem({
  texto,
  ativo = false,
  onClick,
}: {
  texto: string;
  ativo?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
  onClick={onClick}
        className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
        ativo
          ? "bg-blue-600 font-semibold text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {texto}
    </button>
  );
}