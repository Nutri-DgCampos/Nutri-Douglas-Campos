import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { academiaDoAluno, listarAcademias, listarModelos } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { MODALIDADES, ProgramaInvalido, criarPrograma, programasDoAluno, rotinasDoAluno, type Modalidade } from "@/lib/servidor/treinoPrescricoes";
import { zonasDoAluno } from "@/lib/servidor/treinoZonas";

const modalidadeDe = (valor: unknown): Modalidade | null =>
  valor === undefined || valor === null ? "musculacao" : MODALIDADES.includes(valor as Modalidade) ? (valor as Modalidade) : null;

export const runtime = "nodejs";

// Programas de musculação do profissional para este aluno (editor, T4a),
// com o que o editor precisa ao abrir: aluno, academia, rotinas e modelos.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const modalidade = modalidadeDe(new URL(request.url).searchParams.get("modalidade"));
  if (!modalidade) return recusar("Modalidade inválida.", 400);

  const [aluno, programas, rotinas, academia, academias, modelos, zonas] = await Promise.all([
    obterPool().query<{ nome: string; nascimento: string | null; sexo: string | null }>(
      "select name as nome, birth_date::text as nascimento, sex as sexo from public.patients where id = $1",
      [id]
    ),
    programasDoAluno(profissional, id, modalidade),
    rotinasDoAluno(profissional, id, modalidade),
    academiaDoAluno(id),
    listarAcademias(profissional),
    listarModelos(profissional, modalidade),
    modalidade === "musculacao" ? Promise.resolve(null) : zonasDoAluno(id, modalidade),
  ]);
  const a = aluno.rows[0];
  return NextResponse.json({
    aluno: { id, nome: a.nome, idade: a.nascimento ? idadeEm(a.nascimento, new Date().toISOString().slice(0, 10)) : null, sexo: a.sexo },
    programas,
    rotinas,
    academia,
    academias: academias.map(({ id, nome, domestica }) => ({ id, nome, domestica })),
    modelos,
    zonas,
  });
}

// Novo programa: vazio, cópia de outro, de um modelo ou de uma rotina do aluno.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Aluno não encontrado.", 404);
  const d = (await request.json().catch(() => null)) ?? {};
  const modalidade = modalidadeDe(d.modalidade);
  if (!modalidade) return recusar("Modalidade inválida.", 400);
  const ref = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  let origem: Parameters<typeof criarPrograma>[2];
  if (d.origem === "duplicar" && ref(d.programaId)) origem = { tipo: "duplicar", programaId: d.programaId };
  else if (d.origem === "modelo" && ref(d.modeloId)) origem = { tipo: "modelo", modeloId: d.modeloId };
  else if (d.origem === "rotina" && ref(d.prescricaoId)) origem = { tipo: "rotina", prescricaoId: d.prescricaoId };
  else if (d.origem === "vazio" || d.origem === undefined) origem = { tipo: "vazio" };
  else return recusar("Origem inválida.", 400);
  try {
    const programaId = await criarPrograma(profissional, id, origem, modalidade);
    if (!programaId) return recusar("Aluno não encontrado.", 404);
    return NextResponse.json({ programaId }, { status: 201 });
  } catch (erro) {
    if (erro instanceof ProgramaInvalido) return recusar(erro.message, 400);
    console.error("Erro ao criar programa de treino:", erro);
    return recusar("Não foi possível criar o treino.", 500);
  }
}
