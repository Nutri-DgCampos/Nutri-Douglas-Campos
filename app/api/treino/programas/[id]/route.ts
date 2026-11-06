import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import {
  ProgramaInvalido,
  RevisaoDesatualizada,
  arquivarPrograma,
  enviarAoAluno,
  lerPrograma,
  salvarRascunho,
  versaoParaPdf,
} from "@/lib/servidor/treinoPrescricoes";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Programa do editor (só o autor): rascunho, versões e importação.
// ?versao=N: a versão enviada ao aluno, como foi publicada (só leitura;
// SPEC complementar 06/11, item 1).
export async function GET(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const versao = new URL(request.url).searchParams.get("versao");
  if (versao !== null) {
    if (!UUID.test(id) || !/^\d{1,4}$/.test(versao)) return recusar("Versão inválida.", 400);
    const publicada = await versaoParaPdf(profissional, id, Number(versao));
    if (!publicada || publicada.status !== "publicada") return recusar("Versão não encontrada.", 404);
    const { titulo, objetivo, plano, publicada_em } = publicada;
    return NextResponse.json({ versao: { versao: publicada.versao, titulo, objetivo, plano, publicada_em } });
  }
  const programa = UUID.test(id) ? await lerPrograma(profissional, id) : null;
  if (!programa) return recusar("Treino não encontrado.", 404);
  return NextResponse.json({ programa });
}

// Salvar e salvamento automático (rascunho, com controle de revisão).
export async function PUT(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Treino não encontrado.", 404);
  try {
    const gravado = await salvarRascunho(profissional, id, (await request.json().catch(() => null)) ?? {});
    if (!gravado) return recusar("Treino não encontrado.", 404);
    return NextResponse.json(gravado);
  } catch (erro) {
    if (erro instanceof ProgramaInvalido) return recusar(erro.message, 400);
    if (erro instanceof RevisaoDesatualizada) return recusar(erro.message, 409);
    console.error("Erro ao salvar treino:", erro);
    return recusar("Não foi possível salvar o treino.", 500);
  }
}

// Enviar ao aluno (nova versão), arquivar ou reativar.
export async function PATCH(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Treino não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};
  try {
    if (dados.acao === "enviar") {
      const versao = await enviarAoAluno(profissional, id, dados.revisao);
      if (!versao) return recusar("Treino não encontrado.", 404);
      return NextResponse.json({ versao });
    }
    if (dados.acao === "arquivar" || dados.acao === "reativar") {
      if (!(await arquivarPrograma(profissional, id, dados.acao === "arquivar"))) return recusar("Treino não encontrado.", 404);
      return NextResponse.json({ ok: true });
    }
    return recusar("Ação inválida.", 400);
  } catch (erro) {
    if (erro instanceof ProgramaInvalido) return recusar(erro.message, 400);
    if (erro instanceof RevisaoDesatualizada) return recusar(erro.message, 409);
    console.error("Erro ao enviar ou arquivar treino:", erro);
    return recusar("Não foi possível concluir.", 500);
  }
}
