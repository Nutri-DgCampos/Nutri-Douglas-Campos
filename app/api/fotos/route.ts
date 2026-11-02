import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { removerArquivo, resolverCaminho } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

const PERFIS = ["frente", "lado", "costas"];

async function pacienteConectado(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  if (!contexto.pacienteId) {
    return recusar("Somente pacientes enviam fotos.", 403);
  }

  return contexto.pacienteId;
}

async function apagarArquivo(caminho: string) {
  const destino = resolverCaminho("fotos", caminho);

  if (destino) {
    await removerArquivo(destino).catch((erro) =>
      console.error("Não foi possível remover o arquivo da foto:", erro)
    );
  }
}

// Registra a foto do dia para um perfil. Uma posição já enviada no dia não é
// substituída (resposta I5 do cliente, igual ao link de anamnese): o paciente
// exclui e envia de novo.
export async function POST(request: Request) {
  const pacienteId = await pacienteConectado(request);

  if (pacienteId instanceof NextResponse) {
    return pacienteId;
  }

  const dados = await request.json().catch(() => null);
  const perfil = typeof dados?.perfil === "string" ? dados.perfil : "";
  const caminho = typeof dados?.caminho === "string" ? dados.caminho : "";
  const destino = resolverCaminho("fotos", caminho);

  if (!PERFIS.includes(perfil) || !destino || !caminho.startsWith(`${pacienteId}/`)) {
    return recusar("Foto inválida.", 400);
  }

  try {
    await fs.access(destino);
  } catch {
    return recusar("O arquivo da foto não foi encontrado.", 400);
  }

  const resultado = await obterPool().query<{ id: string }>(
    `insert into public.fotos_evolucao (patient_id, perfil, data, storage_path)
     values ($1, $2, $3, $4)
     on conflict (patient_id, perfil, data) do nothing
     returning id`,
    [pacienteId, perfil, hojeNoBrasil(), caminho]
  );

  if (!resultado.rows[0]) {
    await apagarArquivo(caminho);
    return recusar("Você já enviou a foto desta posição hoje. Exclua a foto para enviar outra.", 409);
  }

  return NextResponse.json({ sucesso: true, id: resultado.rows[0].id }, { status: 201 });
}

// Remove uma foto do próprio paciente.
export async function DELETE(request: Request) {
  const pacienteId = await pacienteConectado(request);

  if (pacienteId instanceof NextResponse) {
    return pacienteId;
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return recusar("Foto inválida.", 400);
  }

  const resultado = await obterPool().query<{ storage_path: string }>(
    `delete from public.fotos_evolucao
      where id = $1 and patient_id = $2
      returning storage_path`,
    [id, pacienteId]
  );

  if (resultado.rowCount === 0) {
    return recusar("Foto não encontrada.", 404);
  }

  await apagarArquivo(resultado.rows[0].storage_path);

  return NextResponse.json({ sucesso: true });
}
