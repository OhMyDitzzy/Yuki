import type { PluginHandler } from "@yuki/types";
import { createHash } from "crypto";
import { WebSocket } from "ws";

// You can see source code of the web here:
// https://huggingface.co/spaces/Ditzzy/yuki
const WS_URL = process.env.WS_URL || "wss://ditzzy-yuki.hf.space/ws";
let botWs: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

function initBotWebSocket() {
  if (botWs?.readyState === WebSocket.OPEN) return;

  botWs = new WebSocket(WS_URL);

  botWs.on("open", () => {
    console.log("[Bot WebSocket] Connected to registration server");
    botWs?.send(JSON.stringify({ type: "bot_connect" }));
  });

  botWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleWebMessage(message);
    } catch (error) {
      console.error("[Bot WebSocket] Error parsing message:", error);
    }
  });

  botWs.on("close", () => {
    console.log("[Bot WebSocket] Disconnected, reconnecting in 5s...");
    botWs = null;
    reconnectTimeout = setTimeout(initBotWebSocket, 5000);
  });

  botWs.on("error", (error) => {
    console.error("[Bot WebSocket] Error:", error);
  });
}

function handleWebMessage(message: any) {
  if (message.type === "registration_complete") {
    const { sessionId, data } = message;
    
    if (global.webRegistrations?.[sessionId]) {
      const registration = global.webRegistrations[sessionId];
      registration.data = data;
      registration.completed = true;
    }
  }
}

let v1 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "WEB REGISTER" } }

let handler: PluginHandler = {
  name: "Web Registration",
  description: "Register yourself via web interface",
  tags: ["public"],
  cmd: ["webregister", "webreg", "regweb"],
  exec: async (m, { conn, usedPrefix, command }) => {
    let sock = conn!!;
    
    if (!botWs || botWs.readyState !== WebSocket.OPEN) {
      initBotWebSocket();
    }
    
    global.webRegistrations = global.webRegistrations || {};
    sock.webRegister = sock.webRegister ? sock.webRegister : {};
    
    let user = global.db.data.users[m.sender];

    if (user.registered === true) {
      return sock.reply(m.chat, '```✅ Your account has been verified```', m);
    }

    if (sock.webRegister[m.chat]?.[m.sender]) {
      return m.reply("*You already have a pending web registration!*\nPlease complete it or wait for it to expire.");
    }

    await m.react("⏳");

    const sessionHash = createHash("md5")
      .update(m.sender + Date.now())
      .digest("hex");

    if (botWs?.readyState === WebSocket.CONNECTING) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (botWs?.readyState === WebSocket.OPEN) {
      botWs.send(JSON.stringify({
        type: "create_session",
        sessionId: sessionHash,
        sender: m.sender,
      }));
    } else {
      return m.reply("⚠️ Web registration service is currently unavailable. Please try again later or use `/register` for chat-based registration.");
    }

    const webUrl = "https://ditzzy-yuki.hf.space";
    const registrationUrl = `${webUrl}/register/${sessionHash}`;

    const caption = `Complete your registration via web!

⏰ Link expires in: *10 minutes*

Click the button below to start! 👇`;

    let isProcessed = false; 
    const cleanup = () => {
      if (isProcessed) return;
      isProcessed = true;
      
      if (pollInterval) clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
      delete sock.webRegister[m.chat]?.[m.sender];
      delete global.webRegistrations[sessionHash];
    };

    let pollCount = 0;
    const maxPolls = 120;
    
    const pollInterval = setInterval(async () => {
      if (isProcessed) {
        clearInterval(pollInterval);
        return;
      }
      
      pollCount++;

      let globalReg = global.webRegistrations?.[sessionHash];

      if (globalReg?.completed && globalReg?.data) {
        cleanup();
        
        const { success, message, userData } = globalReg.data;

        if (!success || !userData) {
          await sock.sendMessage(m.chat, {
            text: `❌ Registration failed: ${message || "Unknown error"}\n\nPlease use ${usedPrefix + command!} to start again.`
          }, { quoted: m });
          return;
        }

        await sock.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
        
        const { username, age, password } = userData;
        let user = global.db.data.users[m.sender];
        
        user.name = username;
        user.age = age;
        
        let hasPassword = false;
        let bonusRewards = "";

        if (password && password.length >= 6) {
          user.password = password;
          user.limit = (user.limit || 0) + 100;
          user.money = (user.money || 0) + 10000;
          user.exp = (user.exp || 0) + 50;
          hasPassword = true;

          bonusRewards = `\n\n🎊 *BONUS REWARDS CLAIMED!*
━━━━━━━━━━━━━━━━━━━━
💎 Limit: +100
🪙 Money: +10,000
⭐ EXP: +50
🎮 RPG Access: Unlocked`;
        } else {
          user.limit = (user.limit || 0) + 50;
          bonusRewards = "\n\n💭 *No password set*\nYou can set it later using profile command!";
        }

        user.regTime = +new Date();
        user.registered = true;

        let senderLid = await sock.getJid(m.sender);
        let ppUrl = await sock
          .profilePictureUrl(m.sender, "image")
          .catch((_) => "https://telegra.ph/file/1dff1788814dd281170f8.jpg");

        let successText = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  ✅ REGISTRATION SUCCESS!
╰━━━━━━━━━━━━━━━━━━━━╯

📋 *ACCOUNT DETAILS*
━━━━━━━━━━━━━━━━━━━━
👤 Name: ${user.name}
🎂 Age: ${user.age}
📱 Number: ${senderLid.split("@")[0]}
🔐 Password: ${hasPassword ? "✓ Set" : "✗ Not Set"}
💎 Total Limit: ${user.limit}${bonusRewards}

━━━━━━━━━━━━━━━━━━━━
🎉 Welcome to Yuki Botz!
Type *.menu* to get started!`;

        await sock.sendMessage(
          m.chat,
          {
            text: successText,
            contextInfo: {
              externalAdReply: {
                title: "🎊 Registration Complete",
                body: hasPassword ? "Bonus Rewards Received!" : "Welcome to Yuki Botz!",
                thumbnailUrl: ppUrl,
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            },
          },
          { quoted: m }
        );
        return;
      }

      if (pollCount >= maxPolls) {
        cleanup();
        await sock.sendMessage(m.chat, { 
          text: `⏰ Registration timeout. Please use ${usedPrefix + command!} to start again.`
        }, { quoted: m });
      }
    }, 5000);

    const timeout = setTimeout(async () => {
      if (isProcessed) return;
      
      cleanup();
      await sock.sendMessage(m.chat, { 
        text: `⏰ Registration timeout. Please use ${usedPrefix + command!} to start again.`
      }, { quoted: m });
    }, 600000);

    sock.webRegister[m.chat] = {
      ...sock.webRegister[m.chat],
      [m.sender]: {
        sender: m.sender,
        user,
        timeout,
        pollInterval,
        sessionHash,
        isProcessed: false,
      }
    };

    global.webRegistrations[sessionHash] = {
      sessionId: sessionHash,
      sender: m.sender,
      chat: m.chat,
      completed: false,
      data: null,
    };

    await sock.sendButtonV2(
      m.chat,
      {
        body: { text: caption },
        footer: { text: "🎉 Register now and get bonus rewards!" },
      },
      [
        {
          type: "url",
          text: "Open Registration Form",
          url: registrationUrl,
        }
      ],
      { quoted: v1 as any }
    );
  },
};

export default handler;