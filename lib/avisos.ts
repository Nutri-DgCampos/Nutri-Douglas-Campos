import { confirmDialog } from "primereact/confirmdialog";

// Avisos e confirmações no visual do sistema, no lugar de alert() e confirm().
// O componente <Provedores> registra aqui a função que exibe o aviso.

export type TipoAviso = "success" | "info" | "warn" | "error";

type Aviso = { mensagem: string; tipo: TipoAviso };

const CHAVE = "aviso-pendente";

let exibir: ((aviso: Aviso) => void) | null = null;

// Sem tipo informado, deduz pelo texto da mensagem.
function deduzirTipo(mensagem: string): TipoAviso {
  if (/sucesso|conclu[ií]d|ativad|enviad[ao]s? |registrad|salv[ao]/i.test(mensagem)) {
    if (!/n[ãa]o foi|n[ãa]o consegu|erro|falh/i.test(mensagem)) {
      return "success";
    }
  }

  if (/n[ãa]o foi poss[ií]vel|erro|falh|inv[áa]lid|expirad|n[ãa]o permitid/i.test(mensagem)) {
    return "error";
  }

  if (/aten[çc][ãa]o|aguarde|verifique|selecione|informe|preencha|digite|j[áa] existe/i.test(mensagem)) {
    return "warn";
  }

  return "info";
}

export function avisar(mensagem: string, tipo?: TipoAviso) {
  const aviso = { mensagem, tipo: tipo ?? deduzirTipo(mensagem) };

  // Guarda por alguns segundos: se a tela for recarregada logo em seguida
  // (ex.: aviso de sucesso seguido de redirecionamento), o aviso reaparece.
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify({ ...aviso, em: Date.now() }));
  } catch {
    // Armazenamento indisponível: o aviso só aparece nesta tela.
  }

  exibir?.(aviso);
}

export function registrarExibicao(funcao: ((aviso: Aviso) => void) | null) {
  exibir = funcao;

  if (!funcao) {
    return;
  }

  try {
    const guardado = sessionStorage.getItem(CHAVE);

    if (!guardado) {
      return;
    }

    sessionStorage.removeItem(CHAVE);

    const aviso = JSON.parse(guardado) as Aviso & { em: number };

    if (Date.now() - aviso.em < 4000) {
      funcao(aviso);
    }
  } catch {
    // Conteúdo inválido: ignora.
  }
}

// Marca o aviso como já visto, para não repetir em uma recarga posterior.
export function avisoExibido() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento, nada a limpar.
  }
}

export function pedirConfirmacao(
  mensagem: string,
  rotulos: { aceitar?: string; rejeitar?: string; titulo?: string } = {}
): Promise<boolean> {
  return new Promise((resolver) => {
    let respondido = false;

    const responder = (valor: boolean) => {
      if (!respondido) {
        respondido = true;
        resolver(valor);
      }
    };

    confirmDialog({
      header: rotulos.titulo ?? "Confirmar",
      message: mensagem,
      acceptLabel: rotulos.aceitar ?? "Confirmar",
      rejectLabel: rotulos.rejeitar ?? "Cancelar",
      defaultFocus: "reject",
      accept: () => responder(true),
      reject: () => responder(false),
      onHide: () => responder(false),
    });
  });
}
