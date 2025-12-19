<div align="center">
    
<img src="https://files.catbox.moe/7n4axc.png" alt="Yuki Banner" />
    
<h1 align="center">Yuki Souo</h1>

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
<img src="https://img.shields.io/static/v1?label=speed&message=super+fast&color=success" alt="Yuki Speed" />

Yuki is a modern and sophisticated open-source WhatsApp bot script that is fast and memory leak-proof. Yuki also runs exclusively for [Bun](https://bun.com) and is free to modify and redistribute at <code>no cost.</code>
    
</div>

---

## Features
- [x] Pairing Code
- [x] Serializer system
- [x] Fully types for Serializer
- [x] Plugin based system
- [x] Interactive message support
- [ ] Case system

> [!NOTE]
> I didn't do fully typed for some of the code, 
> Because it was very tiring, so I decided to 
> Relaxing TypeScript rules.

## Installation
You'll need to clone this repository. However, [Bun](https://bun.com) must be installed on your computer.
1. First step is clone the repository:
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
I've made the full plugin type (maybe?) available in the file [types/pluginType.ts](types/pluginType.ts).
If you have questions or encounter problems or bugs, please visit the [issue](https://github.com/OhMyDitzzy/Yuki/issues) page.

## License & Contributing
This script is distributed under the [MIT license.](LICENSE) Feel free to use, modify, or redistribute it. I would be greatly appreciated if you could help me!