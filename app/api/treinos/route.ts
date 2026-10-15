import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolverCaminho } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { analisarTreino } from "@/lib/servidor/treinos";

export const runtime = "nodejs";

// Registra o treino enviado pelo paciente (arquivo já gravado na pasta dele,
// ou texto colado) e dispara a leitura pela IA.
export async function POST(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  const pacienteId = contexto.pacienteId;

  if (!pacienteId) {
    return recusar("Somente pacientes enviam treinos.", 403);
  }

  const dados = await request.json().catch(() => null);
  const texto = typeof dados?.texto === "string" ? dados.texto.trim() : "";
  const caminho = typeof dados?.caminho === "string" ? dados.caminho : "";
  const nome = typeof dados?.nome === "string" ? dados.nome.trim().slice(0, 200) : "";

  if (texto) {
    if (texto.length > 30_000) {
      return recusar("O texto do treino é muito longo.", 413);
    }
  } else {
    const destino = resolverCaminho("treinos", caminho);

    if (!destino || !caminho.startsWith(`${pacienteId}/`) || !nome) {
      return recusar("Treino inválido.", 400);
    }

    try {
      await fs.access(destino);
    } catch {
      return recusar("O arquivo do treino não foi encontrado.", 400);
    }
  }

  const resultado = await obterPool().query<{ id: string }>(
    `insert into public.treinos (patient_id, file_name, storage_path, texto_enviado)
     values ($1, $2, $3, $4)
     returning id`,
    [pacienteId, texto ? null : nome, texto ? null : caminho, texto || null]
  );

  const id = resultado.rows[0].id;

  // A leitura leva alguns segundos; a tela acompanha o andamento.
  void analisarTreino(id);

  return NextResponse.json({ sucesso: true, id }, { status: 201 });
}
