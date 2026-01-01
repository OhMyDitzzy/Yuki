import { generateWAMessage, areJidsSameUser, getAggregateVotesInPollMessage, getKeyAuthor, proto, type BaileysEventMap } from "baileys";
import { createDecipheriv, createHmac } from "node:crypto";
import type { ExtendedWAMessage } from "types/extendWAMessage";

type PollContext = {
  /** normalised jid of the person that created the poll */
  pollCreatorJid: string
  /** ID of the poll creation message */
  pollMsgId: string
  /** poll creation message enc key */
  pollEncKey: Uint8Array
  /** jid of the person that voted */
  voterJid: string
}

const GCM_TAG_LENGTH = 128 >> 3

export function hmacSign(
  buffer: Buffer | Uint8Array,
  key: Buffer | Uint8Array,
  variant: 'sha256' | 'sha512' = 'sha256'
) {
  return createHmac(variant, key).update(buffer).digest()
}

export function aesDecryptGCM(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  // decrypt additional adata
  const enc = ciphertext.slice(0, ciphertext.length - GCM_TAG_LENGTH)
  const tag = ciphertext.slice(ciphertext.length - GCM_TAG_LENGTH)
  // set additional data
  decipher.setAAD(additionalData)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(enc), decipher.final()])
}

function decryptPollVote(
  { encPayload, encIv }: proto.Message.PollEncValue,
  { pollCreatorJid, pollMsgId, pollEncKey, voterJid }: PollContext
) {
  if (!encPayload || !encIv || !pollEncKey) {
    throw new Error('Missing required encryption parameters')
  }

  const sign = Buffer.concat([
    toBinary(pollMsgId),
    toBinary(pollCreatorJid),
    toBinary(voterJid),
    toBinary('Poll Vote'),
    new Uint8Array([1])
  ])

  const key0 = hmacSign(pollEncKey, new Uint8Array(32), 'sha256')
  const decKey = hmacSign(sign, key0, 'sha256')
  const aad = toBinary(`${pollMsgId}\u0000${voterJid}`)

  const decrypted = aesDecryptGCM(encPayload, decKey, encIv, aad)

  return proto.Message.PollVoteMessage.decode(decrypted)

  function toBinary(txt: string) {
    return Buffer.from(txt, 'utf-8')
  }
}

export async function all(m: ExtendedWAMessage, chatUpdate: BaileysEventMap["messages.upsert"]) {
  if (m.mtype !== "pollUpdateMessage") return;

  const creationMsgKey = m.msg.pollCreationMessageKey;

  const loadMsg = store.messages[m.chat]?.array?.find(v => creationMsgKey.id === v.key.id);
  if (!loadMsg) return;

  const pollMsg = loadMsg.message;
  const userJid = this.user.lid
  const pollCreatorJid = getKeyAuthor(creationMsgKey, userJid);

  const voters = getKeyAuthor(m.key, userJid)
  const voterJid = await this.getLid(voters);

  const decryptedVote = decryptPollVote(m.msg.vote, {
    pollCreatorJid,
    pollMsgId: creationMsgKey.id,
    pollEncKey: pollMsg.messageContextInfo.messageSecret,
    voterJid
  });

  if (!decryptedVote) return;

  const aggregate = getAggregateVotesInPollMessage({
    message: pollMsg,
    pollUpdates: [{
      pollUpdateMessageKey: m.key,
      vote: decryptedVote,
      senderTimestampMs: m.messageTimestamp
    }]
  }, userJid);

  const winningOption = aggregate.find(options => options.voters.length !== 0)?.name;
  
  const pollMapping = global.pollMappings[creationMsgKey.id];

  const extendedAggregate = aggregate.map(option => {
    let optionId = null;
    let optionIndex = null;

    if (pollMapping) {
      const mapped = pollMapping.options.find((opt: any) => opt.name === option.name);
      if (mapped) {
        optionId = mapped.id;
        optionIndex = mapped.index;
      }
    }

    return {
      id: optionId,
      index: optionIndex,
      name: option.name,
      voters: option.voters,
      voterCount: option.voters.length
    };
  });
  
  const extendedId = extendedAggregate.find(v => v.name === winningOption).id;

  let messages = await generateWAMessage(m.chat, {
    text: extendedId || winningOption,
    mentions: m.mentionedJid
  }, {
    userJid: this.user.jid,
    quoted: m.quoted && m.quoted.fakeObj
  } as any)
  
  messages.key.fromMe = areJidsSameUser(m.sender, this.user.id)
  messages.key.id = m.key.id
  messages.pushName = m.name
  if (m.isGroup) messages.key.participant = messages.participant = m.sender

  let msg = {
    ...chatUpdate,
    messages: [proto.WebMessageInfo.create(messages)].map(v => (v.conn = this, v)),
    type: "append"
  }

  this.ev.emit("messages.upsert", msg);
}
