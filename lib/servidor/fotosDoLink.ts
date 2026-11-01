import fs from "node:fs/promises";
import { hojeNoBrasil } from "@/lib/cronograma";
import { BUCKETS, gravarArquivo, removerArquivo, resolverCaminho } from "./arquivos";
import { obterPool } from "./banco";

// Fotos corporais enviadas pelo link individual (anamnese e recordatório).
//
// Vão para o mesmo lugar das fotos da Área do Paciente (fotos_evolucao, o
// "Comparativo de fotos"), na data do envio. Pelo link:
// - só se completa posição vazia do dia (não substitui foto existente);
// - o paciente vê e pode excluir só as fotos enviadas hoje (o link não
//   tem login, então não expõe o histórico).

export const PERFIS_DO_LINK = ["frente", "lado", "costas"] as const;
export type PerfilDoLink = (typeof PERFIS_DO_LINK)[number];

export class FotoRecusada extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
  }
}

// Tipo real do arquivo pelos primeiros bytes (não confia na extensão).
export function tipoDaImagem(conteudo: Buffer): { tipo: string; extensao: string } | null {
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) return { tipo: "image/jpeg", extensao: "jpg" };
  if (conteudo.length >= 8 && conteudo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: "image/png", extensao: "png" };
  if (conteudo.length >= 12 && conteudo.subarray(0, 4).toString("ascii") === "RIFF" && conteudo.subarray(8, 12).toString("ascii") === "WEBP") return { tipo: "image/webp", extensao: "webp" };
  return null;
}

export async function fotosDeHoje(patientId: string) {
  const [fotos, paciente] = await Promise.all([
    obterPool().query<{ id: string; perfil: PerfilDoLink }>(
      "select id, perfil from public.fotos_evolucao where patient_id = $1 and data = $2 order by perfil",
      [patientId, hojeNoBrasil()]
    ),
    obterPool().query<{ sex: "masculino" | "feminino" | null }>("select sex from public.patients where id = $1", [patientId]),
  ]);
  return { sexo: paciente.rows[0]?.sex ?? null, fotos: fotos.rows };
}

export async function gravarFotoDoLink(patientId: string, perfil: string, conteudo: Buffer) {
  if (!PERFIS_DO_LINK.includes(perfil as PerfilDoLink)) throw new FotoRecusada("Posição inválida.");
  if (conteudo.length === 0 || conteudo.length > BUCKETS.fotos.tamanhoMaximo) {
    throw new FotoRecusada("A foto deve ter no máximo 10 MB.", 413);
  }
  const imagem = tipoDaImagem(conteudo);
  if (!imagem) throw new FotoRecusada("Envie a foto em JPG, PNG ou WEBP.");

  const caminho = `${patientId}/${crypto.randomUUID()}.${imagem.extensao}`;
  const destino = resolverCaminho("fotos", caminho);
  if (!destino) throw new FotoRecusada("Foto inválida.");
  await gravarArquivo(destino, conteudo, false);

  const inserida = await obterPool().query<{ id: string }>(
    `insert into public.fotos_evolucao (patient_id, perfil, data, storage_path, origem)
     values ($1, $2, $3, $4, 'link')
     on conflict (patient_id, perfil, data) do nothing
     returning id`,
    [patientId, perfil, hojeNoBrasil(), caminho]
  );
  if (!inserida.rows[0]) {
    await removerArquivo(destino).catch(() => undefined);
    throw new FotoRecusada("Você já enviou esta posição hoje. Para trocar, exclua a foto e envie de novo.", 409);
  }
  return inserida.rows[0].id;
}

export async function excluirFotoDeHoje(patientId: string, id: string) {
  const r = await obterPool().query<{ storage_path: string }>(
    "delete from public.fotos_evolucao where id = $1 and patient_id = $2 and data = $3 returning storage_path",
    [id, patientId, hojeNoBrasil()]
  );
  if (!r.rows[0]) return false;
  const destino = resolverCaminho("fotos", r.rows[0].storage_path);
  if (destino) await removerArquivo(destino).catch((erro) => console.error("Não foi possível remover a foto:", erro));
  return true;
}

export async function lerFotoDeHoje(patientId: string, id: string) {
  const r = await obterPool().query<{ storage_path: string }>(
    "select storage_path from public.fotos_evolucao where id = $1 and patient_id = $2 and data = $3",
    [id, patientId, hojeNoBrasil()]
  );
  const destino = r.rows[0] ? resolverCaminho("fotos", r.rows[0].storage_path) : null;
  if (!destino) return null;
  const conteudo = await fs.readFile(destino).catch(() => null);
  if (!conteudo) return null;
  return { conteudo, tipo: tipoDaImagem(conteudo)?.tipo ?? "application/octet-stream" };
}
