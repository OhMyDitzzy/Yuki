// before: Runs BEFORE any command is executed
// Useful for: preprocessing, validation, middleware operations
// Return true to continue execution, false to stop
let handler: any = m => m;

handler.before = function(m) {
  // Example: Update user data before command execution
  let user = global.db.data.users[m.sender];
  
  // Skip if bot is in self mode
  if (opts["self"]) return false;
  
  // Skip if user doesn't exist
  if (!user) return false;
  
  // Perform pre-processing task (e.g., update user role)
  updateUserRole(user, user.level);
  
  // Return true to allow command execution to continue
  // Return false to stop further processing
  return true;
}

export default handler;