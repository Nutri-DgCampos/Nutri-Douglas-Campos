import { BIBLIOTECAS } from "@/lib/servidor/bibliotecas";
import { rotasDoItem } from "@/lib/servidor/biblioteca";
import { recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ tipo: string; id: string }> };

function rotas(tipo: string) {
  const config = BIBLIOTECAS[tipo];
  return config ? rotasDoItem(config) : null;
}

const naoEncontrada = () => recusar("Biblioteca inválida.", 404);

export async function GET(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  return rotas(tipo)?.GET(request, { params: Promise.resolve({ id }) }) ?? naoEncontrada();
}

export async function PUT(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  return rotas(tipo)?.PUT(request, { params: Promise.resolve({ id }) }) ?? naoEncontrada();
}

export async function PATCH(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  return rotas(tipo)?.PATCH(request, { params: Promise.resolve({ id }) }) ?? naoEncontrada();
}

export async function DELETE(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  return rotas(tipo)?.DELETE(request, { params: Promise.resolve({ id }) }) ?? naoEncontrada();
}
