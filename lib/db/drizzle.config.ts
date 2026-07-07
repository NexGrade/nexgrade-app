import { defineConfig } from "drizzle-kit";

// generate (usado para criar um novo arquivo de migration a partir de
// uma mudanÃ§a no schema) NÃƒO precisa de conexÃ£o com o banco â€" sÃ³
// push, migrate e introspect precisam. Por isso dbCredentials usa
// um valor de fallback aqui: sem isso, rodar drizzle-kit generate
// localmente (ex. numa mÃ¡quina sem DATABASE_URL configurada) falhava
// por um motivo que nÃ£o tem nada a ver com o comando sendo executado.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});