import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt");

const verbindung = postgres(url, { max: 1 });
await migrate(drizzle(verbindung), { migrationsFolder: new URL("../../../drizzle", import.meta.url).pathname });
await verbindung.end();
console.log("Datenbank ist auf dem neuesten Stand.");
