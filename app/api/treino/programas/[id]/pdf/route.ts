import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { identidadeDoProfissional } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDoTreino } from "@/lib/servidor/pdf/treino";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { versaoParaPdf } from "@/lib/servidor/treinoPrescricoes";

export const runtime = "nodejs";

// PDF do treino (?versao=N; sem versão, o rascunho atual). ?detalhado=1
// acrescenta os detalhes do editor. Não envia nada ao aluno.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Treino não encontrado.", 404);
  const url = new URL(request.url);
  const versao = url.searchParams.get("versao");
  if (versao !== null && !/^\d{1,4}$/.test(versao)) return recusar("Versão inválida.", 400);

  const registro = await versaoParaPdf(profissional, id, versao === null ? null : Number(versao));
  if (!registro) return recusar("Treino não encontrado.", 404);
  const aluno = await obterPool().query<{ nome: string; nascimento: string | null }>(
    "select name as nome, birth_date::text as nascimento from public.patients where id = $1",
    [registro.patient_id]
  );
  const rascunho = registro.status === "rascunho";
  const data = rascunho ? registro.atualizada_em : registro.publicada_em;
  try {
    const pdf = await gerarPdfDoTreino(
      {
        aluno: { nome: aluno.rows[0].nome, idade: aluno.rows[0].nascimento ? idadeEm(aluno.rows[0].nascimento, new Date().toISOString().slice(0, 10)) : null },
        titulo: registro.titulo ?? "",
        objetivo: registro.objetivo ?? "",
        plano: registro.plano,
        versao: rascunho ? null : registro.versao,
        data: new Date(data).toISOString(),
        detalhado: url.searchParams.get("detalhado") === "1",
      },
      await identidadeDoProfissional(profissional)
    );
    const nome = nomeDoArquivo("Treino", aluno.rows[0].nome, new Date(data).toISOString().slice(0, 10));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(nome, url.searchParams.get("baixar") === "1"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF do treino:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}
