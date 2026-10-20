import { lerArquivo, resolverCaminho, tipoDoArquivo } from "../arquivos";
import { obterPool } from "../banco";

// Identidade visual usada nos PDFs (Configurações → Identidade visual).

export type ImagemPdf = { data: Buffer; format: "png" | "jpg" };

export type Identidade = {
  nomeProfissional: string | null;
  registroProfissional: string | null;
  frase: string | null;
  corLinhas: string;
  logo: ImagemPdf | null;
  assinatura: ImagemPdf | null;
  marcaDagua: ImagemPdf | null;
};

async function carregarImagem(caminho: string | null): Promise<ImagemPdf | null> {
  if (!caminho) return null;

  const destino = resolverCaminho("identidade", caminho);
  const tipo = tipoDoArquivo("identidade", caminho);

  if (!destino || !tipo) return null;

  try {
    return { data: await lerArquivo(destino), format: tipo === "image/png" ? "png" : "jpg" };
  } catch {
    // A ausência de uma imagem não impede a geração do documento.
    return null;
  }
}

export async function carregarIdentidade(): Promise<Identidade> {
  const resultado = await obterPool().query<{
    nome_profissional: string | null;
    registro_profissional: string | null;
    frase: string | null;
    cor_linhas: string;
    logo_path: string | null;
    assinatura_path: string | null;
    marca_dagua_path: string | null;
  }>("select * from public.configuracoes_documentos where id = 1");

  const linha = resultado.rows[0];

  const [logo, assinatura, marcaDagua] = await Promise.all([
    carregarImagem(linha?.logo_path ?? null),
    carregarImagem(linha?.assinatura_path ?? null),
    carregarImagem(linha?.marca_dagua_path ?? null),
  ]);

  return {
    nomeProfissional: linha?.nome_profissional ?? null,
    registroProfissional: linha?.registro_profissional ?? null,
    frase: linha?.frase ?? null,
    corLinhas: linha?.cor_linhas ?? "#22c55e",
    logo,
    assinatura,
    marcaDagua,
  };
}
