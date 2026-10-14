// Converte o dump de dados do Supabase (dados.sql) para o banco novo.
//
// Uso (com os containers no ar):
//   node scripts/importar-dump.mjs banco/dump/dados.sql | docker exec -i nutri-postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
//
// O que entra:
//   - auth.users  -> public.users (id, e-mail e hash da senha; as senhas continuam valendo)
//   - public.*    -> como está
// O restante do schema auth (sessões, tokens) e o schema storage são descartados:
// os usuários fazem login de novo e os arquivos são copiados à parte
// (scripts/baixar-arquivos-supabase.mjs).

import fs from "node:fs";

const arquivo = process.argv[2];

if (!arquivo) {
  console.error("Informe o caminho do dados.sql.");
  process.exit(1);
}

const linhas = fs.readFileSync(arquivo, "utf8").split(/\r?\n/);
const saida = [];

saida.push("BEGIN;");
// Desliga triggers e chaves estrangeiras durante a carga (a ordem das tabelas
// no dump não respeita as dependências, e os triggers recriariam pagamentos).
saida.push("SET session_replication_role = replica;");

const COLUNAS_USUARIO = [
  "id",
  "email",
  "encrypted_password",
  "created_at",
  "updated_at",
  "last_sign_in_at",
];

let total = 0;

for (let i = 0; i < linhas.length; i += 1) {
  const inicio = linhas[i].match(
    /^COPY "([a-z_]+)"\."([a-z_]+)" \((.+)\) FROM stdin;$/
  );

  if (!inicio) {
    continue;
  }

  const [, esquema, tabela, listaColunas] = inicio;
  const dados = [];

  for (i += 1; linhas[i] !== "\\."; i += 1) {
    dados.push(linhas[i]);
  }

  if (dados.length === 0) {
    continue;
  }

  if (esquema === "auth" && tabela === "users") {
    const colunas = listaColunas.split(", ").map((nome) => nome.replace(/"/g, ""));
    const indices = COLUNAS_USUARIO.map((nome) => colunas.indexOf(nome));

    saida.push(
      'COPY public.users (id, email, password_hash, created_at, updated_at, last_sign_in_at) FROM stdin;'
    );

    for (const linha of dados) {
      const campos = linha.split("\t");
      const usuario = indices.map((indice) => campos[indice]);

      // O e-mail é a chave de login: sempre em minúsculas.
      usuario[1] = usuario[1].toLowerCase();
      saida.push(usuario.join("\t"));
    }

    saida.push("\\.");
    total += dados.length;
    console.error(`public.users: ${dados.length} linha(s)`);
    continue;
  }

  if (esquema !== "public") {
    continue;
  }

  saida.push(linhas[i - dados.length - 1], ...dados, "\\.");
  total += dados.length;
  console.error(`public.${tabela}: ${dados.length} linha(s)`);
}

saida.push("SET session_replication_role = DEFAULT;");
saida.push("COMMIT;");

process.stdout.write(`${saida.join("\n")}\n`);
console.error(`Total: ${total} linha(s).`);
