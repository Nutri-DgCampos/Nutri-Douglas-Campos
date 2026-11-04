import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import { caloriasInformadasNaSemana } from "@/lib/servidor/treinoAtividades";
import { hojeNoBrasil } from "@/lib/cronograma";
import { bloqueiosDoAluno, MENSAGEM_DE_BLOQUEIO } from "@/lib/servidor/treinoContratos";
import { prescricaoVigente, RegistroBloqueado, RegistroInvalido, salvarRegistro, treinoDoAluno } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// "Meu treino" do aluno conectado: prescrição vigente (não muda), registros
// da semana, valores mais recentes, carga anterior de cada exercício e as
// calorias que ele informou na semana (C1). Profissional com o plano vencido
// além da tolerância (R9, S2): o treino dele some e não aceita registro; vale
// o treino de quem está em dia. O histórico (relatórios e devolutivas)
// continua nas outras rotas.
async function situacao(pacienteId: string) {
  const hoje = hojeNoBrasil();
  const { bloqueados, total } = await bloqueiosDoAluno(pacienteId, hoje);
  const [treino, caloriasInformadas, semFiltro] = await Promise.all([
    treinoDoAluno(pacienteId, hoje, bloqueados),
    caloriasInformadasNaSemana(pacienteId, hoje),
    bloqueados.length ? prescricaoVigente(pacienteId) : Promise.resolve(null),
  ]);
  // "bloqueado": o treino de musculação que valeria ficou escondido.
  const bloqueado = !treino && (total || Boolean(semFiltro?.criada_por && bloqueados.includes(semFiltro.criada_por)));
  return { treino, caloriasInformadas, bloqueado };
}

export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json(await situacao(pacienteId));
}

// Registro da sessão da semana (números, situação, observação e calorias).
export async function PUT(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  try {
    const { bloqueados } = await bloqueiosDoAluno(pacienteId);
    await salvarRegistro(pacienteId, await request.json().catch(() => null), undefined, bloqueados);
    return NextResponse.json(await situacao(pacienteId));
  } catch (erro) {
    if (erro instanceof RegistroBloqueado) return recusar(MENSAGEM_DE_BLOQUEIO, 409);
    if (erro instanceof RegistroInvalido) return recusar(erro.message, 400);
    console.error("Erro ao registrar treino:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}
