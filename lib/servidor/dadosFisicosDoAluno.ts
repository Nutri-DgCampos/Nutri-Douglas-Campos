import { dadosParaBanco } from "@/lib/nutricao/dadosPessoais";
import { obterPool } from "./banco";
import { DadosInvalidos } from "./educadores";

// Dados físicos comuns do cadastro (nascimento, sexo e altura) vistos e
// alterados pelo profissional do Treino que acompanha o aluno (SPEC 06/11,
// cadastro; decisão do cliente em 10/11): vale também para paciente da
// clínica. Nome, telefone, e-mail, acesso, plano e pagamento continuam com o
// nutricionista. O cadastro é um só: a mudança aparece para os dois.
// Quem chama confere o vínculo (podeAcompanharAluno).

export type DadosFisicos = { nascimento: string | null; sexo: string | null; altura: number | null };

export async function lerDadosFisicos(patientId: string): Promise<DadosFisicos | null> {
  const r = await obterPool().query<{ nascimento: string | null; sexo: string | null; altura: string | null }>(
    "select to_char(birth_date, 'YYYY-MM-DD') as nascimento, sex as sexo, height_cm::text as altura from public.patients where id = $1",
    [patientId]
  );
  const p = r.rows[0];
  return p ? { nascimento: p.nascimento, sexo: p.sexo, altura: p.altura === null ? null : Number(p.altura) } : null;
}

export async function alterarDadosFisicos(patientId: string, dados: Record<string, unknown>) {
  const t = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
  const r = dadosParaBanco({ nascimento: t(dados.nascimento), sexo: t(dados.sexo), altura: t(dados.altura), emailContato: "" });
  if ("erro" in r) throw new DadosInvalidos(r.erro);
  await obterPool().query("update public.patients set birth_date = $2, sex = $3, height_cm = $4 where id = $1", [
    patientId,
    r.valores.birth_date,
    r.valores.sex,
    r.valores.height_cm,
  ]);
  return lerDadosFisicos(patientId);
}
