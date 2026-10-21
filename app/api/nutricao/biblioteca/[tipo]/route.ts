import { BIBLIOTECAS } from "@/lib/servidor/bibliotecas";
import { rotasDaLista } from "@/lib/servidor/biblioteca";
import { recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ tipo: string }> };

// Lista e criação nas bibliotecas de Configurações.
export async function GET(request: Request, { params }: Parametros) {
  const config = BIBLIOTECAS[(await params).tipo];
  return config ? rotasDaLista(config).GET(request) : recusar("Biblioteca inválida.", 404);
}

export async function POST(request: Request, { params }: Parametros) {
  const config = BIBLIOTECAS[(await params).tipo];
  return config ? rotasDaLista(config).POST(request) : recusar("Biblioteca inválida.", 404);
}
