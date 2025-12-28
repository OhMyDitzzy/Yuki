// all: Runs for EVERY message received (before any command processing)
// Useful for: global settings, message logging, auto-responses
let handler: any = m => m;

handler.all = async function(m: any) {
  // Example 1: Set random document type for all messages
  global.doc = pickRandom([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/pdf"
  ]);
  
  // Example 2: Log all incoming messages
  if (m.text) {
    console.log(`[${m.chat}] ${m.name}: ${m.text}`);
  }
  
  // Example 3: Auto-response for specific keywords
  if (m.text?.toLowerCase().includes("bot")) {
    // Don't await - let it run in background
    m.reply("Yes? You called me?");
  }
  
  // Example 4: Update user activity timestamp
  if (global.db.data.users[m.sender]) {
    global.db.data.users[m.sender].lastSeen = Date.now();
  }
};

export default handler;

function pickRandom(list: string[]) {
  return list[Math.floor(list.length * Math.random())];
}