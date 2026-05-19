import Database from "@tauri-apps/plugin-sql";

const databasePath = "sqlite:paper-trader.db";

let databasePromise: Promise<Database> | null = null;

export function getDatabase() {
  //reuse db handle
  databasePromise ??= Database.load(databasePath);
  return databasePromise;
}
