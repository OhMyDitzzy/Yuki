import type { ExtendedWASocket } from "../types/extendWASocket";
import { commandCache } from "../libs/commandCache";
import type { InMemoryStore } from "libs/makeInMemoryStore";


export { };

declare global {
  var opts: any;
  var prefix: any;
  var commandCache: CommandCache;
  var db: Low<any>;
  var store: InMemoryStore;
  var startupTime: number;
  var isProcessingPending: boolean;
  var pendingMessagesCount: number;
  var lastPendingMessageTime: number;
  var loadDatabase: () => Promse<void>;
  var conn: ExtendedWASocket;
}

declare global {
  interface String {
    decodeJid: (jid?: string) => any;
    getRandom: any;
    capitalize: (text?: string) => any;
    capitalizeV2: (text?: string) => any;
    isNumber: (text?: string) => any;
  }

  interface Number {
    getRandom: any;
    toTimeString: (time?: number) => any;
    isNumber: (theNumber?: number) => any;
  }

  interface Array {
    getRandom: () => any;
  }

  interface ArrayBuffer {
    toBuffer: (bufferData: any) => any;
    getFileType: (bufferData: any) => any;
  }

  interface Uint8Array {
    getFileType: (bufferData: any) => any;
  }
}
