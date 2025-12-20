import { updateUserRole } from "libs/role-system";

let handler: any = m => m;

handler.before = function(m) {
  let user = global.db.data.users[m.sender];

  updateUserRole(user, user.level);

  return true;
}

export default handler;
