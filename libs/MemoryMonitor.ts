import type { CleanupManager } from './cleanupManager';
import os from 'os';
import Table from 'cli-table3';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

interface MonitorConfig {
  checkIntervalMs: number;
  baselineDelayMs: number;
  snapshotHistorySize: number;
  cooldownMs: number;
  thresholds: {
    heapAbsoluteMB: number;
    heapPercentOfTotal?: number;
    rssPercentOfSystemRAM: number;
    growthAbsoluteMB?: number;
    growthPercentage?: number;
  };
}

export class MemoryMonitor {
  private baseline: MemorySnapshot | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private snapshots: MemorySnapshot[] = [];
  private lastWarningTime = 0;
  private isInitPhase = true;
  private startTime: number;

  private readonly systemRAM: number;
  private readonly config: MonitorConfig;

  constructor(
    private logger: any,
    private cleanupManager: CleanupManager,
    customConfig?: Partial<MonitorConfig>
  ) {
    this.systemRAM = os.totalmem();
    this.startTime = Date.now();

    this.config = {
      checkIntervalMs: 60000,
      baselineDelayMs: 120000,
      snapshotHistorySize: 10,
      cooldownMs: 300000,
      thresholds: {
        heapAbsoluteMB: 500,
        heapPercentOfTotal: 0.85,
        rssPercentOfSystemRAM: 0.5,
        growthAbsoluteMB: 200,
        growthPercentage: 2.0,
      },
      ...customConfig
    };
  }

  start(intervalMs?: number): void {
    const checkInterval = intervalMs || this.config.checkIntervalMs;

    setTimeout(() => {
      this.baseline = this.captureSnapshot();
      this.isInitPhase = false;
      this.logger.info(
        `📊 Memory baseline set: Heap ${this.formatMB(this.baseline.heapUsed)} | ` +
        `RSS ${this.formatMB(this.baseline.rss)}`
      );
    }, this.config.baselineDelayMs);

    this.checkInterval = setInterval(() => {
      this.check();
    }, checkInterval);

    this.cleanupManager.addInterval(this.checkInterval);

    this.logger.info(
      `Memory Monitor started (checks every ${checkInterval / 1000}s, ` +
      `baseline in ${this.config.baselineDelayMs / 1000}s)`
    );
  }

