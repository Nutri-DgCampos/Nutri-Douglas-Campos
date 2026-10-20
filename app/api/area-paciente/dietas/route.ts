import { NextResponse } from "next/server";
import { hidratacaoDiaria, itemPrescrito, nomeNaPrescricao, textoDaQuantidade, type DocumentoDieta } from "@/lib/nutricao/dieta";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Dietas em vigor do paciente conectado, para leitura em tela (além do PDF).
//
// Vale o ciclo da entrega de dieta mais recente: se ela veio do editor,
// aparecem as dietas enviadas pelo editor nesse ciclo (ex.: dias com treino
// e dias sem treino), cada uma na sua última versão. Se a entrega mais
// recente foi só por PDF, não há dieta em tela. Só o conteúdo publicado
// aparece; rascunhos e lembretes internos nunca saem daqui.
export async function GET(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);

  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);

  const resultado = await obterPool().query<{
    dieta_id: string;
    ordem: number;
    numero: number;
    enviada_em: string;
    documento: DocumentoDieta;
    arquivo: string | null;
  }>(
    `with ultima as (
       select cycle_id from public.diet_deliveries
        where patient_id = $1 and status = 'concluida'
        order by created_at desc, id desc limit 1
     )
     select distinct on (v.dieta_id)
            v.dieta_id, d.ordem, v.numero, v.enviada_em, v.conteudo->'documento' as documento,
            (select f.storage_path from public.diet_delivery_files f
              where f.delivery_id = v.entrega_id order by f.created_at limit 1) as arquivo
       from public.dietas_versoes v
       join public.diet_deliveries e on e.id = v.entrega_id
       join public.dietas d on d.id = v.dieta_id
      where v.patient_id = $1
        and d.arquivada_em is null
        and e.cycle_id is not distinct from (select cycle_id from ultima)
        and exists (select 1 from ultima)
      order by v.dieta_id, v.numero desc`,
    [contexto.pacienteId]
  );

  const dietas = resultado.rows
    // Mesma ordem das abas do editor.
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ dieta_id, enviada_em, documento, arquivo }) => {
      const agua = hidratacaoDiaria(documento.hidratacao?.mlPorKg ?? null, documento.pesoReferencia?.valor ?? null);

      return {
        id: dieta_id,
        enviadaEm: enviada_em,
        arquivo,
        titulo: documento.titulo,
        objetivo: documento.objetivo,
        refeicoes: documento.refeicoes.map((refeicao) => ({
          id: refeicao.id,
          nome: refeicao.nome,
          horario: refeicao.horario,
          observacao: refeicao.observacao?.trim() || null,
          opcoes: refeicao.opcoes.map((opcao) => ({
            id: opcao.id,
            itens: opcao.itens
              .filter(itemPrescrito)
              .map((item) => ({
                id: item.id,
                nome: nomeNaPrescricao(item),
                quantidade: textoDaQuantidade(item),
                substituicoes: item.substituicoes
                  .filter((s) => s.quantidade)
                  .map((s) => ({ id: s.id, nome: s.nome, quantidade: textoDaQuantidade({ ...s, quantidade: s.quantidade }) })),
              })),
          })),
        })),
        observacoes: documento.observacoes.filter((o) => o.texto.trim()),
        hidratacao: {
          mlPorDia: agua,
          observacoes: documento.hidratacao?.observacoes?.trim() || null,
        },
      };
    });

  return NextResponse.json({ dietas });
}
