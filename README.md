# Yuki Souo
Yuki is a lightweight and fast WhatsApp bot plugin script. Run it for Bun.

## Features
- [x] Pairing Code
- [x] Serializer system
- [x] Fully types for Serializer
- [x] Plugin based system
- [ ] Case system

> [!NOTE]
> I didn't do fully typed for some of the code, 
> Because it was very tiring, so I decided to 
> Relaxing TypeScript rules.

## Installation
You'll need to clone this repository. However, [Bun](https://bun.com) must be installed on your computer.
1. Step the repository:
```bash
git clone https://github.com/OhMyDitzzdev/Yuki
```

2. Define your bot number:
To define the bot number, Fill in the file [config/index.example.ts](config/index.example.ts) `global.pairing` section. Then change the file name to `index.ts`

3. Install modules:
To install modules, you can directly run the command:
```bash
bun install
# or via npm
npm install
```

4. Run it:
Run the main file with:
```bash
bun index.ts
# or
bun run index.ts
```
That's it! Your bot is ready to use!

## Adding an command
Yuki Bot is a plugin-based script. All commands are available and will be automatically detected in the [plugins](plugins) folder.
To get started, you'll need to create a command like this:
```typescript
import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
    name: "Say Hello World!",
    cmd: ["hello"], // You can use Regex for example: /^(hello)$/i
    exec: async (m) => {
      m.reply("Hello World!");
    }
}
// Export it
export default handler;
```

### Type plugin
I've made the full plugin type (maybe?) available in the file [types/pluginType.ts](types/pluginType.ts)
What will be seen:
```typescript
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
  isBans?: boolean;
  delay?(angka: number): Promise<void>;
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
```

If you have questions or encounter problems or bugs, please visit the [issue](https://github.com/OhMyDitzzy/Yuki/issues) page.

## License & Contributing
This script is distributed under the [MIT license.](LICENSE) Feel free to use, modify, or redistribute it. I would be greatly appreciated if you could help me!