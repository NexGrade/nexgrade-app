import { defineConfig } from "drizzle-kit";
import path from "path";

// `generate` (usado para criar um novo arquivo de migration a partir de
// uma mudança no schema) NÃO precisa de conexão com o banco — só
// `push`, `migrate` e `introspect` precisam. Por isso dbCredentials usa
// um valor de fallback aqui: sem isso, rodar `drizzle-kit generate`
// localmente (ex. numa máquina sem DATABASE_URL configurada) falhava
// por um motivo que não tem nada a ver com o comando sendo executado.
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});
