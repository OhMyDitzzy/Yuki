import type {
  WASocket,
  Chat,
  Contact,
  GroupMetadata,
  PresenceData,
  WAMessage,
  WAMessageKey,
  MessageUserReceipt,
  BaileysEventEmitter,
  ConnectionState
} from "baileys";
import {
  DEFAULT_CONNECTION_CONFIG,
  md5,
  toNumber,
  updateMessageWithReceipt,
  updateMessageWithReaction,
  jidDecode,
  jidNormalizedUser,
  proto
} from "baileys";

interface ChatKey {
  key: (c: Chat) => string;
  compare: (k1: string, k2: string) => number;
}

interface LabelAssociationKey {
  key: (la: LabelAssociation) => string;
  compare: (k1: string, k2: string) => number;
}

interface StoreConfig {
  socket?: WASocket;
  chatKey?: ChatKey;
  labelAssociationKey?: LabelAssociationKey;
  logger?: any;
}

interface Label {
  id: string;
  name: string;
  color: number;
  deleted?: boolean;
}

enum LabelAssociationType {
  Chat = "label_jid",
  Message = "label_message"
}

interface LabelAssociation {
  type: LabelAssociationType;
  chatId: string;
  messageId?: string;
  labelId: string;
}

interface MessagesDictionary {
  array: WAMessage[];
  get: (id: string) => WAMessage | undefined;
  upsert: (item: WAMessage, mode: 'append' | 'prepend') => void;
  update: (item: WAMessage) => boolean;
  remove: (item: WAMessage) => boolean;
  updateAssign: (id: string, update: Partial<WAMessage>) => boolean;
  clear: () => void;
  filter: (contain: (item: WAMessage) => boolean) => void;
  toJSON: () => WAMessage[];
  fromJSON: (items: WAMessage[]) => void;
}

interface InMemoryStore {
  chats: any;
  contacts: { [jid: string]: Contact };
  messages: { [jid: string]: MessagesDictionary };
  groupMetadata: { [jid: string]: GroupMetadata };
  state: Partial<ConnectionState>;
  presences: { [jid: string]: { [participant: string]: PresenceData } };
  labels: ObjectRepository<Label>;
  labelAssociations: any;
  bind: (ev: BaileysEventEmitter) => void;
  loadMessages: (jid: string, count: number, cursor?: { before: WAMessageKey } | { after: WAMessageKey }) => Promise<WAMessage[]>;
  getLabels: () => ObjectRepository<Label>;
  getChatLabels: (chatId: string) => LabelAssociation[];
  getMessageLabels: (messageId: string) => string[];
  loadMessage: (jid: string, id: string) => Promise<WAMessage | undefined>;
  mostRecentMessage: (jid: string) => Promise<WAMessage | undefined>;
  fetchImageUrl: (jid: string, socket?: WASocket) => Promise<string | undefined>;
  fetchGroupMetadata: (jid: string, socket?: WASocket) => Promise<GroupMetadata | undefined>;
  fetchMessageReceipts: (key: WAMessageKey) => Promise<MessageUserReceipt[] | undefined>;
  toJSON: () => any;
  fromJSON: (json: any) => void;
  writeToFile: (path: string) => void;
  readFromFile: (path: string) => void;
}

class ObjectRepository<T extends { id: string }> {
  private entityMap: Map<string, T>;

  constructor(entities: { [key: string]: T } = {}) {
    this.entityMap = new Map(Object.entries(entities));
  }

  findById(id: string): T | undefined {
    return this.entityMap.get(id);
  }

  findAll(): T[] {
    return Array.from(this.entityMap.values());
  }

  upsertById(id: string, entity: T): Map<string, T> {
    return this.entityMap.set(id, { ...entity });
  }

  deleteById(id: string): boolean {
    return this.entityMap.delete(id);
  }

  count(): number {
    return this.entityMap.size;
  }

  toJSON(): T[] {
    return this.findAll();
  }
}

