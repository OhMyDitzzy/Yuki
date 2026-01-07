import { readFileSync } from "node:fs";
import { join } from "node:path";

let handler: any = m => m;
handler.all = async function(m: any) {
  global.doc = pickRandom([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/pdf"
  ]);

  try {
    const pkgPath = join(process.cwd(), "package.json");
    global.packageInfo = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    global.packageInfo = { version: "1.0.0" };
  }

  global.styles = (text: string) => styles(text);
}

export default handler;

function pickRandom(list: string[]) {
  return list[Math.floor(list.length * Math.random())];
}

function styles(text: string, style = 1) {
  var xStr = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
  var yStr = Object.freeze({
    1: "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘqʀsᴛᴜᴠᴡxʏᴢ1234567890",
  });

  var replacer = [];
  xStr.map((v, i) => replacer.push({
    original: v,
    convert: yStr[style].split('')[i]
  }));

  var str = text.toLowerCase().split('');
  var output = [];

  str.map(v => {
    const find = replacer.find(x => x.original == v);
    find ? output.push(find.convert) : output.push(v);
  });

  return output.join('');
}