  private captureSnapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external
    };
  }

  private formatMB(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  }

  private formatPercentage(value: number, total: number): string {
    return `${((value / total) * 100).toFixed(2)}%`;
  }

  private getHeapStatusIcon(heapUsed: number, heapTotal: number): string {
    const percentage = (heapUsed / heapTotal) * 100;

    // Heap 100% is normal, what is dangerous is if it remains at 100% + continues to grow
    if (percentage >= 98) return '🟡';
    if (percentage >= 80) return '🟢';
    return '⚪';
  }

  private getRSSStatusIcon(rss: number, systemRAM: number): string {
    const percentage = (rss / systemRAM) * 100;

    if (percentage >= 80) return '🔴';
    if (percentage >= 60) return '🟡';
    if (percentage >= 40) return '🟢';
    return '⚪';
  }

  displayMemoryTable(): void {
    const snapshot = this.captureSnapshot();
    const systemRAMGB = this.systemRAM / 1024 / 1024 / 1024;
    const uptimeMin = Math.floor((Date.now() - this.startTime) / 60000);
    const trend = this.getTrend();

    const safeHeapTotal = Math.max(snapshot.heapTotal, snapshot.heapUsed);
    const heapPercent = (snapshot.heapUsed / safeHeapTotal) * 100;
    const heapIcon = this.getHeapStatusIcon(heapPercent, safeHeapTotal);

    const rssPercent = (snapshot.rss / this.systemRAM) * 100;
    const rssIcon = this.getRSSStatusIcon(rssPercent, this.systemRAM);

    const table = new Table({
      head: ['Metric', 'Used', 'Total', 'Percentage', 'Status'],
      colWidths: [20, 15, 15, 15, 10],
      style: {
        head: ['cyan', 'bold'],
        border: ['gray']
      }
    });

    table.push(
      ['Heap Memory',
        this.formatMB(snapshot.heapUsed),
        this.formatMB(safeHeapTotal),
        this.formatPercentage(snapshot.heapUsed, safeHeapTotal),
        heapIcon
      ],
      ['RSS Memory',
        this.formatMB(snapshot.rss),
        `${systemRAMGB.toFixed(2)}GB`,
        this.formatPercentage(snapshot.rss, this.systemRAM),
        rssIcon
      ],
      ['External Memory',
        this.formatMB(snapshot.external),
        '-',
        '-',
        '⚪'
      ]
    );

    console.log('\n📊 Memory Statistics');
    console.log(table.toString());

    const infoTable = new Table({
      head: ['Info', 'Value'],
      colWidths: [25, 30],
      style: {
        head: ['green', 'bold'],
        border: ['gray']
      }
    });

    infoTable.push(
      ['Uptime', `${uptimeMin} minutes`],
      ['Memory Trend', trend.toUpperCase()],
      ['System RAM', `${systemRAMGB.toFixed(2)} GB`],
      ['Baseline Set', this.baseline ? 'Yes' : 'No (Initializing)']
    );

    if (this.baseline) {
      const growthBytes = snapshot.heapUsed - this.baseline.heapUsed;
      const growthMB = growthBytes / 1024 / 1024;
      const growthRate = ((snapshot.heapUsed / this.baseline.heapUsed - 1) * 100).toFixed(2);

      infoTable.push(
        ['Growth from Baseline', `${growthMB > 0 ? '+' : ''}${growthMB.toFixed(2)}MB (${growthRate}%)`]
      );
    }

    console.log(infoTable.toString());
    console.log('');
  }

  private check(): void {
    const snapshot = this.captureSnapshot();

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.config.snapshotHistorySize) {
      this.snapshots.shift();
    }

    if (this.isInitPhase) {
      return;
    }

    const heapUsedMB = snapshot.heapUsed / 1024 / 1024;
    const heapTotalMB = snapshot.heapTotal / 1024 / 1024;
    const rssMB = snapshot.rss / 1024 / 1024;
    const externalMB = snapshot.external / 1024 / 1024;
    const systemRAMGB = this.systemRAM / 1024 / 1024 / 1024;

    const warnings: string[] = [];

    if (heapUsedMB > this.config.thresholds.heapAbsoluteMB) {
      warnings.push(
        `High heap usage: ${this.formatMB(snapshot.heapUsed)} ` +
        `(threshold: ${this.config.thresholds.heapAbsoluteMB}MB)`
      );
    }

    const safeHeapTotal = Math.max(snapshot.heapTotal, snapshot.heapUsed);
    const heapPercent = snapshot.heapUsed / safeHeapTotal;

    if (heapPercent > this.config.thresholds.heapPercentOfTotal!!) {
      warnings.push(
        `Heap pressure: ${(heapPercent * 100).toFixed(1)}% of total ` +
        `(threshold: ${this.config.thresholds.heapPercentOfTotal!! * 100}%)`
      );
    }

    const rssPercent = snapshot.rss / this.systemRAM;
    if (rssPercent > this.config.thresholds.rssPercentOfSystemRAM) {
      warnings.push(
        `High RSS: ${this.formatMB(snapshot.rss)} ` +
        `(${(rssPercent * 100).toFixed(1)}% of ${systemRAMGB.toFixed(1)}GB RAM, ` +
        `threshold: ${this.config.thresholds.rssPercentOfSystemRAM * 100}%)`
      );
    }

    if (this.baseline) {
      const growthBytes = snapshot.heapUsed - this.baseline.heapUsed;
      const growthMB = growthBytes / 1024 / 1024;
      const baselineHeapMB = this.baseline.heapUsed / 1024 / 1024;
      const growthRate = snapshot.heapUsed / this.baseline.heapUsed;

      if (
        growthMB > this.config.thresholds.growthAbsoluteMB!! &&
        growthRate > this.config.thresholds.growthPercentage!!
      ) {
        warnings.push(
          `Suspected memory leak: +${growthMB.toFixed(2)}MB ` +
          `(${((growthRate - 1) * 100).toFixed(0)}% growth) ` +
          `from baseline ${this.formatMB(this.baseline.heapUsed)}`
        );
      }
    }

    if (warnings.length > 0) {
      const now = Date.now();
      if (now - this.lastWarningTime > this.config.cooldownMs) {
        this.logger.warn(`⚠️ Memory Issues Detected:\n${warnings.map(w => `  - ${w}`).join('\n')}`);
        this.lastWarningTime = now;

        if (global.gc) {
          this.logger.info('💡 Consider running forceGC() to free memory');
        }
      }
    }

    if (Math.random() < 0.1) {
      const uptimeMin = Math.floor((Date.now() - this.startTime) / 60000);
      this.logger.info(
        `📊 Memory (${uptimeMin}m uptime): ` +
        `Heap ${this.formatMB(snapshot.heapUsed)}/${this.formatMB(safeHeapTotal)} ` +
        `(${(heapPercent * 100).toFixed(1)}%) | ` +
        `RSS ${this.formatMB(snapshot.rss)} | ` +
        `External ${this.formatMB(snapshot.external)}`
      );
    }
  }

  getTrend(): 'stable' | 'growing' | 'shrinking' | 'unknown' {
    if (this.snapshots.length < 3) return 'unknown';

    const recent = this.snapshots.slice(-5);
    const oldest = recent[0]!!.heapUsed;
    const newest = recent[recent.length - 1]!!.heapUsed;
    const diffPercent = ((newest - oldest) / oldest) * 100;

    if (Math.abs(diffPercent) < 5) return 'stable';
    return diffPercent > 0 ? 'growing' : 'shrinking';
  }

  forceGC(): void {
    if (!Bun.gc) {
      this.logger.warn('GC not exposed. Run with --expose-gc flag to enable.');
      return;
    }

    const before = process.memoryUsage().heapUsed;
    const beforeMB = before / 1024 / 1024;

    this.logger.info(`🗑️ Forcing GC (heap: ${this.formatMB(before)})...`);

    Bun.gc(true);

    const after = process.memoryUsage().heapUsed;
    const afterMB = after / 1024 / 1024;
    const freed = before - after;
    const freedMB = freed / 1024 / 1024;

    if (freed > 0) {
      this.logger.info(
        `✅ GC freed ${this.formatMB(freed)} ` +
        `(${beforeMB.toFixed(2)}MB → ${afterMB.toFixed(2)}MB)`
      );

      if (freedMB > 100) {
        this.baseline = this.captureSnapshot();
        this.logger.info('📊 Baseline reset after major GC');
      }
    } else {
      this.logger.info('ℹ️ GC completed, no significant memory freed');
    }
  }

  getDetailedStats(): {
    current: MemorySnapshot;
    baseline: MemorySnapshot | null;
    trend: string;
    uptime: number;
    systemRAM: number;
  } {
    return {
      current: this.captureSnapshot(),
      baseline: this.baseline,
      trend: this.getTrend(),
      uptime: Date.now() - this.startTime,
      systemRAM: this.systemRAM
    };
  }

  getStats(): string {
    const mem = process.memoryUsage();
    const trend = this.getTrend();
    const uptimeMin = Math.floor((Date.now() - this.startTime) / 60000);

    return (
      `Heap: ${this.formatMB(mem.heapUsed)}/${this.formatMB(mem.heapTotal)} | ` +
      `RSS: ${this.formatMB(mem.rss)} | ` +
      `External: ${this.formatMB(mem.external)} | ` +
      `Trend: ${trend} | ` +
      `Uptime: ${uptimeMin}m`
    );
  }

  getRawStats(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  updateThresholds(newThresholds: Partial<MonitorConfig['thresholds']>): void {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...newThresholds
    };
    this.logger.info(`Updated memory thresholds: ${JSON.stringify(this.config.thresholds)}`);
  }
}
