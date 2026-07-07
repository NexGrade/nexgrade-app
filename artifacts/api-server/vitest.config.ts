import { defineConfig } from "vitest/config";

// `@workspace/db` cria o Pool do `pg` no escopo do módulo e lança erro
// se DATABASE_URL não estiver definida (proposital, para falhar cedo em
// produção). O Pool em si não conecta até a primeira query — então uma
// URL fictícia é suficiente para importar módulos que dependem do
// pacote de banco em teste unitário puro, sem precisar de um Postgres
// de verdade no ar. Testes que efetivamente consultam o banco devem
// ficar em `*.integration.test.ts` (fora do escopo desta config) com um
// banco real de teste.
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_placeholder",
    },
  },
});
