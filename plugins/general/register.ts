import type { PluginHandler } from "@yuki/types";
import PhoneNumber from "awesome-phonenumber";
import { Captcha } from "plugins/general/register_utils"

let v1 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (1/3)" } }
let v2 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (2/3)" } }
let v3 = { key: { participant: '0@s.whatsapp.net', remoteJid: "0@s.whatsapp.net" }, message: { conversation: "REGISTER (3/3)" } }

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
        timeout: setTimeout(() => {
          sock.sendMessage(m.chat, { delete: key });
          delete sock.register[m.chat][m.sender];
        }, 60 * 1000)
      }
    };
  },
  before: async (m, { conn }) => {
    conn!!.register = conn!!.register ? conn!!.register : {};
    if (m.isBaileys) return;
    if (!conn!!.register[m.chat]?.[m.sender]) return;
    if (!m.text) return;

    let { timeout, otp, step, message, key } = conn!!.register[m.chat]?.[m.sender];

    if (step === 1) {
      if (m.text !== otp) {
        clearTimeout(timeout);
        await conn!!.sendMessage(m.chat, { delete: key });
        delete conn!!.register[m.chat]?.[m.sender];
        return await m.reply(`🚩 Your verification code is wrong.`);
      }
      clearTimeout(timeout);
      let messageName = await conn!!.sendMessage(m.chat, { text: "Input your name:" }, { quoted: v2 });
      let nameTimeout = setTimeout(async () => {
        await conn!!.sendMessage(m.chat, { delete: messageName!!.key });
        delete conn!!.register[m.chat]?.[m.sender];
      }, 180000);
      conn!!.register[m.chat][m.sender] = { step: 2, timeout: nameTimeout, messageName };
    } else if (step === 2) {
      clearTimeout(conn!!.register[m.chat][m.sender].timeout);
      let name = m.text.trim();
      let user = global.db.data.users[m.sender];
      user.name = name;
      let messageAge = await conn!!.sendMessage(m.chat, { text: "Input your age:" }, { quoted: v3 });
      let ageTimeout = setTimeout(async () => {
        await conn!!.sendMessage(m.chat, { delete: messageAge!!.key });
        delete conn!!.register[m.chat]?.[m.sender];
      }, 180000);
      conn!!.register[m.chat][m.sender] = { step: 3, timeout: ageTimeout, messageAge };
    } else if (step === 3) {
      clearTimeout(conn!!.register[m.chat][m.sender].timeout);
      let age = parseInt(m.text);
      if (isNaN(age)) {
        return await conn!!.sendMessage(m.chat, { text: "🚩 Invalid age, please enter an valid value." }, { quoted: m });
      }
      let user = global.db.data.users[m.sender];
      let senderLid = await conn.getJid(m.sender)
      user.age = age;
      user.regTime = +new Date();
      user.registered = true;
      user.limit += 50;

      let ppUrl = await conn!!.profilePictureUrl(m.sender, 'image').catch((_) => "https://telegra.ph/file/1dff1788814dd281170f8.jpg");

      let tteks = '```Success Verified```\n\n';
      tteks += '```Name:``` ' + `${user.name}\n`;
      tteks += '```Age:``` ' + `${user.age}\n`;
      tteks += '```Number:``` ' + `${PhoneNumber('+' + senderLid.split('@')[0]).getNumber('international')}\n`;

      await conn!!.sendMessage(m.chat, {
        text: tteks,
        contextInfo: {
          externalAdReply: {
            title: 'Yuki-chan',
            body: 'Registration',
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
