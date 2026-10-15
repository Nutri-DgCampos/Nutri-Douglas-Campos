// Reduz uma foto do celular antes do envio (lado maior com até 1600 px, em
// JPEG). Fotos de celular passam de 5 MB; reduzidas ficam em poucas centenas de KB.
export async function reduzirFoto(arquivo: File, ladoMaximo = 1600): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });

  try {
    const escala = Math.min(1, ladoMaximo / Math.max(imagem.width, imagem.height));
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);

    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    tela.getContext("2d")!.drawImage(imagem, 0, 0, largura, altura);

    return await new Promise<Blob>((resolver, rejeitar) =>
      tela.toBlob(
        (blob) => (blob ? resolver(blob) : rejeitar(new Error("Não foi possível processar a foto."))),
        "image/jpeg",
        0.85
      )
    );
  } finally {
    imagem.close();
  }
}

// Endereços temporários para exibir várias fotos de uma vez.
export async function enderecosDasFotos(
  assinar: (caminho: string) => Promise<string | null>,
  caminhos: string[]
) {
  const pares = await Promise.all(
    caminhos.map(async (caminho) => [caminho, await assinar(caminho)] as const)
  );

  return Object.fromEntries(pares.filter(([, endereco]) => endereco)) as Record<string, string>;
}