function makeOrderedDictionary(idGetter: (item: WAMessage) => string): MessagesDictionary {
  const array: WAMessage[] = [];
  const dict: { [id: string]: WAMessage } = {};

  const get = (id: string): WAMessage | undefined => dict[id];

  const update = (item: WAMessage): boolean => {
    const id = idGetter(item);
    const idx = array.findIndex(i => idGetter(i) === id);
    if (idx >= 0) {
      array[idx] = item;
      dict[id] = item;
      return true;
    }
    return false;
  };

  const upsert = (item: WAMessage, mode: 'append' | 'prepend'): void => {
    const id = idGetter(item);
    if (get(id)) {
      update(item);
    } else {
      if (mode === 'append') {
        array.push(item);
      } else {
        array.splice(0, 0, item);
      }
      dict[id] = item;
    }
  };

  const remove = (item: WAMessage): boolean => {
    const id = idGetter(item);
    const idx = array.findIndex(i => idGetter(i) === id);
    if (idx >= 0) {
      array.splice(idx, 1);
      delete dict[id];
      return true;
    }
    return false;
  };

  return {
    array,
    get,
    upsert,
    update,
    remove,
    updateAssign: (id: string, update: Partial<WAMessage>): boolean => {
      const item = get(id);
      if (item) {
        Object.assign(item, update);
        delete dict[id];
        dict[idGetter(item)] = item;
        return true;
      }
      return false;
    },
    clear: (): void => {
      array.splice(0, array.length);
      for (const key of Object.keys(dict)) {
        delete dict[key];
      }
    },
    filter: (contain: (item: WAMessage) => boolean): void => {
      let i = 0;
      while (i < array.length) {
        if (!contain(array[i] as WAMessage)) {
          delete dict[idGetter(array[i] as WAMessage)];
          array.splice(i, 1);
        } else {
          i += 1;
        }
      }
    },
    toJSON: (): WAMessage[] => array,
    fromJSON: (newItems: WAMessage[]): void => {
      array.splice(0, array.length, ...newItems);
    }
  };
}

const waChatKey = (pin: boolean): ChatKey => ({
  key: (c: Chat) =>
    (pin ? (c.pinned ? '1' : '0') : '') +
    (c.archived ? '0' : '1') +
    (c.conversationTimestamp ? c.conversationTimestamp.toString(16).padStart(8, '0') : '') +
    c.id,
  compare: (k1: string, k2: string) => k2.localeCompare(k1)
});

const waMessageID = (m: WAMessage): string => m.key.id || '';

const waLabelAssociationKey: LabelAssociationKey = {
  key: (la: LabelAssociation) =>
    la.type === LabelAssociationType.Chat
      ? la.chatId + la.labelId
      : la.chatId + la.messageId + la.labelId,
  compare: (k1: string, k2: string) => k2.localeCompare(k1)
};

const makeMessagesDictionary = (): MessagesDictionary =>
  makeOrderedDictionary(waMessageID);

