import { obterPool } from "./banco";

// Fotos de evolução do cadastro do paciente (fotos_evolucao, bucket "fotos")
// para o Comparativo de fotos da tela Treino (SPEC 06/11, fotos). As mesmas
// fotos da Nutrição, sem cópia; quem chama confere o vínculo. O caminho no
// disco não sai daqui: a tela usa o id da foto.

export async function fotosParaOTreino(patientId: string) {
  const [fotos, favoritas, ciclos] = await Promise.all([
    obterPool().query<{ id: string; perfil: string; data: string; ciclo_id: string | null }>(
      `select id, perfil, to_char(data, 'YYYY-MM-DD') as data, ciclo_id
         from public.fotos_evolucao where patient_id = $1 order by data`,
      [patientId]
    ),
    obterPool().query<{ data: string }>("select to_char(data, 'YYYY-MM-DD') as data from public.fotos_datas_favoritas where patient_id = $1", [patientId]),
    obterPool().query<{ id: string; cycle_number: number }>("select id, cycle_number from public.diet_cycles where patient_id = $1", [patientId]),
  ]);
  return {
    // storage_path = id: a tela só precisa de uma chave.
    fotos: fotos.rows.map((f) => ({ ...f, storage_path: f.id })),
    favoritas: favoritas.rows.map((f) => f.data),
    ciclos: ciclos.rows,
  };
}

export async function caminhoDaFoto(patientId: string, fotoId: string) {
  const r = await obterPool().query<{ storage_path: string }>(
    "select storage_path from public.fotos_evolucao where id = $1 and patient_id = $2",
    [fotoId, patientId]
  );
  return r.rows[0]?.storage_path ?? null;
}
