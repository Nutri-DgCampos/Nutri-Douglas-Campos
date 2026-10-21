import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolverCaminho } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { analisarExame } from "@/lib/servidor/exames";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

async function pacienteConectado(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  if (!contexto.pacienteId) {
    return recusar("Somente pacientes enviam exames.", 403);
  }

  return contexto.pacienteId;
}

// Exames enviados pelo próprio paciente (sem a análise, que é do nutricionista).
export async function GET(request: Request) {
  const pacienteId = await pacienteConectado(request);

  if (pacienteId instanceof NextResponse) {
    return pacienteId;
  }

  const resultado = await obterPool().query(
    `select id, file_name, uploaded_at
       from public.blood_exams
      where patient_id = $1
      order by uploaded_at desc`,
    [pacienteId]
  );

  return NextResponse.json(
    { exames: resultado.rows },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Registra um exame já enviado para a pasta do paciente e dispara a análise.
export async function POST(request: Request) {
  const pacienteId = await pacienteConectado(request);

  if (pacienteId instanceof NextResponse) {
    return pacienteId;
  }

  const dados = await request.json().catch(() => null);
  const caminho = typeof dados?.caminho === "string" ? dados.caminho : "";
  const nome =
    typeof dados?.nome === "string" ? dados.nome.trim().slice(0, 200) : "";

  const destino = resolverCaminho("exames", caminho);

  if (!destino || !caminho.startsWith(`${pacienteId}/`) || !nome) {
    return recusar("Exame inválido.", 400);
  }

  try {
    await fs.access(destino);
  } catch {
    return recusar("O arquivo do exame não foi encontrado.", 400);
  }

  const resultado = await obterPool().query<{ id: string }>(
    `insert into public.blood_exams (patient_id, file_name, storage_path, exam_name, exam_date)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      pacienteId,
      nome,
      caminho,
      typeof dados?.nomeExame === "string" && dados.nomeExame.trim() ? dados.nomeExame.trim().slice(0, 200) : null,
      typeof dados?.dataExame === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dados.dataExame) ? dados.dataExame : null,
    ]
  );

  const id = resultado.rows[0].id;

  // A análise leva alguns segundos; o paciente não precisa esperar por ela.
  void analisarExame(id);

  return NextResponse.json({ sucesso: true, id }, { status: 201 });
}
