import didYouMean from "didyoumean2";
import type { ExtendedWAMessage } from "types/extendWAMessage";

export async function before(m: ExtendedWAMessage, { match }: { match: string[] }) {
  let usedPrefix: any;

  if ((usedPrefix = (match[0] || '')[0])) {
    let noPrefix = m.text.replace(usedPrefix, '');
    let args = noPrefix.trim().split(` `).slice(1);
    let text = args.join(` `);
    let command = noPrefix.trim().split(` `)[0].toLowerCase();

    let allCommands = Object.values(global.plugins)
      .filter((v: any) => 
        v.cmd && 
        v.name && 
        v.description && 
        v.tags && 
        !v.disabled
      )
      .flatMap((v: any) => v.cmd);

    if (allCommands.includes(command)) return;
    let mean = didYouMean(command, allCommands);
    
    if (mean) {
      this.sendMessage(
        m.chat,
        {
          text: `Command with *${m.text}* not found\nDid you mean: *${usedPrefix + mean}*?`,
          buttons: [{
            buttonId: `${usedPrefix + mean} ${text}`,
            buttonText: {
              displayText: "Yes"
            },
            type: 1
          }],
          headerType: 1,
          viewOnce: true
        }, 
        { quoted: m }
      );
    }
  }
}