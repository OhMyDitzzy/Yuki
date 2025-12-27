import { areJidsSameUser, generateWAMessage, proto, type BaileysEventMap } from "baileys";
import type { ExtendedWAMessage } from "types/extendWAMessage";

export async function all(m: ExtendedWAMessage, chatUpdate: BaileysEventMap["messages.upsert"]) {
  if (m.isBaileys) return;
  if (!m.message) return;
  if (!m.msg.fileSha256) return;

  let hash: string;
  if (typeof m.msg.fileSha256 === 'string') {
    hash = m.msg.fileSha256;
  } else {
    hash = Buffer.from(m.msg.fileSha256).toString('base64');
  }
  
  if (!(hash in global.db.data.sticker)) return;
  
  let stickerData = global.db.data.sticker[hash];
  
  if (m.sender !== stickerData.creator) return;
  
  let { text, mentionedJid } = stickerData;
 
  let messages = await generateWAMessage(m.chat, { 
    text: text,
    mentions: mentionedJid
  }, {
    userJid: this.user.id,
    quoted: m.quoted && m.quoted.fakeObj
  } as any);

  messages.key.fromMe = areJidsSameUser(m.sender, this.user.id);
  messages.key.id = m.key.id;
  messages.pushName = m.pushName;
  
  if (m.isGroup) {
    messages.key.participant = m.sender;
    messages.participant = m.sender;
  }
  
  let msg = {
    ...chatUpdate,
    messages: [proto.WebMessageInfo.create(messages)].map(v => {
      v.conn = this;
      return v;
    }),
    type: 'append'
  }

  this.ev.emit('messages.upsert', msg);
}