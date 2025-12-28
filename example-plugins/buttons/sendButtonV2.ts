import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["btnv2"],
  exec: async (m, { conn }) => {
    // Advanced buttons with multiple types
    // You can set up your buttons from scratch.
    await conn!!.sendButtonV2(
      m.chat,
      {
        body: { text: "Choose an action" }, // Main body text
        footer: { text: "Button V2 Example" }, // Footer text
        header: { 
          title: "Welcome!", // Header title
          hasMediaAttachment: false 
        }
      },
      [
        {
          type: "buttons", // Regular button
          text: "Click Me",
          id: "regular_btn"
        },
        {
          type: "url", // URL button (opens link)
          text: "Visit Website",
          url: "https://example.com"
        },
        {
          type: "copy", // Copy button (copies text to clipboard)
          text: "Copy Code",
          copy_code: "ABC123XYZ"
        },
        {
          type: "reminder", // Reminder button (this is no longer works)
          text: "Set Reminder",
          id: "reminder_1"
        }
      ], { quoted: m } as any
    );
  }
};

export default handler;