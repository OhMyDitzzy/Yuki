import {
  getAggregateVotesInPollMessage,
  generateWAMessage,
  proto,
  normalizeMessageContent,
  areJidsSameUser,
  jidNormalizedUser,
  getKeyAuthor,
  decryptPollVote
} from "baileys"

export async function before(messageUpdate, chatUpdate) {
  if (messageUpdate.isBaileys || !messageUpdate.message?.pollUpdateMessage) {
    return;
  }

  const normalizedMessage = normalizeMessageContent(messageUpdate.message);
  if (!normalizedMessage) {
    return;
  }

  const pollCreationKey = normalizedMessage.pollUpdateMessage!!.pollCreationMessageKey;
  const storedMessage = (global.store as any).messages[messageUpdate.chat]?.array?.find((msg: any) => pollCreationKey?.id === msg.key.id);

  if (!storedMessage) {
    return;
  }

  const pollCreationMessage = storedMessage.message;
  const userJid = jidNormalizedUser(this.authState.creds.me.id);
  const voterJid = getKeyAuthor(messageUpdate.key, userJid);
  const pollCreatorJid = getKeyAuthor(pollCreationKey, userJid);
  const pollEncKey = pollCreationMessage.messageContextInfo?.messageSecret;

  const decryptedVote = decryptPollVote(normalizedMessage!!.pollUpdateMessage!!.vote as any, {
    pollEncKey,
    pollCreatorJid,
    pollMsgId: pollCreationKey!!.id,
    voterJid
  } as any);

  if (!decryptedVote) {
    return;
  }

  const pollUpdates = [{
    key: pollCreationKey,
    update: {
      pollUpdates: [{
        pollUpdateMessageKey: messageUpdate.key,
        vote: decryptedVote,
        senderTimestampMs: messageUpdate.messageTimestamp
      }]
    }
  }];

  const aggregateVotes = getAggregateVotesInPollMessage({
    message: pollCreationMessage,
    pollUpdates: pollUpdates[0]!!.update.pollUpdates
  });

  if (!aggregateVotes) {
    return;
  }

  const winningOption = aggregateVotes?.find(option => option.voters.length !== 0)?.name;
  if (!winningOption) {
    return;
  }

  const responseText = '.' + winningOption;

  await this.sendMessage(messageUpdate.chat, {
    delete: storedMessage
  });

  await appendTextMessage(messageUpdate, responseText, chatUpdate);
}

async function appendTextMessage(message, text, chatUpdate) {
  let newMessage = await generateWAMessage(message.chat, {
    text,
    mentions: message.mentionedJid || [message.sender]
  }, {
    userJid: conn.user?.jid || conn.user?.id,
    quoted: message.quoted && message.quoted?.fakeObj
  } as any);

  newMessage.key.fromMe = areJidsSameUser(message.sender, conn.user?.jid || conn.user?.id);
  newMessage.key.id = message.key.id;
  newMessage.pushName = message.pushName || message.name;

  if (message.isGroup) {
    newMessage.participant = message.sender || message.key.remoteJid || message.chat;
  }

  let messageUpsert = {
    ...chatUpdate,
    messages: [proto.WebMessageInfo.fromObject(newMessage)],
    type: "append"
  };

  conn.ev.emit("messages.upsert", messageUpsert);
}
