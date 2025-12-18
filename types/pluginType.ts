import type { BaileysEventMap } from "baileys";
import type { ExtendedWAMessage } from "./extendWAMessage";
import type { ExtendedWASocket } from "./extendWASocket";

interface HandlerContext {
  conn?: ExtendedWASocket;
  args?: string[];
  text?: string;
  isOwner?: boolean;
  isROwner?: boolean;
  user?: any;
  bot?: any;
  isRAdmin?: boolean;
  isAdmin?: boolean;
  isBotAdmin?: boolean;
  isPrems?: boolean;
  command?: string;
  isBans?: boolean;
  groupMetadata?: any;
  delay?(angka: number): Promise<void>;
  noPrefix?: string;
  usedPrefix?: string;
  chatUpdate?: BaileysEventMap["messages.upsert"];
}

export interface PluginHandler {
  name: string;
  description?: string;
  cmd: string[] | RegExp;
  register?: boolean;
  tags?: string[];
  usePrefix?: boolean;
  help?: string[];
  group?: boolean;
  banned?: boolean;
  premium?: boolean;
  mods?: boolean;
  owner?: boolean;
  rowner?: boolean;
  admin?: boolean;
  private?: boolean;
  limit?: number | boolean;
  exp?: number;
  level?: number;
  disabled?: boolean;
  customPrefix?: RegExp;
  exec: (
    m: ExtendedWAMessage,
    ctx: HandlerContext
  ) => Promise<void> | void;
}
