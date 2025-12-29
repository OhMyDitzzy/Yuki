import type { PluginHandler } from "@yuki/types";
import PhoneNumber from "awesome-phonenumber";
import { Captcha } from "plugins/general/register_utils"

let v1 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (1/4)" } }
let v2 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (2/4)" } }
let v3 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (3/4)" } }
let v4 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (4/4)" } }

let handler: PluginHandler = {
  name: "Register a new account",
  description: "Register yourself as a Yuki user",
  tags: ["public"],
  cmd: ["reg", "register"],
  exec: async (m, { conn }) => {
    let sock = conn!!
    sock.register = sock.register ? sock.register : {};

    if (sock.register[m.chat]?.[m.sender]) return m.reply("*You are requesting verification!*");

    let user = global.db.data.users[m.sender];

    if (user.registered === true) return sock.reply(m.chat, '```✅ Your account has been verified```', m);
    await m.react("⏳");

    const captcha = new Captcha(6);
    const captchaBuffer = await captcha.build({
      border: "#7289DA",
      opacity: 0.6
    });

    const caption = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  🔐 ACCOUNT REGISTRATION
╰━━━━━━━━━━━━━━━━━━━━╯

Please enter the captcha code shown in the image above.

📝 Code: *${captcha.value.length} characters*
⏰ Expires in: *5 minutes*
🎯 Attempts: *3 maximum*

Reply with the code to verify.`;

    let { key } = await sock.sendFile(m.chat, captchaBuffer as Buffer<ArrayBuffer>, 'captcha.png', caption, v1 as any);
    captcha.cleanup();

    sock.register[m.chat] = {
      ...sock.register[m.chat],
      [m.sender]: {
        step: 1,
        message: m,
        sender: m.sender,
        otp: captcha.value,
        user,
        key,
        attempts: 0, // Track attempts
        timeout: setTimeout(async () => {
          await sock.sendMessage(m.chat, { delete: key });
          delete sock.register[m.chat][m.sender];
          await sock.sendMessage(m.chat, { text: "⏰ Registration timeout. Please use `/register` to start again." }, { quoted: m });
        }, 300000) // 5 minutes = 300000ms
      }
    };
  },
  before: async (m, { conn }) => {
    conn!!.register = conn!!.register ? conn!!.register : {};
    if (m.isBaileys) return;
    if (!conn!!.register[m.chat]?.[m.sender]) return;
    if (!m.text) return;

    let registerData = conn!!.register[m.chat]?.[m.sender];
    let { timeout, otp, step, attempts, key } = registerData;

    if (step === 1) {
      if (m.text !== otp) {
        attempts = (attempts || 0) + 1;
        
        if (attempts >= 3) {
          clearTimeout(timeout);
          await conn!!.sendMessage(m.chat, { delete: key });
          delete conn!!.register[m.chat]?.[m.sender];
          return await conn!!.sendMessage(m.chat, { 
            text: `🚩 Maximum attempts reached (3/3).\nYour verification code was wrong.\n\nPlease use \`/register\` to start again.` 
          }, { quoted: m });
        }

        conn!!.register[m.chat][m.sender].attempts = attempts;
        return await conn!!.sendMessage(m.chat, { 
          text: `🚩 Wrong captcha code. (${attempts}/3 attempts)\nPlease try again.` 
        }, { quoted: m });
      }

      clearTimeout(timeout);
      await conn!!.sendMessage(m.chat, { delete: key });

      const nameCaption = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  📝 STEP 2: NAME
╰━━━━━━━━━━━━━━━━━━━━╯

Please enter your name:

💡 This will be your display name
✨ Choose something unique!`;

      let messageName = await conn!!.sendMessage(m.chat, { text: nameCaption }, { quoted: v2 });
      let nameTimeout = setTimeout(async () => {
        await conn!!.sendMessage(m.chat, { delete: messageName!!.key });
        delete conn!!.register[m.chat]?.[m.sender];
        await conn!!.sendMessage(m.chat, { text: "⏰ Registration timeout. Please use `/register` to start again." }, { quoted: m });
      }, 180000);
      conn!!.register[m.chat][m.sender] = { step: 2, timeout: nameTimeout, key: messageName!!.key };

    } else if (step === 2) {
      clearTimeout(timeout);
      let name = m.text.trim();

      if (name.length < 3) {
        await conn!!.sendMessage(m.chat, { delete: key });
        delete conn!!.register[m.chat]?.[m.sender];
        return await conn!!.sendMessage(m.chat, { 
          text: "🚩 Name must be at least 3 characters long.\n\nPlease use `/register` to start again." 
        }, { quoted: m });
      }

      let user = global.db.data.users[m.sender];
      user.name = name;

      await conn!!.sendMessage(m.chat, { delete: key });

      const ageCaption = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  🎂 STEP 3: AGE
╰━━━━━━━━━━━━━━━━━━━━╯

Please enter your age:

💡 Enter numbers only
⚠️ Must be at least 13 years old`;

      let messageAge = await conn!!.sendMessage(m.chat, { text: ageCaption }, { quoted: v3 });
      let ageTimeout = setTimeout(async () => {
        await conn!!.sendMessage(m.chat, { delete: messageAge!!.key });
        delete conn!!.register[m.chat]?.[m.sender];
        await conn!!.sendMessage(m.chat, { text: "⏰ Registration timeout. Please use `/register` to start again." }, { quoted: m });
      }, 180000);
      conn!!.register[m.chat][m.sender] = { step: 3, timeout: ageTimeout, key: messageAge!!.key };

    } else if (step === 3) {
      clearTimeout(timeout);
      let age = parseInt(m.text);

      if (isNaN(age)) {
        await conn!!.sendMessage(m.chat, { delete: key });
        delete conn!!.register[m.chat]?.[m.sender];
        return await conn!!.sendMessage(m.chat, { 
          text: "🚩 Invalid age, please enter a valid number.\n\nPlease use `/register` to start again." 
        }, { quoted: m });
      }

      if (age < 13) {
        await conn!!.sendMessage(m.chat, { delete: key });
        delete conn!!.register[m.chat]?.[m.sender];
        return await conn!!.sendMessage(m.chat, { 
          text: "🚩 You must be at least 13 years old to register.\n\nPlease use `/register` to start again." 
        }, { quoted: m });
      }

      let user = global.db.data.users[m.sender];
      user.age = age;

      await conn!!.sendMessage(m.chat, { delete: key });

      const passwordCaption = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  🔑 STEP 4: PASSWORD (OPTIONAL)
╰━━━━━━━━━━━━━━━━━━━━╯

🎁 *SET PASSWORD NOW & GET BONUS!*
━━━━━━━━━━━━━━━━━━━━

🎉 *REWARDS:*
• 💎 +100 Limit (50 bonus!)
• 🪙 +10,000 Money
• ⭐ +50 EXP
• 🎮 Early access to RPG features

⏭️ *SKIP:*
• ✓ Still get verified
• ✓ Get 50 Limit
• ✓ Can set password later in profile
• ⚠️ But no bonus rewards!

━━━━━━━━━━━━━━━━━━━━
📝 Enter password (6-20 characters)
🔄 Or reply *"skip"* to continue

💡 Password will be used for:
• 🎮 RPG game features
• 🔒 Account security
• 💰 Transaction confirmation`;

      let messagePassword = await conn!!.sendMessage(m.chat, { text: passwordCaption }, { quoted: v4 });
      let passwordTimeout = setTimeout(async () => {
        await conn!!.sendMessage(m.chat, { delete: messagePassword!!.key });
        delete conn!!.register[m.chat]?.[m.sender];
        await conn!!.sendMessage(m.chat, { text: "⏰ Registration timeout. Please use `/register` to start again." }, { quoted: m });
      }, 180000);
      conn!!.register[m.chat][m.sender] = { step: 4, timeout: passwordTimeout, key: messagePassword!!.key };

    } else if (step === 4) {
      clearTimeout(timeout);
      await conn!!.sendMessage(m.chat, { delete: key });
      
      let user = global.db.data.users[m.sender];
      let senderLid = await conn!!.getJid(m.sender);
      let ppUrl = await conn!!.profilePictureUrl(m.sender, 'image').catch((_) => "https://telegra.ph/file/1dff1788814dd281170f8.jpg");

      let passwordInput = m.text.trim();
      let hasPassword = false;
      let bonusRewards = "";

      if (passwordInput.toLowerCase() === 'skip') {
        user.limit += 50;
        bonusRewards = "\n\n💭 *You skipped password setup*\nYou can set it later using profile command!";
      } else {
        if (passwordInput.length < 6 || passwordInput.length > 20) {
          delete conn!!.register[m.chat]?.[m.sender];
          return await conn!!.sendMessage(m.chat, {
            text: "🚩 Password must be 6-20 characters long.\n\nPlease use `/register` to start again."
          }, { quoted: m });
        }

        user.password = passwordInput;
        user.limit += 100;
        user.money = (user.money || 0) + 10000;
        user.exp = (user.exp || 0) + 50;
        hasPassword = true;

        bonusRewards = `\n\n🎊 *BONUS REWARDS CLAIMED!*
━━━━━━━━━━━━━━━━━━━━
💎 Limit: +100
🪙 Money: +10,000
⭐ EXP: +50
🎮 RPG Access: Unlocked`;
      }

      user.regTime = +new Date();
      user.registered = true;

      let tteks = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  ✅ REGISTRATION SUCCESS!
╰━━━━━━━━━━━━━━━━━━━━╯

📋 *ACCOUNT DETAILS*
━━━━━━━━━━━━━━━━━━━━
👤 Name: ${user.name}
🎂 Age: ${user.age}
📱 Number: ${PhoneNumber('+' + senderLid.split('@')[0]).getNumber('international')}
🔐 Password: ${hasPassword ? '✓ Set' : '✗ Not Set'}
💎 Total Limit: ${user.limit}${bonusRewards}

━━━━━━━━━━━━━━━━━━━━
🎉 Welcome to Yuki Botz!
Type *menu* to get started!`;

      await conn!!.sendMessage(m.chat, {
        text: tteks,
        contextInfo: {
          externalAdReply: {
            title: '🎊 Registration Complete',
            body: hasPassword ? 'Bonus Rewards Received!' : 'Welcome to Yuki Botz!',
            thumbnailUrl: ppUrl,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m });

      delete conn!!.register[m.chat]?.[m.sender];
    }
  }
}

export default handler;