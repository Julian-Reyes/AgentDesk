import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle. Tools accept either, so tests can roll everything back. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
