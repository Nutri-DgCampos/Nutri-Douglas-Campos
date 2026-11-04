import { NextResponse } from "next/server";
import { alterarAlunoProprio, cadastroDoAlunoProprio, definirAlunoProprioAtivo, excluirAlunoProprio } from "@/lib/servidor/alunosProprios";
import { removerPasta } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { desconfortosDoAluno } from "@/lib/servidor/desconfortos";
import { UUID } from "@/lib/servidor/dietas";
import { DadosInvalidos, desvincular, listarEducadores, vincular, vinculosDoAluno } from "@/lib/servidor/educadores";
import { recusar } from "@/lib/servidor/http";
import { academiaDoAluno, listarAcademias } from "@/lib/servidor/treinoBiblioteca";
import { exigirAdminDoTreino, exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { EmailJaCadastrado } from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

// Painel geral do aluno no Módulo de Treino. Só dados do Treino: nada da
// Nutrição sai por aqui (o educador físico também usa esta rota).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);

  const [aluno, treino, vinculos, desconfortos, educadores, cadastro, vigente, academia, academias] = await Promise.all([
    obterPool().query<{ id: string; nome: string }>("select id, name as nome from public.patients where id = $1", [id]),
    obterPool().query(
      `select id, status, erro, file_name, storage_path, texto_enviado, plano, comentario_ia, created_at, atualizado_em
         from public.treinos where patient_id = $1 order by created_at desc limit 1`,
      [id]
    ),
    vinculosDoAluno(id),
    desconfortosDoAluno(id),
    profissional.admin ? listarEducadores() : Promise.resolve(null),
    cadastroDoAlunoProprio(profissional, id),
    // Treino que vale hoje para o aluno, de qualquer origem (T4a).
    obterPool().query(
      `select p.id, p.origem, p.titulo, p.versao, p.publicada_em, p.plano,
              coalesce(e.nome, case when pr.role = 'nutricionista' then 'Administrador' end) as autor,
              p.criada_por = $2 as meu
         from public.treino_prescricoes p
         left join public.educadores_fisicos e on e.usuario_id = p.criada_por
         left join public.profiles pr on pr.id = p.criada_por
        where p.patient_id = $1 and p.status = 'publicada' and p.modalidade = 'musculacao' and p.arquivada_em is null
        order by p.publicada_em desc, p.criada_em desc limit 1`,
      [id, profissional.usuarioId]
    ),
    academiaDoAluno(id),
    listarAcademias(profissional),
  ]);

  return NextResponse.json({
    admin: profissional.admin,
    aluno: aluno.rows[0],
    treino: treino.rows[0] ?? null,
    vinculos,
    desconfortos,
    educadores: educadores?.filter((e) => e.ativo).map((e) => ({ usuario_id: e.usuario_id, nome: e.nome })) ?? null,
    // Aluno próprio: o educador dono vê e altera o cadastro e o acesso.
    cadastro: cadastro ? { nome: cadastro.nome, telefone: cadastro.telefone, email: cadastro.email, desativado_em: cadastro.desativado_em } : null,
    vigente: vigente.rows[0] ?? null,
    academia,
    academias: academias.map(({ id, nome, domestica }) => ({ id, nome, domestica })),
  });
}

// Cadastro e senha provisória do aluno próprio: só o educador dono.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Aluno não encontrado.", 404);
  try {
    const dados = (await request.json().catch(() => ({}))) ?? {};
    // R10: desativar é reversível; o acesso do aluno cai na hora.
    if (dados.acao === "desativar" || dados.acao === "reativar") {
      const ok = await definirAlunoProprioAtivo(profissional, id, dados.acao === "reativar");
      return ok ? NextResponse.json({ sucesso: true }) : recusar("Aluno não encontrado.", 404);
    }
    const ok = await alterarAlunoProprio(profissional, id, dados);
    return ok ? NextResponse.json({ sucesso: true }) : recusar("Aluno não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    if (erro instanceof EmailJaCadastrado) return recusar("Este e-mail já é usado por outro acesso.", 409);
    console.error("Erro ao alterar aluno próprio:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

// Vínculos com educadores físicos: só o administrador.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await exigirAdminDoTreino(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(admin, id))) return recusar("Aluno não encontrado.", 404);
  const dados = (await request.json().catch(() => ({}))) ?? {};
  if (typeof dados.educadorId !== "string" || !UUID.test(dados.educadorId)) return recusar("Educador inválido.", 400);
  try {
    if (dados.acao === "vincular") await vincular(id, dados.educadorId, admin.usuarioId);
    else if (dados.acao === "desvincular") await desvincular(id, dados.educadorId, admin.usuarioId);
    else return recusar("Ação inválida.", 400);
    return NextResponse.json({ vinculos: await vinculosDoAluno(id) });
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    console.error("Erro no vínculo do aluno:", erro);
    return recusar("Não foi possível salvar o vínculo.", 500);
  }
}

// Exclusão definitiva do aluno próprio, só a pedido dele (R10): o educador
// dono confirma o pedido e digita o nome do aluno.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Aluno não encontrado.", 404);
  let excluido: { usuarioId: string | null } | null;
  try {
    excluido = await excluirAlunoProprio(profissional, id, (await request.json().catch(() => ({}))) ?? {});
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    console.error("Erro ao excluir aluno próprio:", erro);
    return recusar("Não foi possível excluir o aluno.", 500);
  }
  if (!excluido) return recusar("Aluno não encontrado.", 404);

  // Arquivos: só depois que o banco confirmou a exclusão.
  try {
    for (const bucket of ["treinos", "fotos", "exames", "dietas"]) await removerPasta(bucket, id);
    if (excluido.usuarioId) await removerPasta("comprovantes", excluido.usuarioId);
  } catch (erro) {
    console.error("Aluno excluído, mas houve erro ao remover arquivos:", erro);
  }
  return NextResponse.json({ sucesso: true });
}
