import type { PluginHandler } from "@yuki/types";
import { getAuthStateStats } from "libs/useSQLAuthState";
import { existsSync, statSync } from "node:fs";

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}


let handler: PluginHandler = {
  cmd: ["info_sesi", "session_info"],
  rowner: true,
  exec: async (m, { conn }) => {
    try {
      const dbPath = 'data/auth.db';

      let message = '📊 *Session Information*\n\n';
      if (existsSync(dbPath)) {
        const stats = getAuthStateStats(dbPath);

        message += '🗄️ *SQLite Database:*\n';
        message += `├ Path: ${dbPath}\n`;
        message += `├ Size: ${formatBytes(stats.size)}\n`;
        message += `├ Total Keys: ${stats.totalKeys}\n`;
        message += `├ Creds Exists: ${stats.credsExists ? '✅' : '❌'}\n`;
        message += `└ Status: ${stats.credsExists ? 'Active' : 'Not Initialized'}\n\n`;

        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;

        if (existsSync(walPath)) {
          const walSize = statSync(walPath).size;
          message += `📝 WAL File: ${formatBytes(walSize)}\n`;
        }

        if (existsSync(shmPath)) {
          const shmSize = statSync(shmPath).size;
          message += `💾 SHM File: ${formatBytes(shmSize)}\n`;
        }
      } else {
        message += '❌ SQLite database not found!\n\n';
      }

      message += '\n🔗 *Connection:*\n';
      message += `├ Status: ${conn!!.user ? 'Connected' : 'Disconnected'}\n`;
      if (conn!!.user) {
        message += `├ Number: ${conn!!.user?.lid}\n`;
        message += `└ Name: ${conn!!.user?.name || 'Unknown'}\n`;
      }

      await conn!!.reply(m.chat, message, m);
    } catch (error: any) {
      console.error('Error in sessioninfo:', error);
      await conn!!.reply(m.chat, `❌ Error getting session info:\n${error.message}`, m);
    }
  }
}

export default handler;
