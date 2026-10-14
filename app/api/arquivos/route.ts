import { NextResponse } from "next/server";
import {
  BUCKETS,
  gravarArquivo,
  listarArquivos,
  podeEnviar,
  podeGerenciar,
  removerArquivo,
  resolverCaminho,
  tipoDoArquivo,
} from "@/lib/servidor/arquivos";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

async function identificar(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  const bucket = new URL(request.url).searchParams.get("bucket") ?? "";

  if (!BUCKETS[bucket]) {
    return recusar("Destino de arquivos inválido.", 400);
  }

  return { contexto, bucket };
}

// Envio de um arquivo: o corpo da requisição é o próprio arquivo.
export async function PUT(request: Request) {
  try {
    const identificacao = await identificar(request);

    if (identificacao instanceof NextResponse) {
      return identificacao;
    }

    const { contexto, bucket } = identificacao;
    const parametros = new URL(request.url).searchParams;
    const caminho = parametros.get("caminho") ?? "";
    const destino = resolverCaminho(bucket, caminho);

    if (!destino) {
      return recusar("Caminho de arquivo inválido.", 400);
    }

    if (!podeEnviar(contexto, bucket, caminho)) {
      return recusar("Envio não permitido.", 403);
    }

    const tipoInformado = (request.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (
      !BUCKETS[bucket].tipos[tipoInformado] ||
      tipoDoArquivo(bucket, caminho) !== tipoInformado
    ) {
      return recusar("Tipo de arquivo não permitido.", 415);
    }

    const limite = BUCKETS[bucket].tamanhoMaximo;

    if (Number(request.headers.get("content-length") ?? 0) > limite) {
      return recusar("O arquivo excede o tamanho permitido.", 413);
    }

    const conteudo = Buffer.from(await request.arrayBuffer());

    if (conteudo.length === 0 || conteudo.length > limite) {
      return recusar(
        "O arquivo está vazio ou excede o tamanho permitido.",
        413
      );
    }

    try {
      await gravarArquivo(
        destino,
        conteudo,
        parametros.get("substituir") === "sim" &&
          contexto.papel === "nutricionista"
      );
    } catch (erro) {
      if (
        erro &&
        typeof erro === "object" &&
        "code" in erro &&
        erro.code === "EEXIST"
      ) {
        return recusar("Já existe um arquivo neste caminho.", 409);
      }

      throw erro;
    }

    return NextResponse.json({ path: caminho });
  } catch (erro) {
    console.error("Erro ao enviar arquivo:", erro);

    return recusar("Não foi possível enviar o arquivo.", 500);
  }
}

// Lista os arquivos de uma pasta.
export async function GET(request: Request) {
  try {
    const identificacao = await identificar(request);

    if (identificacao instanceof NextResponse) {
      return identificacao;
    }

    const { contexto, bucket } = identificacao;
    const pasta = new URL(request.url).searchParams.get("pasta") ?? "";
    const destino = resolverCaminho(bucket, pasta);

    if (!destino) {
      return recusar("Pasta inválida.", 400);
    }

    if (!podeGerenciar(contexto, bucket)) {
      return recusar("Consulta não permitida.", 403);
    }

    return NextResponse.json(
      { arquivos: await listarArquivos(destino) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (erro) {
    console.error("Erro ao listar arquivos:", erro);

    return recusar("Não foi possível consultar os arquivos.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const identificacao = await identificar(request);

    if (identificacao instanceof NextResponse) {
      return identificacao;
    }

    const { contexto, bucket } = identificacao;

    if (!podeGerenciar(contexto, bucket)) {
      return recusar("Remoção não permitida.", 403);
    }

    const dados = await request.json().catch(() => null);
    const caminhos: unknown = dados?.caminhos;

    if (
      !Array.isArray(caminhos) ||
      caminhos.length === 0 ||
      caminhos.length > 100 ||
      caminhos.some((caminho) => typeof caminho !== "string")
    ) {
      return recusar("Lista de arquivos inválida.", 400);
    }

    const destinos = caminhos.map((caminho) =>
      resolverCaminho(bucket, caminho)
    );

    if (destinos.some((destino) => !destino)) {
      return recusar("Caminho de arquivo inválido.", 400);
    }

    await Promise.all(destinos.map((destino) => removerArquivo(destino!)));

    return NextResponse.json({ removidos: caminhos.length });
  } catch (erro) {
    console.error("Erro ao remover arquivos:", erro);

    return recusar("Não foi possível remover os arquivos.", 500);
  }
}
