import AnelDeAdesao from "@/components/AnelDeAdesao";

// Moldura das telas públicas (entrar, redefinir senha, cadastro):
// faixa da marca em cima no celular, painel lateral no computador.
export default function PainelDeEntrada({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      <aside className="relative overflow-hidden bg-primary-900 px-6 pb-8 pt-[calc(1.75rem+env(safe-area-inset-top))] text-white lg:flex lg:w-[26rem] lg:shrink-0 lg:flex-col lg:justify-between lg:p-12">
        <div>
          <p className="font-[family-name:var(--fonte-titulo)] text-2xl font-bold tracking-tight lg:text-3xl">
            Douglas Campos
          </p>
          <p className="mt-1 text-sm text-white/65">Acompanhamento nutricional</p>
        </div>

        <div className="mt-6 hidden lg:block">
          <AnelDeAdesao valor={86} tamanho={168} claro />
          <p className="mt-8 max-w-xs text-lg leading-snug text-white/85">
            Seu plano alimentar, seus relatórios da semana e a devolutiva do
            nutricionista em um só lugar.
          </p>
        </div>

        <div className="absolute -right-10 -top-10 opacity-40 lg:hidden" aria-hidden>
          <AnelDeAdesao valor={86} tamanho={132} claro rotulo="" />
        </div>
      </aside>

      <main className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
