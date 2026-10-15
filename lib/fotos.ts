import { api } from "@/lib/api";
import { enderecosDasFotos } from "@/lib/imagem";

// Fotos de evolução do paciente (frente, lado e costas), por data de envio.

export const PERFIS = [
  { chave: "frente", rotulo: "Frente" },
  { chave: "lado", rotulo: "Lado" },
  { chave: "costas", rotulo: "Costas" },
] as const;

export type Perfil = (typeof PERFIS)[number]["chave"];

export type FotoEvolucao = {
  id: string;
  perfil: Perfil;
  data: string;
  storage_path: string;
};

export function formatarData(dataISO: string) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export async function enderecosParaExibir(fotos: FotoEvolucao[]) {
  return enderecosDasFotos(async (caminho) => {
    const { data } = await api.storage.from("fotos").createSignedUrl(caminho, 3600);
    return data?.signedUrl ?? null;
  }, fotos.map((foto) => foto.storage_path));
}
