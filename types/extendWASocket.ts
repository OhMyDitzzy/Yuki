import type {
  WASocket,
  MiscMessageGenerationOptions,
  MessageRelayOptions,
  proto
} from "baileys";
import type { ILogger } from "baileys/lib/Utils/logger";

export interface Logger extends ILogger {
  info(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  trace(...args: any[]): void;
  debug(...args: any[]): void;
}

type ExtendedWAUser = WASocket["user"] & {
  jid?: string;
}

export interface FileResult {
  res?: any;
  filename?: string;
  mime: string;
  ext: string;
  data: Buffer;
  deleteFile(): Promise<void>;
}

export interface ExtendedWASocket extends WASocket {
  user: ExtendedWAUser;
  chats: Record<string, any>;
  isLid?: Record<string, string>;

  decodeJid(jid: any): string | null;
  getJid(sender: any): string;

  logger: Logger;

  getFile(PATH: any, saveToFile?: boolean): Promise<FileResult>;
  getName(jid?: string, withoutContact?: false): Promise<string>;
  waitEvent(
    eventName: string,
    is?: (arg: any) => boolean,
    maxTries?: number,
    timeoutMs?: number
  ): Promise<any>;

  sendFile(
    jid: string,
    path: string,
    filename?: string,
    caption?: string,
    quoted?: MiscMessageGenerationOptions,
    ptt?: boolean,
    options?: any
  ): Promise<any>;

  sendSticker(
    jid: string,
    path: string,
    quoted?: MiscMessageGenerationOptions,
    exif?: any
  ): Promise<any>;

  sendContact(
    jid: string,
    data: any,
    quoted?: MiscMessageGenerationOptions,
    options?: any
  ): Promise<any>;

  sendContactArray(
    jid: string,
    data: any,
    quoted?: MiscMessageGenerationOptions,
    options?: any
  ): Promise<any>;

  resize(
    image: string | Buffer | ArrayBuffer,
    width: number,
    height: number
  ): Promise<Buffer>;

  reply(
    jid: string,
    text?: string,
    quoted?: MiscMessageGenerationOptions,
    options?: any
  ): Promise<any>;

  sendMedia(
    jid: string,
    path: string,
    quoted?: MiscMessageGenerationOptions,
    options?: any
  ): Promise<any>;

  updateProfileStatus(status: string): Promise<any>;

  sendPayment(
    jid: string,
    amount: number,
    currency: string,
    text?: string,
    from?: string,
    image?: any,
    options?: MessageRelayOptions
  ): Promise<any>;

  sendPoll(
    jid: string,
    name?: string,
    optiPoll?: any,
    options?: MessageRelayOptions
  ): Promise<any>;

  downloadAndSaveMediaMessage(
    message: any,
    filename: any,
    attachExtension?: boolean
  ): Promise<string>;

  msToDate(ms: number): Promise<string>;

  delay(ms: number): Promise<void>;

  cMod(
    jid: string,
    message: any,
    text?: string,
    sender?: string,
    options?: any
  ): proto.IWebMessageInfo;

  copyNForward(
    jid: string,
    message: any,
    forwardingScore?: boolean | number,
    options?: any
  ): Promise<any>;

  fakeReply(
    jid: string,
    text?: string,
    fakeJid?: string,
    fakeText?: string,
    fakeGroupJid?: any,
    options?: MiscMessageGenerationOptions
  ): Promise<any>;

  downloadM(
    m: any,
    type: string,
    saveToFile?: string | boolean
  ): Promise<Buffer | string>;

  parseMention(text?: string): string[];

  saveName(id: string, name?: string): Promise<void>;

  getName(jid?: string, withoutContact?: boolean): string | Promise<string>;

  loadMessage(messageID: any): any;

  sendGroupV4Invite(
    groupJid: string,
    participant: string,
    inviteCode: any,
    inviteExpiration: any,
    groupName?: string,
    caption?: string,
    jpegThumbnail?: any,
    options?: any
  ): Promise<any>;

  processMessageStubType(m: any): Promise<void>;

  pushMessage(m: any): Promise<void>;

  chatRead?(
    jid: string,
    participant?: string,
    messageID?: any
  ): Promise<any>;

  setStatus?(status: any): Promise<any>;
  [key: string]: any;
}
