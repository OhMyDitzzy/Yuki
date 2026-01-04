import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["connstatus", "cs"],
  rowner: true,
  exec: async (m, { conn }) => {
    function getConnectionState() {
      try {
        if (!global.conn?.ws?.socket) {
          return { state: -1, stateText: 'NO_SOCKET', isConnected: false };
        }

        const readyState = global.conn.ws.socket.readyState;
        
        let stateText = 'UNKNOWN';
        let isConnected = false;
        
        switch(readyState) {
          case 0: stateText = 'CONNECTING'; break;
          case 1: stateText = 'OPEN'; isConnected = true; break;
          case 2: stateText = 'CLOSING'; break;
          case 3: stateText = 'CLOSED'; break;
          default: stateText = `UNKNOWN(${readyState})`;
        }
        
        return { state: readyState, stateText, isConnected };
      } catch (e) {
        return { state: -1, stateText: 'ERROR', isConnected: false };
      }
    }
    
    const connState = getConnectionState();
    const processUptime = process.uptime();
    const hours = Math.floor(processUptime / 3600);
    const minutes = Math.floor((processUptime % 3600) / 60);
    const seconds = Math.floor(processUptime % 60);
    
    const used = process.memoryUsage();
    const heapUsedMB = (used.heapUsed / 1024 / 1024).toFixed(2);
    const rssMB = (used.rss / 1024 / 1024).toFixed(2);
    
    const statusIcon = connState.isConnected ? '✅' : '❌';
    
    const statusMsg = `
📊 *Bot Status*

• *Connection:* ${connState.stateText} ${statusIcon}
• *ReadyState:* ${connState.state}
• *Process Uptime:* ${hours}h ${minutes}m ${seconds}s
• *Memory:* ${heapUsedMB} MB / ${rssMB} MB RSS
• *Id:* ${conn.user.lid}

_Use .restart to restart connection_
_Use .shutdown to stop bot_
`.trim();
    
    await m.reply(statusMsg);
  }
}

export default handler;