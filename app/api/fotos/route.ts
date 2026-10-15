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
      console.error("Não foi possível remover a foto antiga:", erro)
    );
  }
}

// Registra a foto do dia para um perfil. Uma nova foto no mesmo dia e perfil
// substitui a anterior.
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

  const resultado = await obterPool().query<{ id: string; anterior: string | null }>(
    `with anterior as (
       select storage_path from public.fotos_evolucao
        where patient_id = $1 and perfil = $2 and data = $3
     )
     insert into public.fotos_evolucao (patient_id, perfil, data, storage_path)
     values ($1, $2, $3, $4)
     on conflict (patient_id, perfil, data) do update set storage_path = excluded.storage_path, created_at = now()
     returning id, (select storage_path from anterior) as anterior`,
    [pacienteId, perfil, hojeNoBrasil(), caminho]
  );

  const { id, anterior } = resultado.rows[0];

  if (anterior && anterior !== caminho) {
    await apagarArquivo(anterior);
  }

  return NextResponse.json({ sucesso: true, id }, { status: 201 });
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
