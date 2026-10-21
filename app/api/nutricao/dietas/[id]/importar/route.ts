import { NextResponse } from "next/server";
import { copiarDocumento, documentoTemConteudo, validarDocumento, type DocumentoDieta } from "@/lib/nutricao/dieta";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, buscarDieta, conteudoDeOrigem, novoDocumento } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Origem = { tipo: "dieta" | "rotina" | "modelo"; id: string };

// Importar para a dieta aberta:
// - "dieta": cópia de uma dieta do paciente ou de outro paciente (consultas
//   do paciente / outros pacientes). Sem o peso do paciente de origem.
// - "modelo": cópia de um modelo de dieta completa.
// - "rotina": organização de uma dieta anterior do mesmo paciente, com os
//   alimentos em cinza (fora dos cálculos até confirmar) e sem observações.
//
// modo "substituir" troca o conteúdo da dieta aberta (exige a revisão atual;
// a tela confirma antes quando há conteúdo); "nova" cria outra aba e deixa a
// dieta aberta como está. A origem nunca é alterada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const origem = dados?.origem as Origem | undefined;
  const modo = dados?.modo === "nova" ? "nova" : dados?.modo === "substituir" ? "substituir" : null;

  if (!origem || !["dieta", "rotina", "modelo"].includes(origem.tipo) || !UUID.test(String(origem.id))) {
    return recusar("Origem inválida.", 400);
  }
  if (!modo) return recusar("Informe se substitui o conteúdo ou cria uma nova dieta.", 400);
  if (origem.id === id) return recusar("Escolha outra dieta como origem.", 400);

  const destino = await buscarDieta(id);
  if (!destino) return recusar("Dieta não encontrada.", 404);
  if (destino.arquivada_em) return recusar("A dieta está arquivada.", 409);

  const pool = obterPool();

  // Conteúdo de origem
  let fonte: DocumentoDieta;
  if (origem.tipo === "modelo") {
    const modelo = await pool.query<{ conteudo: unknown }>(
      "select conteudo from public.modelos_nutricao where id = $1 and tipo = 'dieta' and arquivado_em is null",
      [origem.id]
    );
    if (!modelo.rows[0]) return recusar("Modelo não encontrado ou arquivado.", 404);
    const validacao = validarDocumento(modelo.rows[0].conteudo);
    if ("erro" in validacao) return recusar(validacao.erro, 400);
    fonte = validacao.documento;
  } else {
    const dieta = await conteudoDeOrigem(origem.id);
    if (!dieta) return recusar("Dieta de origem não encontrada.", 404);
    if (origem.tipo === "rotina" && dieta.patient_id !== destino.patient_id) {
      return recusar("A rotina vem de uma dieta anterior do mesmo paciente.", 400);
    }
    const validacao = validarDocumento(dieta.documento);
    if ("erro" in validacao) return recusar(validacao.erro, 400);
    fonte = validacao.documento;
  }

  const copia = copiarDocumento(fonte, origem.tipo === "rotina" ? "rotina" : "copia");
  const registroDeOrigem = { tipo: origem.tipo, id: origem.id, em: new Date().toISOString() };

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");

    if (modo === "substituir") {
      const atual = await buscarDieta(id, cliente, true);
      if (!atual || atual.revisao !== dados?.revisao) {
        await cliente.query("rollback");
        return recusar("A dieta foi alterada em outra janela. Recarregue antes de importar.", 409);
      }

      // Peso e nutrientes acompanhados continuam os desta dieta. Na rotina,
      // título e objetivo também (só a organização das refeições vem).
      // Título e objetivo da origem só entram quando estão preenchidos.
      const resultado: DocumentoDieta = {
        ...copia,
        titulo: (origem.tipo !== "rotina" && copia.titulo.trim()) || atual.rascunho.titulo,
        objetivo: (origem.tipo !== "rotina" && copia.objetivo.trim()) || atual.rascunho.objetivo,
        pesoReferencia: atual.rascunho.pesoReferencia,
        nutrientesAcompanhados: atual.rascunho.nutrientesAcompanhados,
        ...(atual.rascunho.gastoReferencia !== undefined ? { gastoReferencia: atual.rascunho.gastoReferencia } : {}),
      };

      const gravada = await cliente.query<{ revisao: number }>(
        `update public.dietas
            set rascunho = $2, rascunho_em = now(), revisao = revisao + 1, origens = origens || $3::jsonb
          where id = $1 returning revisao`,
        [id, JSON.stringify(resultado), JSON.stringify([{ ...registroDeOrigem, substituiu_conteudo: documentoTemConteudo(atual.rascunho) }])]
      );

      if (origem.tipo === "modelo") {
        await cliente.query("update public.modelos_nutricao set usos = usos + 1 where id = $1", [origem.id]);
      }

      await registrarAcao(
        cliente,
        { pacienteId: atual.patient_id, tabela: "dietas", registroId: id, usuarioId: contexto.usuarioId },
        "criacao",
        { importacao: registroDeOrigem }
      );

      await cliente.query("commit");
      return NextResponse.json({ id, revisao: gravada.rows[0].revisao });
    }

    // Nova dieta (aba) na mesma consulta.
    const base = await novoDocumento(destino.patient_id, copia.titulo || "Nova dieta");
    const resultado: DocumentoDieta = {
      ...copia,
      titulo: origem.tipo === "rotina" ? "Nova dieta (rotina anterior)" : copia.titulo.trim() || "Nova dieta",
      objetivo: (origem.tipo !== "rotina" && copia.objetivo.trim()) || base.objetivo,
      pesoReferencia: base.pesoReferencia,
      nutrientesAcompanhados: base.nutrientesAcompanhados,
    };

    const criada = await cliente.query<{ id: string }>(
      `insert into public.dietas (patient_id, consulta_id, ordem, rascunho, criada_por, origens)
       values ($1, $2, (select coalesce(max(ordem), 0) + 1 from public.dietas where consulta_id = $2), $3, $4, $5)
       returning id`,
      [destino.patient_id, destino.consulta_id, JSON.stringify(resultado), contexto.usuarioId, JSON.stringify([registroDeOrigem])]
    );

    if (origem.tipo === "modelo") {
      await cliente.query("update public.modelos_nutricao set usos = usos + 1 where id = $1", [origem.id]);
    }

    await registrarAcao(
      cliente,
      { pacienteId: destino.patient_id, tabela: "dietas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { titulo: resultado.titulo, importacao: registroDeOrigem }
    );

    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao importar dieta:", erro);
    return recusar("Não foi possível importar.", 500);
  } finally {
    cliente.release();
  }
}
