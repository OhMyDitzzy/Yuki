import { initAuthCreds, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from 'baileys';
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface SQLiteAuthStateConfig {
  dbPath: string;
  tableName?: string;
}

export async function useSQLiteAuthState(
  config: string | SQLiteAuthStateConfig
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clearState: () => void }> {

  const dbPath = typeof config === 'string' ? config : config.dbPath;
  const tableName = typeof config === 'object' ? config.tableName || 'auth' : 'auth';

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath, { create: true });

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA cache_size = -64000');
  db.run('PRAGMA temp_store = MEMORY');
  db.run('PRAGMA mmap_size = 30000000000');

  db.run(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL
    )
  `);

  const getStmt = db.query(`SELECT value FROM ${tableName} WHERE key = ?`);
  const setStmt = db.query(`INSERT OR REPLACE INTO ${tableName} (key, value) VALUES (?, ?)`);
  const deleteStmt = db.query(`DELETE FROM ${tableName} WHERE key = ?`);

  // TODO
  const getAllKeysStmt = db.query(`SELECT key FROM ${tableName}`);

  const readData = (key: string): any => {
    try {
      const row = getStmt.get(key) as { value: Buffer } | null;
      if (!row) return null;

      const data = JSON.parse(row.value.toString('utf-8'));
      return data;
    } catch (error) {
      console.error(`Error reading key ${key}:`, error);
      return null;
    }
  };

  const writeData = (key: string, data: any): void => {
    try {
      const jsonStr = JSON.stringify(data);
      const buffer = Buffer.from(jsonStr, 'utf-8');
      setStmt.run(key, buffer);
    } catch (error) {
      console.error(`Error writing key ${key}:`, error);
      throw error;
    }
  };

  const removeData = (key: string): void => {
    try {
      deleteStmt.run(key);
    } catch (error) {
      console.error(`Error removing key ${key}:`, error);
    }
  };

  let creds: AuthenticationCreds = readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
          const data: { [id: string]: any } = {};

          for (const id of ids) {
            const key = `${type}-${id}`;
            const value = readData(key);
            if (value) {
              data[id] = value;
            }
          }

          return data;
        },

        set: async (data: any) => {
          const keys = Object.keys(data);
          const transaction = db.transaction(() => {
            for (const category of keys) {
              for (const id in data[category]) {
                const value = data[category][id];
                const key = `${category}-${id}`;

                if (value === null) {
                  removeData(key);
                } else {
                  writeData(key, value);
                }
              }
            }
          });

          transaction();
        }
      }
    },

    saveCreds: async () => {
      writeData('creds', creds);
    },

    clearState: () => {
      try {
        db.run(`DELETE FROM ${tableName}`);
        creds = initAuthCreds();
      } catch (error) {
        console.error('Error clearing state:', error);
      }
    }
  };
}

export function closeSQLiteAuthState(dbPath: string): void {
  try {
    const db = new Database(dbPath);
    db.run('PRAGMA optimize');
    db.close();
  } catch (error) {
    console.error('Error closing database:', error);
  }
}