export const makeInMemoryStore = async (config: StoreConfig): Promise<InMemoryStore> => {
  const socket = config.socket;
  const chatKey = config.chatKey || waChatKey(true);
  const labelAssociationKey = config.labelAssociationKey || waLabelAssociationKey;
  const logger = config.logger || DEFAULT_CONNECTION_CONFIG.logger.child({ stream: 'in-mem-store' });

  const { default: KeyedDB } = await import("@adiwajshing/keyed-db");

  const chats = new KeyedDB(chatKey, (c: any) => c.id);
  const messages: { [jid: string]: MessagesDictionary } = {};
  const contacts: { [jid: string]: Contact } = {};
  const groupMetadata: { [jid: string]: GroupMetadata } = {};
  const presences: { [jid: string]: { [participant: string]: PresenceData } } = {};
  const state: Partial<ConnectionState> = { connection: 'close' };
  const labels = new ObjectRepository<Label>();
  const labelAssociations = new KeyedDB(labelAssociationKey, labelAssociationKey.key);

  const assertMessageList = (jid: string): MessagesDictionary => {
    if (!messages[jid]) {
      messages[jid] = makeMessagesDictionary();
    }
    return messages[jid];
  };

  const contactsUpsert = (newContacts: Contact[]): Set<string> => {
    const oldContacts = new Set(Object.keys(contacts));
    for (const contact of newContacts) {
      oldContacts.delete(contact.id);
      contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
    }
    return oldContacts;
  };

  const labelsUpsert = (newLabels: Label[]): void => {
    for (const label of newLabels) {
      labels.upsertById(label.id, label);
    }
  };

  const bind = (ev: BaileysEventEmitter): void => {
    ev.on('connection.update', update => {
      Object.assign(state, update);
    });

    ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages, isLatest, syncType }) => {
      if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
        return;
      }

      if (isLatest) {
        chats.clear();
        for (const id in messages) {
          delete messages[id];
        }
      }

      const chatsAdded = chats.insertIfAbsent(...newChats).length;
      logger.debug({ chatsAdded }, 'synced chats');

      const oldContacts = contactsUpsert(newContacts);
      if (isLatest) {
        const oldContactsArray = Array.from(oldContacts);
        for (const jid of oldContactsArray) {
          delete contacts[jid];
        }
      }

      logger.debug({ deletedContacts: isLatest ? oldContacts.size : 0, newContacts }, 'synced contacts');

      for (const msg of newMessages) {
        const jid = msg.key.remoteJid!;
        const list = assertMessageList(jid);
        list.upsert(msg, 'prepend');
      }

      logger.debug({ messages: newMessages.length }, 'synced messages');
    });

    ev.on('contacts.upsert', contacts => {
      contactsUpsert(contacts);
    });

    ev.on('contacts.update', async (updates) => {
      for (const update of updates) {
        let contact: Contact | undefined;

        if (contacts[update.id!]) {
          contact = contacts[update.id!];
        } else {
          const contactHashes = await Promise.all(
            Object.keys(contacts).map(async (contactId) => {
              const { user } = jidDecode(contactId)!;
              return [contactId, (await md5(Buffer.from(user! + 'WA_ADD_NOTIF', 'utf8'))).toString('base64').slice(0, 3)] as [string, string];
            })
          );
          contact = contacts[contactHashes.find(([, b]) => b === update.id?.[0])?.[0] || ''];
        }

        if (contact) {
          if (update.imgUrl === 'changed') {
            contact.imgUrl = socket ? await socket.profilePictureUrl(contact.id) : undefined;
          } else if (update.imgUrl === 'removed') {
            delete contact.imgUrl;
          }
        } else {
          return logger.debug({ update }, 'got update for non-existant contact');
        }

        // @ts-ignore
        Object.assign(contacts[contact.id], contact);
      }
    });

    ev.on('chats.upsert', newChats => {
      chats.upsert(...newChats);
    });

    ev.on('chats.update', updates => {
      for (let update of updates) {
        const result = chats.update(update.id as string, (chat: Chat) => {
          if (update.unreadCount! > 0) {
            update = { ...update };
            update.unreadCount = (chat.unreadCount || 0) + update.unreadCount!;
          }
          Object.assign(chat, update);
        });

        if (!result) {
          logger.debug({ update }, 'got update for non-existant chat');
        }
      }
    });

    ev.on('labels.edit', (label) => {
      if (label.deleted) {
        return labels.deleteById(label.id);
      }

      if (labels.count() < 20) {
        return labels.upsertById(label.id, label);
      }

      logger.error('Labels count exceed');
    });

    ev.on('labels.association', ({ type, association }) => {
      switch (type) {
        case 'add':
          labelAssociations.upsert(association);
          break;
        case 'remove':
          labelAssociations.delete(association);
          break;
        default:
          console.error(`unknown operation type [${type}]`);
      }
    });

    ev.on('presence.update', ({ id, presences: update }) => {
      presences[id] = presences[id] || {};
      Object.assign(presences[id], update);
    });

    ev.on('chats.delete', deletions => {
      for (const item of deletions) {
        if (chats.get(item)) {
          chats.deleteById(item);
        }
      }
    });

    ev.on('messages.upsert', ({ messages: newMessages, type }) => {
      switch (type) {
        case 'append':
        case 'notify':
          for (const msg of newMessages) {
            const jid = jidNormalizedUser(msg.key.remoteJid!);
            const list = assertMessageList(jid);
            list.upsert(msg, 'append');

            if (type === 'notify' && !chats.get(jid)) {
              ev.emit('chats.upsert', [
                {
                  id: jid,
                  conversationTimestamp: toNumber(msg.messageTimestamp),
                  unreadCount: 1
                }
              ]);
            }
          }
          break;
      }
    });

    ev.on('messages.update', updates => {
      for (const { update, key } of updates) {
        const list = assertMessageList(jidNormalizedUser(key.remoteJid!));

        if (update?.status) {
          const listStatus = list.get(key.id!)?.status;
          if (listStatus && update?.status <= listStatus) {
            logger.debug({ update, storedStatus: listStatus }, 'status stored newer then update');
            delete update.status;
            logger.debug({ update }, 'new update object');
          }
        }

        const result = list.updateAssign(key.id!, update);
        if (!result) {
          logger.debug({ update }, 'got update for non-existent message');
        }
      }
    });

    ev.on('messages.delete', item => {
      if ('all' in item) {
        const list = messages[item.jid];
        list?.clear();
      } else {
        // Weird error, Response is a WAMessageKey not WAMessageKey[]
        // @ts-ignore
        const jid = item.keys?.remoteJid!;
        const list = messages[jid];
        if (list) {
          const idSet = new Set(item.keys.map(k => k.id));
          list.filter(m => !idSet.has(m.key.id));
        }
      }
    });

    ev.on('groups.update', updates => {
      for (const update of updates) {
        const id = update.id!;
        if (groupMetadata[id]) {
          Object.assign(groupMetadata[id], update);
        } else {
          logger.debug({ update }, 'got update for non-existant group metadata');
        }
      }
    });

    ev.on('group-participants.update', ({ id, participants, action }) => {
      const metadata = groupMetadata[id];
      if (metadata) {
        switch (action) {
          case 'add':
            metadata.participants.push(
              ...participants.map(participantId => ({
                id: participantId,
                isAdmin: false,
                isSuperAdmin: false
              }) as any)
            );
            break;
          case 'demote':
          case 'promote':
            for (const participant of metadata.participants) {
              if (participants.includes(participant.id as any)) {
                participant.isAdmin = action === 'promote';
              }
            }
            break;
          case 'remove':
            metadata.participants = metadata.participants.filter(
              p => !participants.includes(p.id as any)
            );
            break;
        }
      }
    });

    ev.on('message-receipt.update', updates => {
      for (const { key, receipt } of updates) {
        const obj = messages[key.remoteJid!];
        const msg = obj?.get(key.id!);
        if (msg) {
          updateMessageWithReceipt(msg, receipt);
        }
      }
    });

    ev.on('messages.reaction', (reactions) => {
      for (const { key, reaction } of reactions) {
        const obj = messages[key.remoteJid!];
        const msg = obj?.get(key.id!);
        if (msg) {
          updateMessageWithReaction(msg, reaction);
        }
      }
    });
  };

  const toJSON = () => ({
    chats,
    contacts,
    messages,
    labels,
    labelAssociations
  });

  const fromJSON = (json: any) => {
    chats.upsert(...json.chats);
    labelAssociations.upsert(...(json.labelAssociations || []));
    contactsUpsert(Object.values(json.contacts));
    labelsUpsert(Object.values(json.labels || {}));

    for (const jid in json.messages) {
      const list = assertMessageList(jid);
      for (const msg of json.messages[jid]) {
        list.upsert(proto.WebMessageInfo.fromObject(msg) as WAMessage, 'append');
      }
    }
  };

  return {
    chats,
    contacts,
    messages,
    groupMetadata,
    state,
    presences,
    labels,
    labelAssociations,
    bind,

    loadMessages: async (jid: string, count: number, cursor?: { before: WAMessageKey } | { after: WAMessageKey }) => {
      const list = assertMessageList(jid);
      const mode = !cursor || 'before' in cursor ? 'before' : 'after';
      const cursorKey = cursor ? ('before' in cursor ? cursor.before : cursor.after) : undefined;
      const cursorValue = cursorKey ? list.get(cursorKey.id!) : undefined;

      let msgs: WAMessage[];

      if (list && mode === 'before' && (!cursorKey || cursorValue)) {
        if (cursorValue) {
          const msgIdx = list.array.findIndex(m => m.key.id === cursorKey?.id);
          msgs = list.array.slice(0, msgIdx);
        } else {
          msgs = list.array;
        }

        const diff = count - msgs.length;
        if (diff < 0) {
          msgs = msgs.slice(-count);
        }
      } else {
        msgs = [];
      }

      return msgs;
    },

    getLabels: () => labels,

    getChatLabels: (chatId: string) => {
      return labelAssociations.filter((la: LabelAssociation) => la.chatId === chatId).all();
    },

    getMessageLabels: (messageId: string) => {
      const associations: LabelAssociation[] = labelAssociations
        .filter((la: LabelAssociation) => la.messageId === messageId)
        .all();
      return associations.map(({ labelId }) => labelId);
    },

    loadMessage: async (jid: string, id: string) => messages[jid]?.get(id),

    mostRecentMessage: async (jid: string) => {
      const message = messages[jid]?.array.slice(-1)[0];
      return message;
    },
    // @ts-ignore
    fetchImageUrl: async (jid: string, socket?: WASocket) => {
      const contact = contacts[jid];
      if (!contact) {
        return socket?.profilePictureUrl(jid);
      }
      if (typeof contact.imgUrl === 'undefined') {
        contact.imgUrl = await socket?.profilePictureUrl(jid);
      }
      return contact.imgUrl;
    },

    fetchGroupMetadata: async (jid: string, socket?: WASocket) => {
      if (!groupMetadata[jid]) {
        const metadata = await socket?.groupMetadata(jid);
        if (metadata) {
          groupMetadata[jid] = metadata;
        }
      }
      return groupMetadata[jid];
    },

    // @ts-ignore
    fetchMessageReceipts: async ({ remoteJid, id }: WAMessageKey) => {
      const list = messages[remoteJid!];
      const msg = list?.get(id!);
      return msg?.userReceipt;
    },

    toJSON,
    fromJSON,

    writeToFile: (path: string) => {
      const { writeFileSync } = require('fs');
      writeFileSync(path, JSON.stringify(toJSON()));
    },

    readFromFile: (path: string) => {
      const { readFileSync, existsSync } = require('fs');
      if (existsSync(path)) {
        logger.debug({ path }, 'reading from file');
        const jsonStr = readFileSync(path, { encoding: 'utf-8' });
        const json = JSON.parse(jsonStr);
        fromJSON(json);
      }
    }
  };
};

export { waChatKey, waMessageID, waLabelAssociationKey, LabelAssociationType };
export type { InMemoryStore, StoreConfig, Label, LabelAssociation };
