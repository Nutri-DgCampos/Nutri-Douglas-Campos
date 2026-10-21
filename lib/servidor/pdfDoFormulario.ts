import { NextResponse } from "next/server";
import { SITUACOES_DO_FORMULARIO, situacaoDoFormulario, type Pergunta, type Recordatorio, type Respostas } from "@/lib/nutricao/anamnese";
import { obterPool } from "./banco";
import { UUID } from "./dietas";
import { buscarFormulario, type TipoDeFormulario } from "./formularios";
import { exigirNutricionista, recusar } from "./http";
import { disposicao, nomeDoArquivo } from "./pdf/documento";
import { gerarPdfDaAnamnese, gerarPdfDoRecordatorio } from "./pdf/formulario";
import { carregarIdentidade } from "./pdf/identidade";

// GET .../pdf da anamnese ou do recordatório (nutricionista).
export function rotaPdf(tipo: TipoDeFormulario) {
  return async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Formulário inválido.", 400);

    const f = await buscarFormulario(tipo, id);
    if (!f) return recusar("Formulário não encontrado.", 404);
    const extra = await obterPool().query<{ name: string; data: string | null }>(
      `select p.name, (select to_char(c.data, 'YYYY-MM-DD') from public.consultas c where c.id = $2) as data
         from public.patients p where p.id = $1`,
      [f.patient_id, f.consulta_id]
    );
    const paciente = extra.rows[0]?.name ?? "";
    const cabecalho = {
      paciente,
      consulta: extra.rows[0]?.data ?? null,
      titulo: tipo === "anamnese" ? `Anamnese — ${f.titulo}` : "Recordatório alimentar",
      situacao: SITUACOES_DO_FORMULARIO[situacaoDoFormulario(f)].rotulo,
    };

    try {
      const identidade = await carregarIdentidade();
      const pdf =
        tipo === "anamnese"
          ? await gerarPdfDaAnamnese({ ...cabecalho, perguntas: (f.perguntas ?? []) as Pergunta[], respostas: (f.respostas ?? {}) as Respostas }, identidade)
          : await gerarPdfDoRecordatorio({ ...cabecalho, conteudo: f.conteudo as Recordatorio }, identidade);
      const nome = nomeDoArquivo(tipo === "anamnese" ? "Anamnese" : "Recordatório alimentar", paciente, extra.rows[0]?.data ?? new Date(f.criado_em).toISOString().slice(0, 10));
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": disposicao(nome, new URL(request.url).searchParams.get("baixar") === "1"),
          "Cache-Control": "private, no-store",
        },
      });
    } catch (erro) {
      console.error("Erro ao gerar PDF do formulário:", erro);
      return recusar("Não foi possível gerar o PDF.", 500);
    }
  };
}
