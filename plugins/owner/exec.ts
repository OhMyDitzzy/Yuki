import type { PluginHandler } from "@yuki/types";
import { format } from "node:util";

let handler: PluginHandler = {
  name: "Direct command execution",
  cmd: /(?:)/i,
  customPrefix: /^=?>/,
  exec: async (m, { conn, usedPrefix, noPrefix, args, groupMetadata }) => {
    let _return: any;
    let _syntax: any;
    let _text = (/^=/.test(usedPrefix!) ? 'return ' : '') + noPrefix;
    let old = m.exp * 1;
    try {
      let i = 15
      let f = {
        exports: {}
      }
      const AsyncFunction = Object.getPrototypeOf(async function() { }).constructor as new (
        ...args: string[]
      ) => (...fnArgs: any[]) => Promise<any>

      let exec = new AsyncFunction(
        'print',
        'm',
        'handler',
        'require',
        'conn',
        'Array',
        'process',
        'args',
        'groupMetadata',
        'module',
        'exports',
        'argument',
        _text
      )
      _return = await exec.call(conn, (...args: any[]) => {
        if (--i < 1) return
        console.log(...args)
        return conn!!.reply(m.chat, format(...args), m)
      }, m, handler, require, conn, CustomArray, process, args, groupMetadata, f, f.exports, [conn, conn, usedPrefix, noPrefix, args, groupMetadata])
    } catch (e: any) {
      _return = e
    } finally {
      conn!!.reply(
        m.chat,
        (_syntax || '') + format(_return),
        m
      )
      m.exp = old
    }
  }
}

export default handler;

class CustomArray extends Array {
  constructor(...args: any[]) {
    if (typeof args[0] === 'number') {
      super(Math.min(args[0], 10000))
    } else {
      super(...args)
    }
  }
}
