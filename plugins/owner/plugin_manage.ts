import type { PluginHandler } from "@yuki/types";
import fs from "node:fs";
import ts from "typescript";

function checkTsSyntax(code: string, fileName: string) {
  const result = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
    reportDiagnostics: true,
  });

  return result.diagnostics ?? [];
}

let handler: PluginHandler = {
  cmd: ["sf", "df", "enable", "disable"],
  rowner: true,
  usePrefix: false,
  exec: async (m, { conn, command, usedPrefix, text }) => {
    if (!text) throw `*• Example:* ${usedPrefix + command!!} *[filename]*`;
    
    if (command === "sf") {
      if (!m.quoted) throw `*Reply your code*`;

      let filePath = `plugins/${text}.ts`;
      let dir = filePath.split("/").slice(0, -1).join("/");

      const code = m.quoted.text;
      const diagnostics = checkTsSyntax(code, filePath);

      if (diagnostics.length) {
        const codeLines = code.split("\n");
        
        const errors = diagnostics
          .map((d, idx) => {
            const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
            
            if (d.file && d.start !== undefined) {
              const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
              const errorLine = codeLines[line] || "";
              const pointer = " ".repeat(character) + "^";
              
              return (
                `Error #${idx + 1}:\n` +
                `Line ${line + 1}:${character + 1} - ${message}\n\n` +
                `${line + 1} | ${errorLine}\n` +
                `    ${pointer}`
              );
            }
            
            return `Error #${idx + 1}: ${message}`;
          })
          .join("\n\n");

        return m.reply(
          `❌ *Syntax Error Detected!*\n\n` +
          `Cannot save file due to syntax errors:\n\n` +
          `\`\`\`\n${errors}\n\`\`\``
        );
      }

      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, code);

      let key = await conn!!.sendMessage(
        m.chat,
        { text: "Saving code..." },
        { quoted: m },
      );

      await conn!!.sendMessage(
        m.chat,
        {
          text: `✅ Code successfully saved!\n📁 Path: \`${filePath}\``,
          edit: key!.key,
        },
        { quoted: m },
      );
      
    } else if (command === "df") {
      let path = `plugins/${text}.ts`;
      
      let key = await conn!!.sendMessage(
        m.chat,
        { text: "Deleting code..." },
        { quoted: m },
      );
      
      if (!fs.existsSync(path)) {
        return conn!!.sendMessage(
          m.chat,
          { text: `❌ I can't find the code`, edit: key!!.key },
          { quoted: m },
        );
      }
      
      fs.unlinkSync(path);
      
      await conn!!.sendMessage(
        m.chat,
        { text: `✅ Successfully deleted file\n📁 Path: \`${path}\``, edit: key!!.key },
        { quoted: m },
      );
      
    } else if (command === "enable") {
      let path = `plugins/${text}.ts`;
  
      if (!fs.existsSync(path)) {
        return m.reply(`❌ Plugin not found: \`${path}\``);
      }
  
      let code = fs.readFileSync(path, "utf-8");  
      code = code.replace(/^\s*disabled:\s*(true|false),?\s*\n/gm, "");  
      code = code.replace(/(\n\s*\n)\s*\n+/g, "\n");
  
      fs.writeFileSync(path, code);
  
      await m.reply(`✅ Plugin enabled!\n📁 Path: \`${path}\``);      
    } else if (command === "disable") {
      let path = `plugins/${text}.ts`;
      
      if (!fs.existsSync(path)) {
        return m.reply(`❌ Plugin not found: \`${path}\``);
      }
      
      let code = fs.readFileSync(path, "utf-8");
      
      code = code.replace(/^\s*disabled:\s*(true|false),?\s*$/gm, "");
      
      code = code.replace(/\n\s*\n\s*\n/g, "\n\n");
      
      code = code.replace(
        /^(\s*)(cmd:\s*(?:\[|\/|"))/gm,
        "$1disabled: true,\n$1$2"
      );
      
      fs.writeFileSync(path, code);
      
      await m.reply(`✅ Plugin disabled!\n📁 Path: \`${path}\``);
    }
  }
};

export default handler;