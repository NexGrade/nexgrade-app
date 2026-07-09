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

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c client_encoding=UTF8",
  // Render nao suporta saida IPv6, e o host do Supabase pode resolver
  // para um endereco IPv6 (AAAA), causando ENETUNREACH. Forcamos a
  // resolucao para IPv4 diretamente na conexao do pg.
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback);
  },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
