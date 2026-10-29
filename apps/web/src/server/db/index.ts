import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export function erstelleDb(url: string): { db: Db; schliessen: () => Promise<void> } {
  const verbindung = postgres(url, { max: 10 });
  return { db: drizzle(verbindung, { schema }), schliessen: () => verbindung.end() };
}

// Eine Verbindung je Prozess, auch über Hot-Reload hinweg.
const global = globalThis as unknown as { __biaticheckDb?: Db };

export function db(): Db {
  global.__biaticheckDb ??= erstelleDb(env().DATABASE_URL).db;
  return global.__biaticheckDb;
}

export { schema };
