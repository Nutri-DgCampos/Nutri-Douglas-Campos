// Versões dos avatares dinâmicos (SPEC §11.1, "controle de geração").
// Mudar materiais, regiões ou regras exige nova versão: imagens já salvas
// guardam a versão com que foram geradas e nunca são refeitas em silêncio.

export const VERSAO_AVATAR = {
  /** Motor de deformação e composição (motor.ts, campos.ts). */
  renderizador: "1",
  /** Fontes aprovadas no pacote de 19/11/2026 (SHA-256 conferido). */
  materiais: "2026-11-19",
  /** Regiões, neutros e faixas (regioes.ts). */
  regioes: "1",
} as const;

export const ROTULO_VERSAO_AVATAR = `r${VERSAO_AVATAR.renderizador}-m${VERSAO_AVATAR.materiais}-g${VERSAO_AVATAR.regioes}`;

/** Caminhos públicos das fontes (os materiais-base podem ser públicos, SPEC §11.3). */
export const PASTA_FONTES = "/nutricao/avatares/dinamicos";

export const FONTES = {
  /** Fontes grandes, para a exportação definitiva. */
  m: { pele: "masculino/pele-frontal.png", musculo: "masculino/isometrica-musculos.png", gordura: "masculino/isometrica-gordura-alinhada.png" },
  f: { pele: "feminino/pele-frontal.png", musculo: "feminino/isometrica-musculos.png", gordura: "feminino/isometrica-gordura-alinhada.png" },
} as const;

/** Fontes 600 × 802 do protótipo, para a prévia interativa na tela. */
export const FONTES_TELA = {
  m: { pele: "tela/masculino-pele-frontal.png", musculo: "tela/masculino-isometrica-musculos.png", gordura: "tela/masculino-isometrica-gordura.png" },
  f: { pele: "tela/feminino-pele-frontal.png", musculo: "tela/feminino-isometrica-musculos.png", gordura: "tela/feminino-isometrica-gordura.png" },
} as const;
