/**
 * Calculate Dynamic XP (Hybrid System)
 * Optimized for multiplier = 100, level cap = 1000
 * 
 * @param baseXP - Base XP from plugin (default: 50)
 * @param userLevel - Current user level
 * @returns Earned XP amount
 */
export function calculateDynamicXP(baseXP: number, userLevel: number): number {
  let multiplier = 1.0;
  
  if (userLevel < 100) {
    if (userLevel >= 75) multiplier = 3.5;
    else if (userLevel >= 50) multiplier = 3.0;
    else if (userLevel >= 30) multiplier = 2.5;
    else if (userLevel >= 15) multiplier = 2.0;
    else if (userLevel >= 5) multiplier = 1.5;
  } else {
    multiplier = 4.0 + ((userLevel - 100) / 25);
    multiplier = Math.min(multiplier, 40);
  }
  
  return Math.floor(baseXP * multiplier);
}

/**
 * Get XP multiplier info for display
 * 
 * @param userLevel - Current user level
 * @returns Multiplier value
 */
export function getXPMultiplier(userLevel: number): number {
  const baseXP = 50;
  const earnedXP = calculateDynamicXP(baseXP, userLevel);
  return Math.round((earnedXP / baseXP) * 10) / 10;
}

/**
 * Calculate next milestone
 * 
 * @param userLevel - Current user level
 * @returns Next milestone level and XP gain
 */
export function getNextMilestone(userLevel: number): { level: number; xpGain: number } {
  const milestones = [5, 15, 30, 50, 75, 100, 200, 300, 500, 750, 1000];
  const baseXP = 50;
  
  for (const milestone of milestones) {
    if (userLevel < milestone) {
      return {
        level: milestone,
        xpGain: calculateDynamicXP(baseXP, milestone)
      };
    }
  }
  
  return { level: 1000, xpGain: calculateDynamicXP(baseXP, 1000) };
}