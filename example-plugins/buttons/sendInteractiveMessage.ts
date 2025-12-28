import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["interactive"],
  exec: async (m, { conn }) => {
    // Most flexible button type with various media support
    // This method will be removed in the future, Use sendButtonV2 instead
    await conn!!.sendInteractiveMessage(
      m.chat,
      {
        text: "This is an interactive message",
        footer: "Interactive footer",
        title: "Interactive Title",
        subtitle: "Interactive subtitle",
        image: "https://example.com/image.jpg", // Optional image
        // video: "https://example.com/video.mp4", // Optional video
        // document: Buffer.from(...), // Optional document
        interactiveButtons: [
          {
            name: "quick_reply", // Button type
            buttonParamsJson: JSON.stringify({
              display_text: "Quick Reply 1",
              id: "qr_1"
            })
          },
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "Quick Reply 2",
              id: "qr_2"
            })
          },
          {
            name: "cta_url", // Call-to-action URL button
            buttonParamsJson: JSON.stringify({
              display_text: "Visit Website",
              url: "https://example.com"
            })
          }
        ]
      },
      {
        useAI: false // Optional: use AI features
      }
    );
  }
};

export default handler;