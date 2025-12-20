interface XPRange {
  min: number;
  max: number;
  xp: number;
}

interface LevelingSystem {
  growth: number;
  xpRange(level: number, multiplier?: number): XPRange;
  findLevel(xp: number, multiplier?: number): number;
  canLevelUp(level: number, xp: number, multiplier?: number): boolean;
}

const levelingSystem: LevelingSystem = {
  /**
   * Growth rate
   * `2.576652002695681`
   */
  growth: Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75,

  /**
   * Get XP range at specified level
   * @param level - The current level
   * @param multiplier - XP multiplier (default: global.multiplier or 1)
   */
  xpRange(level: number, multiplier: number = (global as any).multiplier || 1): XPRange {
    if (level < 0) throw new TypeError('level cannot be negative value');
    level = Math.floor(level);
    const min = level === 0 ? 0 : Math.round(Math.pow(level, this.growth) * multiplier) + 1;
    const max = Math.round(Math.pow(++level, this.growth) * multiplier);
    return {
      min,
      max,
      xp: max - min
    };
  },

  /**
   * Get level by XP
   * @param xp - The current XP amount
   * @param multiplier - XP multiplier (default: global.multiplier or 1)
   */
  findLevel(xp: number, multiplier: number = (global as any).multiplier || 1): number {
    if (xp === Infinity) return Infinity;
    if (isNaN(xp)) return NaN;
    if (xp <= 0) return -1;
    let level = 0;
    do level++;
    while (this.xpRange(level, multiplier).min <= xp);
    return --level;
  },

  /**
   * Check if able to level up
   * @param level - The current level
   * @param xp - The current XP amount
   * @param multiplier - XP multiplier (default: global.multiplier or 1)
   */
  canLevelUp(level: number, xp: number, multiplier: number = (global as any).multiplier || 1): boolean {
    if (level < 0) return false;
    if (xp === Infinity) return true;
    if (isNaN(xp)) return false;
    if (xp <= 0) return false;
    return level <= this.findLevel(xp, multiplier);
  }
};

export default levelingSystem;
