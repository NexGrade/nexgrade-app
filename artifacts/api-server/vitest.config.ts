import { defineConfig } from "vitest/config";

// `@workspace/db` cria o Pool do `pg` no escopo do módulo e lança erro
// se DATABASE_URL não estiver definida (proposital, para falhar cedo em
// produção). O Pool em si não conecta até a primeira query — então uma
// URL fictícia é suficiente para importar módulos que dependem do
// pacote de banco em teste unitário puro, sem precisar de um Postgres
// de verdade no ar.
//
// Testes que consultam o banco ficam em `*.integration.test.ts` e SO rodam
// quando TEST_DATABASE_URL aponta para um Postgres de teste ja migrado
// (o CI sobe um e aplica as migracoes). Sem essa variavel eles sao pulados,
// entao `pnpm test` continua funcionando sem banco.
const bancoDeTeste = process.env.TEST_DATABASE_URL;
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: bancoDeTeste ?? "postgresql://test:test@localhost:5432/test_placeholder",
      ...(bancoDeTeste ? { DATABASE_SSL: "disable" } : {}),
    },
  },
});
