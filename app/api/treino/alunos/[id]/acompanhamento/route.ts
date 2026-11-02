import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { DadosInvalidos, alterarConfiguracao, configuracaoDoAluno, relatoriosDoAluno } from "@/lib/servidor/treinoRelatorios";

export const runtime = "nodejs";

// Acompanhamento semanal do aluno pelo profissional conectado: ligar ou
// desligar (B3), adesão mínima (B4), metas (B5), pausas (B6) e relatórios.
async function resposta(profissional: Parameters<typeof configuracaoDoAluno>[0], id: string) {
  const [configuracao, relatorios] = await Promise.all([configuracaoDoAluno(profissional, id), relatoriosDoAluno(profissional, id)]);
  return NextResponse.json({ ...configuracao, relatorios });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return resposta(profissional, id);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};
  if ((dados.acao === "encerrar_meta" || dados.acao === "excluir_pausa") && !UUID.test(String(dados.id))) return recusar("Dados inválidos.", 400);
  try {
    await alterarConfiguracao(profissional, id, dados);
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    console.error("Erro no acompanhamento do aluno:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
  return resposta(profissional, id);
}
