import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["list"],
  exec: async (m, { conn }) => {
    // List menu with sections
    await conn!!.sendList(
      m.chat,
      "Select an option from the menu below", // Main text
      "Click Here", // Button text to open list
      [
        {
          title: "Category 1", // Section title
          rows: [
            {
              title: "Option 1",
              description: "Description for option 1",
              id: "opt_1"
            },
            {
              title: "Option 2",
              description: "Description for option 2",
              id: "opt_2"
            }
          ]
        },
        {
          title: "Category 2",
          rows: [
            {
              title: "Option 3",
              description: "Description for option 3",
              id: "opt_3"
            }
          ]
        }
      ],
      m,
      {
        footer: "List menu example",
        title: "Main Menu"
      }
    );
  }
};

export default handler;