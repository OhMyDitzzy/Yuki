import didYouMean from "didyoumean2";
import type { ExtendedWAMessage } from "types/extendWAMessage";

export async function before(m: ExtendedWAMessage, { match }: { match: string[] }) {
  let usedPrefix: any;

  if ((usedPrefix = (match[0] || '')[0])) {
    let noPrefix = m.text.replace(usedPrefix, '');
    let args = noPrefix.trim().split(` `).slice(1);
    let text = args.join(` `);
    let command = noPrefix.trim().split(` `)[0].toLowerCase();

    let publicCommands = Object.values(global.plugins)
      .filter((v: any) => 
        v.cmd && 
        v.name && 
        v.description && 
        v.tags && 
        !v.disabled
      )
      .flatMap((v: any) => v.cmd);

    let privateCommands = Object.values(global.plugins)
      .filter((v: any) => 
        v.cmd && 
        (!v.name || !v.description || !v.tags) && 
        !v.disabled
      )
      .flatMap((v: any) => v.cmd);

    if (publicCommands.includes(command) || privateCommands.includes(command)) {
      return;
    }

    let isNearPrivate = didYouMean(command, privateCommands);

    if (isNearPrivate) return;

    let mean = didYouMean(command, publicCommands);
    
    if (mean) {
      this.sendMessage(
        m.chat,
        {
          text: `Command *${usedPrefix + command}* not found\nDid you mean: *${usedPrefix + mean}*?`,
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