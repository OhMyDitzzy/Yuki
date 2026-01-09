import type { PluginHandler } from "@yuki/types";
import os from "node:os";
import { performance } from "node:perf_hooks";

const handler: PluginHandler = {
  name: "Ping plugin",
  description: "Command to check whether the bot is responding or not",
  tags: ["public"],
  cmd: ["ping", "p"],
  exec: async (m, { conn }) => {
    const start = performance.now();
    
    const formatBytes = (bytes: number): string => {
      const sizes = ["B", "KB", "MB", "GB"];
      if (bytes === 0) return "0 B";
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    const formatUptime = (seconds: number): string => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (secs > 0) parts.push(`${secs}s`);
      
      return parts.join(" ") || "0s";
    };
    
    const memUsage = process.memoryUsage();
    const heapUsedPercent = ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2);
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || "Unknown";
    const cpuCores = cpus.length;
    const loadAvg = os.loadavg();
    const cpuLoad = ((loadAvg[0] / cpuCores) * 100).toFixed(2);
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    const ramUsagePercent = ((usedRAM / totalRAM) * 100).toFixed(2);
    const platform = `${os.type()} ${os.release()}`;
    const arch = os.arch();
    const systemUptime = formatUptime(os.uptime());
    const processUptime = formatUptime(process.uptime());

    const info = {
      "OS": `${platform} (${arch})`,
      "System Uptime": systemUptime,
      "Process Uptime": processUptime,
      "CPU": cpuModel,
      "CPU Cores": cpuCores.toString(),
      "CPU Load": `${cpuLoad}% (1m avg)`,
      "Load Average": `${loadAvg[0]?.toFixed(2)} / ${loadAvg[1]?.toFixed(2)} / ${loadAvg[2]?.toFixed(2)}`,
      "Heap Used": formatBytes(memUsage.heapUsed),
      "Heap Total": formatBytes(memUsage.heapTotal),
      "Heap Usage": `${heapUsedPercent}%`,
      "RSS": formatBytes(memUsage.rss),
      "External": formatBytes(memUsage.external),
      "Total RAM": formatBytes(totalRAM),
      "Used RAM": formatBytes(usedRAM),
      "Free RAM": formatBytes(freeRAM),
      "RAM Usage": `${ramUsagePercent}%`,
      "Runtime": typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`,
      "Owner": "Ditzzy Devs"
    };

    const end = performance.now();
    const ping = (end - start).toFixed(2);

    const caption = `
╭─────「 *SYSTEM INFO* 」
│
│ 📊 *Platform*
${["OS", "System Uptime", "Process Uptime", "Runtime"]
  .map(key => `│ • *${key}:* ${info[key]}`)
  .join("\n")}
│
│ 🖥️ *CPU*
${["CPU", "CPU Cores", "CPU Load", "Load Average"]
  .map(key => `│ • *${key}:* ${info[key]}`)
  .join("\n")}
│
│ 💾 *Heap Memory*
${["Heap Used", "Heap Total", "Heap Usage", "RSS", "External"]
  .map(key => `│ • *${key}:* ${info[key]}`)
  .join("\n")}
│
│ 🗄️ *System RAM*
${["Total RAM", "Used RAM", "Free RAM", "RAM Usage"]
  .map(key => `│ • *${key}:* ${info[key]}`)
  .join("\n")}
│
│ 👤 *Owner:* ${info.Owner}
│ ⏱️ *Response Time:* ${ping} ms
│
╰─────────────────`.trim();

    const response = await conn!!.sendMessage(
      m.chat,
      { text: "🏓 Pinging..." },
      { quoted: m }
    );

    await conn!!.sendMessage(
      m.chat,
      {
        text: caption,
        edit: response!!.key,
      },
      { quoted: m }
    );
  },
};

export default handler;