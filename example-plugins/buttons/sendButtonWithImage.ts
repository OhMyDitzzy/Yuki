import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["btnimg"],
  exec: async (m, { conn }) => {
    // Button with image attachment
    await conn!!.sendButtonWithImage(
      m.chat,
      "https://example.com/image.jpg", // Image URL or Buffer
      "This is the caption for the image", // Caption text
      [
        {
          id: "like",
          displayText: "👍 Like"
        },
        {
          id: "share",
          displayText: "📤 Share"
        }
      ],
      m,
      {
        footer: "Image button example"
      }
    );
  }
};

export default handler;