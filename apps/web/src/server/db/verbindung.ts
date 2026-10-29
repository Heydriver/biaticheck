import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/** Eigenständige Verbindung – für Skripte und Tests. */
export function erstelleDb(url: string): { db: Db; schliessen: () => Promise<void> } {
  const verbindung = postgres(url, { max: 10, onnotice: () => {} });
  return { db: drizzle(verbindung, { schema }), schliessen: () => verbindung.end() };
}
