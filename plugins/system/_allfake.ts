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
}

export default handler;

function pickRandom(list: string[]) {
  return list[Math.floor(list.length * Math.random())];
}
