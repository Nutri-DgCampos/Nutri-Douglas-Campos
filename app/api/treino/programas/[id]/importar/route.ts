import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { validarPlanoDoEditor } from "@/lib/treinoEditor";
import { BUCKETS, gravarArquivo, resolverCaminho } from "@/lib/servidor/arquivos";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { lerPrograma, registrarImportacao } from "@/lib/servidor/treinoPrescricoes";
import { conteudoDoArquivo, lerTreinoNoEditor } from "@/lib/servidor/treinos";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Importar" no editor: o profissional envia um arquivo ou cola o texto de
// um treino; a IA organiza em sessões e a tela mostra para revisão antes de
// aplicar no rascunho. O original fica guardado (arquivo no bucket "treinos"
// do aluno; texto no próprio rascunho). Nada é publicado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const programa = UUID.test(id) ? await lerPrograma(profissional, id) : null;
  if (!programa) return recusar("Treino não encontrado.", 404);

  const formulario = await request.formData().catch(() => null);
  if (!formulario) return recusar("Envie um arquivo ou cole o texto.", 400);
  const arquivo = formulario.get("arquivo");
  const textoColado = typeof formulario.get("texto") === "string" ? String(formulario.get("texto")).trim() : "";

  let conteudo;
  let importacao: Parameters<typeof registrarImportacao>[1];
  const em = new Date().toISOString();

  if (arquivo instanceof File && arquivo.size > 0) {
    const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
    const tipo = Object.entries(BUCKETS.treinos.tipos).find(([, extensoes]) => extensoes.includes(extensao))?.[0];
    if (!tipo) return recusar("Formato não aceito. Envie PDF, imagem, Word, Excel ou texto.", 400);
    if (arquivo.size > BUCKETS.treinos.tamanhoMaximo) return recusar("Arquivo maior que 20 MB.", 400);
    const dados = Buffer.from(await arquivo.arrayBuffer());
    const caminho = `${programa.patient_id}/importado-${randomUUID()}.${extensao}`;
    const destino = resolverCaminho("treinos", caminho);
    if (!destino) return recusar("Arquivo inválido.", 400);
    await gravarArquivo(destino, dados, false);
    conteudo = await conteudoDoArquivo(dados, tipo, arquivo.name.slice(0, 200));
    importacao = { em, origem: "arquivo", nome: arquivo.name.slice(0, 200), caminho, texto: null, comentario: null };
  } else if (textoColado.length >= 10) {
    if (textoColado.length > 60_000) return recusar("Texto muito longo (máximo de 60 mil caracteres).", 400);
    conteudo = { type: "input_text" as const, text: `Treino:\n${textoColado}` };
    importacao = { em, origem: "texto", nome: null, caminho: null, texto: textoColado, comentario: null };
  } else {
    return recusar("Envie um arquivo ou cole o texto do treino.", 400);
  }

  try {
    const lido = await lerTreinoNoEditor(conteudo, { usuarioId: profissional.usuarioId, pacienteId: programa.patient_id });
    const limpo = validarPlanoDoEditor({ dias: lido.dias });
    if ("erro" in limpo || limpo.plano.dias.length === 0) return recusar("Não foi possível identificar os exercícios. Confira o arquivo ou o texto.", 422);
    const comentario = typeof lido.comentario === "string" ? lido.comentario.trim().slice(0, 1000) : null;
    await registrarImportacao(id, { ...importacao, comentario });
    return NextResponse.json({ plano: limpo.plano, comentario });
  } catch (erro) {
    console.error("Erro ao importar treino no editor:", erro);
    return recusar("Não foi possível ler o treino agora. Tente de novo.", 502);
  }
}
