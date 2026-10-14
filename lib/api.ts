import {
  Construtor,
  type Consulta,
  type ErroConsulta,
  type Resultado,
} from "@/lib/consulta";

// Acesso do navegador ao servidor do próprio sistema: dados, sessão e arquivos.
// A sessão vai em cookie httpOnly, então nenhuma chamada precisa enviar token.

type Usuario = { id: string; email: string };

async function chamar(
  caminho: string,
  opcoes?: RequestInit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ dados: any; erro: ErroConsulta | null }> {
  try {
    const resposta = await fetch(caminho, {
      cache: "no-store",
      credentials: "same-origin",
      ...opcoes,
    });

    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return {
        dados: null,
        erro: {
          message: dados?.erro ?? "Não foi possível concluir a operação.",
          code: dados?.codigo ?? String(resposta.status),
        },
      };
    }

    return { dados, erro: null };
  } catch (erro) {
    return {
      dados: null,
      erro: {
        message: erro instanceof Error ? erro.message : "Falha de conexão.",
        code: "REDE",
      },
    };
  }
}

function enviarJson(caminho: string, corpo: unknown, metodo = "POST") {
  return chamar(caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function executar(consulta: Consulta): Promise<Resultado> {
  const { dados, erro } = await enviarJson("/api/dados", consulta);

  if (erro) {
    return { data: null, error: erro, count: null };
  }

  return dados as Resultado;
}

async function usuarioAtual(): Promise<Usuario | null> {
  const { dados } = await chamar("/api/auth/sessao");

  return dados?.usuario ?? null;
}

function arquivos(bucket: string) {
  const endereco = (parametros: Record<string, string>) =>
    `/api/arquivos?${new URLSearchParams({ bucket, ...parametros })}`;

  return {
    async upload(
      caminho: string,
      arquivo: Blob,
      opcoes?: { contentType?: string; upsert?: boolean }
    ) {
      const { dados, erro } = await chamar(
        endereco({
          caminho,
          substituir: opcoes?.upsert ? "sim" : "nao",
        }),
        {
          method: "PUT",
          headers: {
            "Content-Type": opcoes?.contentType ?? arquivo.type,
          },
          body: arquivo,
        }
      );

      return { data: dados, error: erro };
    },

    async createSignedUrl(caminho: string, segundos: number) {
      const { dados, erro } = await enviarJson("/api/arquivos/assinar", {
        bucket,
        caminho,
        segundos,
      });

      return {
        data: dados ? { signedUrl: dados.endereco as string } : null,
        error: erro,
      };
    },

    async remove(caminhos: string[]) {
      const { dados, erro } = await enviarJson(
        endereco({}),
        { caminhos },
        "DELETE"
      );

      return { data: dados, error: erro };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(pasta: string, opcoes?: { limit?: number }) {
      const { dados, erro } = await chamar(endereco({ pasta }));

      return {
        data: (dados?.arquivos ?? null) as { name: string }[] | null,
        error: erro,
      };
    },
  };
}

export const api = {
  from(tabela: string) {
    return new Construtor(executar, tabela);
  },

  async rpc(
    nome: string,
    argumentos: Record<string, unknown> = {}
  ): Promise<Resultado> {
    const { dados, erro } = await enviarJson("/api/dados/funcao", {
      nome,
      argumentos,
    });

    if (erro) {
      return { data: null, error: erro, count: null };
    }

    return dados as Resultado;
  },

  auth: {
    async signInWithPassword(credenciais: {
      email: string;
      password: string;
    }) {
      const { erro } = await enviarJson("/api/auth/entrar", {
        email: credenciais.email,
        senha: credenciais.password,
      });

      return { error: erro };
    },

    async signOut() {
      const { erro } = await enviarJson("/api/auth/sair", {});

      return { error: erro };
    },

    async getUser() {
      return { data: { user: await usuarioAtual() }, error: null };
    },

    async getSession() {
      const user = await usuarioAtual();

      return {
        data: { session: user ? { user } : null },
        error: null,
      };
    },

    async resetPasswordForEmail(email: string) {
      const { erro } = await enviarJson("/api/auth/recuperar", { email });

      return { error: erro };
    },

    async tokenDeRedefinicaoValido(token: string) {
      const { dados } = await enviarJson("/api/auth/redefinir", {
        token,
        apenasConferir: true,
      });

      return dados?.valido === true;
    },

    async redefinirSenha(token: string, senha: string) {
      const { erro } = await enviarJson("/api/auth/redefinir", {
        token,
        senha,
      });

      return { error: erro };
    },
  },

  storage: {
    from: arquivos,
  },
};
