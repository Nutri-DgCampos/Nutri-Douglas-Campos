import fs from "node:fs/promises";
import path from "node:path";
import { obterPool } from "./banco";
import type { Contexto } from "./permissoes";

// Arquivos enviados (dietas em PDF, comprovantes de pagamento, exames de
// sangue, treinos e fotos de evolução).
// Ficam em disco, em um volume do Docker, organizados por "bucket".

type Bucket = {
  tamanhoMaximo: number;
  // Tipo de conteúdo aceito -> extensões aceitas.
  tipos: Record<string, string[]>;
};

export const BUCKETS: Record<string, Bucket> = {
  dietas: {
    tamanhoMaximo: 50 * 1024 * 1024,
    tipos: { "application/pdf": ["pdf"] },
  },
  comprovantes: {
    tamanhoMaximo: 20 * 1024 * 1024,
    tipos: {
      "application/pdf": ["pdf"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
    },
  },
  exames: {
    tamanhoMaximo: 20 * 1024 * 1024,
    tipos: {
      "application/pdf": ["pdf"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
    },
  },
  treinos: {
    tamanhoMaximo: 20 * 1024 * 1024,
    tipos: {
      "application/pdf": ["pdf"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
      "text/plain": ["txt"],
    },
  },
  // Logotipo, assinatura e marca-d'água dos PDFs (só o nutricionista).
  identidade: {
    tamanhoMaximo: 5 * 1024 * 1024,
    tipos: {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
    },
  },
  fotos: {
    tamanhoMaximo: 10 * 1024 * 1024,
    tipos: {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/webp": ["webp"],
    },
  },
};

// Buckets em que o paciente grava e lê só dentro da pasta do próprio cadastro.
const PASTA_DO_PACIENTE = ["exames", "treinos", "fotos"];

function pastaBase() {
  return process.env.ARQUIVOS_DIR ?? "/dados/arquivos";
}

// Converte bucket + caminho em um caminho no disco, recusando qualquer coisa
// que possa escapar da pasta do bucket.
export function resolverCaminho(bucket: string, caminho: string) {
  if (!BUCKETS[bucket]) {
    return null;
  }

  const partes = caminho.split("/");

  if (
    partes.length === 0 ||
    partes.length > 6 ||
    partes.some(
      (parte) =>
        !/^[A-Za-z0-9._-]{1,200}$/.test(parte) || /^\.+$/.test(parte)
    )
  ) {
    return null;
  }

  return path.join(pastaBase(), bucket, ...partes);
}

export function tipoDoArquivo(bucket: string, caminho: string) {
  const extensao = caminho.split(".").pop()?.toLowerCase() ?? "";

  return (
    Object.entries(BUCKETS[bucket]?.tipos ?? {}).find(([, extensoes]) =>
      extensoes.includes(extensao)
    )?.[0] ?? null
  );
}

// ------------------------------------------------------------------------
// Permissões
// ------------------------------------------------------------------------

export function podeEnviar(
  contexto: Contexto,
  bucket: string,
  caminho: string
) {
  if (bucket === "dietas" || bucket === "identidade") {
    return contexto.papel === "nutricionista";
  }

  // Exame, treino e fotos: o paciente grava na pasta do próprio cadastro.
  if (PASTA_DO_PACIENTE.includes(bucket)) {
    return Boolean(contexto.pacienteId) && caminho.startsWith(`${contexto.pacienteId}/`);
  }

  // Comprovante: cada usuário só grava dentro da própria pasta.
  return caminho.startsWith(`${contexto.usuarioId}/`);
}

export function podeGerenciar(contexto: Contexto, bucket: string) {
  return (bucket === "dietas" || bucket === "identidade") && contexto.papel === "nutricionista";
}

export async function podeBaixar(
  contexto: Contexto,
  bucket: string,
  caminho: string
) {
  if (contexto.papel === "nutricionista") {
    return true;
  }

  if (bucket === "comprovantes") {
    return caminho.startsWith(`${contexto.usuarioId}/`);
  }

  if (PASTA_DO_PACIENTE.includes(bucket)) {
    return Boolean(contexto.pacienteId) && caminho.startsWith(`${contexto.pacienteId}/`);
  }

  if (!contexto.pacienteId) {
    return false;
  }

  // Dieta: o paciente só abre arquivos das suas duas entregas mais recentes.
  const resultado = await obterPool().query(
    `select 1
       from public.diet_delivery_files f
      where f.storage_path = $1
        and f.delivery_id in (
          select u.id from public.diet_deliveries u
           where u.patient_id = $2
           order by u.created_at desc, u.id desc
           limit 2)`,
    [caminho, contexto.pacienteId]
  );

  return (resultado.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------------
// Operações em disco
// ------------------------------------------------------------------------

export async function gravarArquivo(
  destino: string,
  conteudo: Buffer,
  substituir: boolean
) {
  await fs.mkdir(path.dirname(destino), { recursive: true });

  // "wx" falha se o arquivo já existe, evitando sobrescrever um envio anterior.
  await fs.writeFile(destino, conteudo, { flag: substituir ? "w" : "wx" });
}

export async function removerArquivo(destino: string) {
  await fs.rm(destino, { force: true });
}

export async function listarArquivos(pasta: string) {
  try {
    const itens = await fs.readdir(pasta, { withFileTypes: true });

    return itens
      .filter((item) => item.isFile())
      .map((item) => ({ name: item.name }));
  } catch (erro) {
    if (
      erro &&
      typeof erro === "object" &&
      "code" in erro &&
      erro.code === "ENOENT"
    ) {
      return [];
    }

    throw erro;
  }
}

// Remove a pasta inteira de um paciente ou usuário dentro de um bucket.
export async function removerPasta(bucket: string, pasta: string) {
  const destino = resolverCaminho(bucket, pasta);

  if (destino) {
    await fs.rm(destino, { recursive: true, force: true });
  }
}

export async function lerArquivo(destino: string) {
  return fs.readFile(destino);
}
