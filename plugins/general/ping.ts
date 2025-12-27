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

    const info = {
      OS: `${os.type()} ${os.release()} (${os.arch()})`,
      RAM: `${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`,
      Used_RAM: `${((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(2)} MB`,
      CPU_Load: `${((os.loadavg()[0]! / os.cpus().length) * 100).toFixed(2)}%`,
      Bun: typeof Bun !== "undefined" ? Bun.version : "N/A",
      Owner: "Ditzzy Devs"
    };

    const end = performance.now();
    const ping = end - start;

    const caption =
      Object.entries(info)
        .map(([key, value]) => `• *${key}:* ${value}`)
        .join("\n") +
      `\n\n⏱ *Ping:* ${ping.toFixed(2)} ms`;

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
