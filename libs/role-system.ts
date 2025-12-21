/**
 * Staff role types
 */
export enum StaffRole {
  OWNER = 'owner',
  MODERATOR = 'moderator',
  ADMIN = 'admin'
}

/**
 * Get staff role with emoji
 */
function getStaffRoleDisplay(staffRole: StaffRole | null): string | null {
  if (!staffRole) return null;

  const staffRoles = {
    [StaffRole.OWNER]: '⚜️ Supreme Creator',
    [StaffRole.MODERATOR]: '⭐ Keeper of Order',
    [StaffRole.ADMIN]: '🛡️ Guardian'
  };

  return staffRoles[staffRole] || null;
}

/**
 * Get player role based on level
 */
function getPlayerRole(level: number): string {
  if (level >= 1 && level <= 5) return '🌱 Novice';
  if (level >= 6 && level <= 15) return '⚔️ Apprentice';
  if (level >= 16 && level <= 30) return '🛡️ Warrior';
  if (level >= 31 && level <= 50) return '🏅 Elite Knight';
  if (level >= 51 && level <= 75) return '🎖️ Veteran';
  if (level >= 76 && level <= 100) return '👑 Champion';
  if (level >= 101 && level <= 150) return '🔱 Master';
  if (level >= 151 && level <= 200) return '💎 Grandmaster';
  if (level >= 201 && level <= 300) return '⚡ Epic Hero';
  if (level >= 301 && level <= 400) return '🌟 Legend';
  if (level >= 401 && level <= 500) return '🔮 Mythic Sage';
  if (level >= 501 && level <= 600) return '🌌 Immortal';
  if (level >= 601 && level <= 700) return '✨ Celestial Being';
  if (level >= 701 && level <= 800) return '🔥 Divine Warrior';
  if (level >= 801 && level <= 900) return '🌠 Transcendent';
  if (level >= 901 && level <= 1000) return '☄️ Eternal';
  if (level >= 1001 && level <= 1200) return '🌀 God Slayer';
  if (level >= 1201 && level <= 1500) return '💫 Primordial';
  if (level >= 1501) return '🎆 Omnipotent';

  return '❓ Unknown Entity';
}

/**
 * Get complete role display
 * Format: "[Staff Role] | [Player Role]" or just "[Player Role]"
 * 
 * @param user - User object
 * @param level - User level
 * @returns Complete role string
 */
export function getCompleteRole(user: any, level: number): string {
  const playerRole = getPlayerRole(level);
  const staffRole = user.staffRole ? getStaffRoleDisplay(user.staffRole) : null;

  if (staffRole) {
    return `${staffRole} | ${playerRole}`;
  }

  return playerRole;
}

/**
 * Assign staff role to user
 * Call this when detecting owner/moderator/admin
 * 
 * @param user - User object
 * @param staffRole - Staff role type
 */
export function assignStaffRole(user: any, staffRole: StaffRole): void {
  user.staffRole = staffRole;
  user.moderator = true; // Keep for backward compatibility
}

/**
 * Remove staff role from user
 * 
 * @param user - User object
 */
export function removeStaffRole(user: any): void {
  user.staffRole = null;
  user.moderator = false;
}

/**
 * Check if user has staff role
 * 
 * @param user - User object
 * @returns Boolean
 */
export function isStaff(user: any): boolean {
  return user.staffRole !== null && user.staffRole !== undefined;
}

/**
 * Update user role
 * 
 * @param user - User object
 * @param level - User level
 */
export function updateUserRole(user: any, level: number): void {
  user.role = getCompleteRole(user, level);
}
