import type { PluginHandler } from "@yuki/types";
import { format } from "node:util";

let handler: PluginHandler = {
  cmd: /(?:)/i,
  customPrefix: /^=?>/,
  rowner: true,
  exec: async (m, { conn, usedPrefix, noPrefix, args, groupMetadata, isAdmin, isRAdmin }) => {
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
        'isAdmin',
        'isRAdmin',
        'module',
        'exports',
        'argument',
        _text
      )
      _return = await exec.call(conn, (...args: any[]) => {
        if (--i < 1) return
        console.log(...args)
        return conn!!.sendMessage(m.chat, { text: format(...args) }, { quoted: m })
      }, m, handler, require, conn, CustomArray, process, args, groupMetadata, f, f.exports, [conn, conn, usedPrefix, noPrefix, args, groupMetadata])
    } catch (e: any) {
      _return = e
    } finally {
      conn!!.sendMessage(m.chat, { text: (_syntax || '') + format(_return) }, { quoted: m })
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
