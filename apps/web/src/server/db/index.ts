import "server-only";
import { env } from "../env";
import { erstelleDb, type Db } from "./verbindung";
import * as schema from "./schema";

export { erstelleDb, type Db };

// Eine Verbindung je Prozess, auch über Hot-Reload hinweg.
const global = globalThis as unknown as { __biaticheckDb?: Db };

export function db(): Db {
  global.__biaticheckDb ??= erstelleDb(env().DATABASE_URL).db;
  return global.__biaticheckDb;
}

export { schema };
