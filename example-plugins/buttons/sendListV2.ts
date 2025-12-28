import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["listv2"],
  exec: async (m, { conn }) => {
    // Advanced list menu V2
    await conn!!.sendListV2(
      m.chat,
      {
        body: { text: "Select from options below" },
        footer: { text: "List V2 Example" },
        header: {
          title: "Advanced Menu",
          hasMediaAttachment: false
        }
      },
      {
        title: "Menu Options", // List title
        sections: [
          {
            title: "Main Section", // Section title
            highlight_label: "Popular", // Highlighted label (optional)
            rows: [
              {
                header: "Featured", // Row header (optional)
                title: "Premium Option",
                description: "This is a premium feature",
                id: "premium_opt"
              },
              {
                title: "Standard Option",
                description: "This is a standard feature",
                id: "standard_opt"
              }
            ]
          },
          {
            title: "Other Section",
            rows: [
              {
                title: "Another Option",
                description: "Additional feature",
                id: "other_opt"
              }
            ]
          }
        ]
      }, { quoted: m } as any
    );
  }
};

export default handler;