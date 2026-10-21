import type { PoolClient } from "pg";
import type { DadosDaMedicacao } from "@/lib/nutricao/medicacao";
import { obterPool } from "./banco";

// Leitura das medicações de uma consulta (tela, PDF e resumo).

export type LinhaMedicacao = {
  id: string;
  patient_id: string;
  consulta_id: string;
  medicamento_id: string | null;
  origem_id: string | null;
  ordem: number;
  status: "em_uso" | "suspenso" | "nao_confirmado";
  dados: DadosDaMedicacao;
  excluida_em: string | null;
  revisao: number;
};

export async function medicacoesDaConsulta(consultaId: string, cliente?: PoolClient) {
  const r = await (cliente ?? obterPool()).query<LinhaMedicacao>(
    "select * from public.medicacoes where consulta_id = $1 order by ordem, criada_em",
    [consultaId]
  );
  return r.rows;
}

// Consulta anterior do paciente que tem medicações (para trazer como
// referência em cinza).
export async function consultaAnteriorComMedicacoes(consultaId: string) {
  const r = await obterPool().query<{ id: string; data: string; quantidade: number; anotacoes: string | null }>(
    `select c.id, to_char(c.data, 'YYYY-MM-DD') as data,
            (select count(*)::int from public.medicacoes m where m.consulta_id = c.id and m.excluida_em is null) as quantidade,
            (select a.texto from public.medicacoes_anotacoes a where a.consulta_id = c.id) as anotacoes
       from public.consultas c, public.consultas atual
      where atual.id = $1 and c.patient_id = atual.patient_id and c.id <> atual.id
        and (c.data, c.created_at) < (atual.data, atual.created_at)
        and (exists (select 1 from public.medicacoes m where m.consulta_id = c.id and m.excluida_em is null)
             or exists (select 1 from public.medicacoes_anotacoes a where a.consulta_id = c.id and btrim(a.texto) <> ''))
      order by c.data desc, c.created_at desc
      limit 1`,
    [consultaId]
  );
  return r.rows[0] ?? null;
}
