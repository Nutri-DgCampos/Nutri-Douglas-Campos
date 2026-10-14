// Gera o tema do PrimeReact com a paleta do sistema.
//
// Parte do tema "lara-light-teal" (PrimeReact 10, licença MIT) e troca as cores
// fixas pelas da marca. Rode de novo depois de atualizar o PrimeReact ou de
// mudar a paleta:
//   node scripts/gerar-tema.mjs

import fs from "node:fs";

const ORIGEM =
  "node_modules/primereact/resources/themes/lara-light-teal/theme.css";
const DESTINO = "app/estilo/primereact-tema.css";

// Cor do tema original -> cor da marca.
const CORES = {
  // primária (verde-pinho)
  "#14b8a6": "#0e6b56",
  "#0d9488": "#0a5846",
  "#0f766e": "#084536",
  "#99f6e4": "#a8d9c8",
  "#f0fdfa": "#eef6f2",
  // neutros levemente esverdeados
  "#1f2937": "#16241f",
  "#374151": "#26332e",
  "#4b5563": "#3a4843",
  "#6b7280": "#5c6b65",
  "#9ca3af": "#93a19b",
  "#d1d5db": "#c9d4ce",
  "#e5e7eb": "#dde5e0",
  "#f3f4f6": "#edf2ef",
  "#f9fafb": "#f6f9f7",
  "#dfe7ef": "#dde5e0",
  "#f6f9fc": "#f1f6f3",
  // sucesso (botões e mensagens) na cor da marca
  "#22c55e": "#0e6b56",
  "#16a34a": "#0a5846",
  "#15803d": "#084536",
  "#bbf7d0": "#a8d9c8",
};

let css = fs.readFileSync(ORIGEM, "utf8");

// As fontes vêm do next/font (app/layout.tsx), não do tema.
css = css.replace(/@font-face\s*\{[^}]*\}/g, "");
css = css.replace(
  /--font-family:[^;]+;/,
  "--font-family: var(--fonte-corpo), system-ui, sans-serif;"
);
css = css.replace(/--font-feature-settings:[^;]+;/, "--font-feature-settings: normal;");

for (const [de, para] of Object.entries(CORES)) {
  css = css.replaceAll(new RegExp(de, "gi"), para);
}

// Transparências da cor primária.
css = css.replaceAll(/rgba\(20,\s*184,\s*166,/g, "rgba(14, 107, 86,");

// Escala --primary-50..900 usada por alguns componentes.
const ESCALA = {
  50: "#eef6f2",
  100: "#dcede5",
  200: "#b9dbcb",
  300: "#8cc3ac",
  400: "#55a387",
  500: "#23866a",
  600: "#0e6b56",
  700: "#0a5846",
  800: "#084536",
  900: "#06372b",
};

for (const [tom, cor] of Object.entries(ESCALA)) {
  css = css.replace(new RegExp(`--primary-${tom}:[^;]+;`), `--primary-${tom}:${cor};`);
}

// Cantos um pouco mais arredondados que os 6px do tema.
css = css.replaceAll(/border-radius: 6px/g, "border-radius: 10px");
css = css.replaceAll(/--border-radius: 6px/g, "--border-radius: 10px");

fs.mkdirSync("app/estilo", { recursive: true });
fs.writeFileSync(
  DESTINO,
  `/* Gerado por scripts/gerar-tema.mjs a partir do tema lara-light-teal do PrimeReact (MIT). Não edite à mão. */\n${css}`
);

console.log(`${DESTINO}: ${(css.length / 1024).toFixed(0)} KB`);
