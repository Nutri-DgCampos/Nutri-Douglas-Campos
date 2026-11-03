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

// PDFs do Treino: cada documento sai com a identidade de quem prescreveu
// (resposta H1). Administrador: a identidade da clínica. Educador físico:
// nome, CREF e telefone do cadastro (logotipo próprio entra na etapa T6, R8).
export async function identidadeDoProfissional(profissional: { usuarioId: string; admin: boolean }): Promise<Identidade> {
  if (profissional.admin) return carregarIdentidade();
  const r = await obterPool().query<{ nome: string; cref: string | null; telefone: string | null }>(
    "select nome, cref, telefone from public.educadores_fisicos where usuario_id = $1",
    [profissional.usuarioId]
  );
  const e = r.rows[0];
  return {
    nomeProfissional: e?.nome ?? null,
    registroProfissional: e?.cref ? (/^cref/i.test(e.cref.trim()) ? e.cref.trim() : `CREF ${e.cref.trim()}`) : null,
    frase: e?.telefone ?? null,
    corLinhas: "#15803d",
    logo: null,
    assinatura: null,
    marcaDagua: null,
  };
}