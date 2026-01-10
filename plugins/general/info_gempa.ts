import type { PluginHandler } from "@yuki/types"

const handler: PluginHandler = {
  name: "Info Gempa",
  description: "Check Indonesian earthquake information",
  tags: ["public"],
  cmd: ["infogempa"],
  exec: async (m, { conn }) => {
    try {
      const link = 'https://data.bmkg.go.id/DataMKG/TEWS/';
      let res = await fetch(link+'autogempa.json');
      let anu = await res.json();
      anu = anu.Infogempa.gempa;
      let txt = `*${anu.Wilayah}*\n\n`
		txt += `Tanggal : ${anu.Tanggal}\n`
		txt += `Waktu : ${anu.Jam}\n`
		txt += `Potensi : *${anu.Potensi}*\n\n`
		txt += `Magnitude : ${anu.Magnitude}\n`
		txt += `Kedalaman : ${anu.Kedalaman}\n`
		txt += `Koordinat : ${anu.Coordinates}${anu.Dirasakan.length > 3 ? `\nDirasakan : ${anu.Dirasakan}` : ''}`
		await conn.sendMessage(m.chat, { image: { url: link+anu.Shakemap }, caption: txt }, { quoted: m });
    } catch (e) {
      console.error(e);
      conn.error(m, e)
    }
  }
}

export default handler;