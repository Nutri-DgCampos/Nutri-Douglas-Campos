// Baixa do Supabase Storage os arquivos listados no dump (storage.objects).
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=... \
//     node scripts/baixar-arquivos-supabase.mjs banco/dump/dados.sql banco/dump/arquivos
//
// Depois, copie para o volume do app:
//   docker cp banco/dump/arquivos/. nutri-app:/dados/arquivos/

import fs from "node:fs";
import path from "node:path";

const [arquivo, destino] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SECRET_KEY;

if (!arquivo || !destino || !url || !chave) {
  console.error(
    "Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/baixar-arquivos-supabase.mjs <dados.sql> <pasta de destino>"
  );
  process.exit(1);
}

const linhas = fs.readFileSync(arquivo, "utf8").split(/\r?\n/);
const inicio = linhas.findIndex((linha) =>
  linha.startsWith('COPY "storage"."objects" ')
);

if (inicio === -1) {
  console.error("O dump não contém a tabela storage.objects.");
  process.exit(1);
}

const colunas = linhas[inicio]
  .match(/\((.+)\) FROM stdin;$/)[1]
  .split(", ")
  .map((nome) => nome.replace(/"/g, ""));

let falhas = 0;

for (let i = inicio + 1; linhas[i] !== "\\."; i += 1) {
  const campos = linhas[i].split("\t");
  const bucket = campos[colunas.indexOf("bucket_id")];
  const nome = campos[colunas.indexOf("name")];

  const resposta = await fetch(
    `${url}/storage/v1/object/${bucket}/${nome.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { apikey: chave, Authorization: `Bearer ${chave}` } }
  );

  if (!resposta.ok) {
    console.error(`FALHA ${resposta.status} ${bucket}/${nome}`);
    falhas += 1;
    continue;
  }

  const caminho = path.join(destino, bucket, ...nome.split("/"));

  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, Buffer.from(await resposta.arrayBuffer()));
  console.log(`ok ${bucket}/${nome}`);
}

process.exit(falhas ? 1 : 0);
