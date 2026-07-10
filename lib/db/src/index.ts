import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "node:dns";
import * as schema from "./schema";
const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// A forca de resolucao IPv4 abaixo resolve o ENETUNREACH no Render (Linux),
// mas em alguns ambientes Windows locais pode causar ECONNRESET
// (a rede local/roteador/antivirus pode tratar esse endereco IPv4
// especifico de forma diferente da resolucao DNS padrao). Por isso essa
// forca so e aplicada quando RENDER estiver definido (setado automaticamente
// pelo proprio Render em producao), nao em desenvolvimento local.
const isRender = process.env.RENDER === "true" || !!process.env.RENDER_SERVICE_ID;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c client_encoding=UTF8",
  ...(isRender
    ? {
        lookup: (hostname: string, options: any, callback: any) => {
          dns.lookup(hostname, { family: 4 }, callback);
        },
      }
    : {}),
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 15_000,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("Erro inesperado em conexao ociosa do pool Postgres:", err.message);
});
export const db = drizzle(pool, { schema });
export * from "./schema";