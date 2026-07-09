import { defineConfig } from "drizzle-kit";

// Caminhos relativos simples (sem path.join/__dirname): drizzle-kit
// roda a partir do diretório deste arquivo (lib/db) quando chamado via
// `pnpm --filter @workspace/db run ...`. Usar path.join(__dirname, ...)
// aqui causa dois problemas diferentes no Windows: com barra invertida,
// o glob matching do schema falha ("No schema files found"); mesmo
// convertendo pra barra normal, o caminho absoluto resultante faz o
// drizzle-kit duplicar o prefixo do diretório ao gerar migrations.
// Caminho relativo com barra normal evita os dois problemas de vez.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});
