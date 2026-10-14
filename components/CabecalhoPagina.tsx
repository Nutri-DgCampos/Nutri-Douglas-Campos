// Título de página com descrição e, opcionalmente, uma ação à direita.
export default function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold text-gray-900">{titulo}</h1>
        {descricao && <p className="mt-1 text-gray-600">{descricao}</p>}
      </div>

      {acao}
    </header>
  );
}
