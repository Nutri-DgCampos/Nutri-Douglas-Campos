import type { PoolClient } from "pg";

// Trilha de alterações em registros clínicos: o quê, valor anterior e novo,
// quando e quem. Gravada na mesma transação da alteração.

type Registro = {
  pacienteId: string;
  tabela: string;
  registroId: string;
  usuarioId: string | null;
};

export async function registrarAcao(
  cliente: PoolClient,
  registro: Registro,
  acao: "criacao" | "exclusao" | "finalizacao",
  dados?: Record<string, unknown>
) {
  await cliente.query(
    `insert into public.auditoria_clinica
       (patient_id, tabela, registro_id, acao, valor_novo, usuario_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      registro.pacienteId,
      registro.tabela,
      registro.registroId,
      acao,
      dados ? JSON.stringify(dados) : null,
      registro.usuarioId,
    ]
  );
}

// Registra uma linha por campo que mudou de fato.
export async function registrarAlteracoes(
  cliente: PoolClient,
  registro: Registro,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
) {
  for (const campo of Object.keys(depois)) {
    const anterior = antes[campo] ?? null;
    const novo = depois[campo] ?? null;

    if (JSON.stringify(anterior) === JSON.stringify(novo)) continue;

    await cliente.query(
      `insert into public.auditoria_clinica
         (patient_id, tabela, registro_id, acao, campo, valor_anterior, valor_novo, usuario_id)
       values ($1, $2, $3, 'alteracao', $4, $5, $6, $7)`,
      [
        registro.pacienteId,
        registro.tabela,
        registro.registroId,
        campo,
        JSON.stringify(anterior),
        JSON.stringify(novo),
        registro.usuarioId,
      ]
    );
  }
}
