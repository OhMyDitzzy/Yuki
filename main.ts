import "./config"
import { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState, type UserFacingSocketConfig } from 'baileys';
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import pino from 'pino';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import yargs from "yargs";
import { makeWASocket, serialize, protoType } from './libs/serialize';
import chalk from "chalk";
import ts from "typescript";
import chokidar, { FSWatcher, type ChokidarOptions } from "chokidar";
import cp from "node:child_process";
import crypto from 'node:crypto';
import { commandCache } from "./libs/commandCache";
import { yukiKeepMatcher, yukiKeepParser } from "libs/yukiKeepParser";
import { CleanupManager } from "libs/cleanupManager";
import { MemoryMonitor } from "libs/MemoryMonitor";

function filename(metaUrl = import.meta.url) {
  return fileURLToPath(metaUrl)
}

function dirname(metaUrl = import.meta.url) {
  return path.dirname(filename(metaUrl))
}

global.__dirname = dirname();

serialize();
protoType();

global.commandCache = commandCache;
global.API = (name: any, path = '/', query = {}, apikeyqueryname: any) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}) })) : '')

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[' + (opts['prefix'] || '‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']')

global.db = new Low(new JSONFile("data/database.json"));
global.loadDatabase = async function loadDatabase() {
  if (db.READ) return new Promise((resolve) => setInterval(async function() {
    if (!db.READ) {
      clearInterval(this)
      resolve(db.data == null ? global.loadDatabase() : db.data)
    }
  }, 1 * 1000))
  if (db.data !== null) return
  db.READ = true
  await db.read().catch(console.error)
  db.READ = null
  db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    ...(db.data || {})
  }
}
loadDatabase()


const { state, saveCreds } = await useMultiFileAuthState("Yuki");
const connOptions: UserFacingSocketConfig = {
  logger: pino({ level: "fatal" }),
  browser: Browsers.macOS("Safari"),
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino().child({
      level: 'silent',
      stream: 'store'
    })),
  },
  generateHighQualityLinkPreview: true,
}

global.conn = makeWASocket(connOptions);
conn.isInit = false

const cleanupManager = new CleanupManager();
const memoryMonitor = new MemoryMonitor(conn.logger, cleanupManager, {
  baselineDelayMs: 180000,
  thresholds: {
    heapAbsoluteMB: 800,
    rssPercentOfSystemRAM: 0.6,

  }
});

memoryMonitor.start(60000);

memoryMonitor.updateThresholds({
  heapAbsoluteMB: 1000
});

cleanupManager.addCleanupHandler(async () => {
  if (global.db && global.db.data) {
    conn.logger.info('Saving database before shutdown...');
    await global.db.write().catch(console.error);
  }
});


if (!conn.authState.creds.registered) {
  console.warn(chalk.yellow("Processing pairing code, wait a moment..."));
  setTimeout(async () => {
    let code = await conn.requestPairingCode(global.pairing, "DITZDEVS") // set pairing code here
    code = code?.match(/.{1,4}/g)?.join('-') || code
    console.log(chalk.black(chalk.bgGreen(`Your pairing code : `)), chalk.black(chalk.white(code)))
  }, 3000)
}

if (!opts["test"]) {
  const dbSaveInterval = setInterval(async () => {
    if (global.db.data) await global.db.write().catch(console.error);
  }, 2000);

  cleanupManager.addInterval(dbSaveInterval);
}

if (!opts["test"]) {
  const tmpPath = path.join(process.cwd(), "tmp");
  const yukiKeepPath = path.join(tmpPath, ".yuki_keep");

  let cleanupInterval: NodeJS.Timeout | null = null;
  let configWatcher: FSWatcher | null = null;
  const cleanupMemory = () => {
    yukiKeepParser.clearCache();
    yukiKeepMatcher.clearCache();
  };
  const startCleanup = () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    const config = yukiKeepParser.parse(yukiKeepPath);

    if (!config.enabled) return;

    cleanupInterval = setInterval(async () => {
      try {
        const currentConfig = yukiKeepParser.parse(yukiKeepPath);

        if (!currentConfig.enabled) return;

        if (!fs.existsSync(tmpPath)) return;

        const files = fs.readdirSync(tmpPath);
        if (files.length === 0) return;

        let deletedCount = 0;
        let keptCount = 0;
        let deletedSize = 0;

        const results = await Promise.allSettled(
          files.map(async (file: string) => {
            if (file === '.yuki_keep') {
              keptCount++;
              return;
            }

            const filePath = path.join(tmpPath, file);

            try {
              if (yukiKeepMatcher.shouldKeep(file, filePath, currentConfig.keepRules)) {
                keptCount++;
                return;
              }

              if (yukiKeepMatcher.shouldDelete(file, filePath, currentConfig.deleteRules)) {
                const stats = fs.statSync(filePath);
                const fileSize = stats.size;

                await fs.promises.rm(filePath, { recursive: true, force: true });
                deletedCount++;
                deletedSize += fileSize;
              } else {
                keptCount++;
              }
            } catch (err) {
              conn.logger.error(`Failed to process ${file}: ${err}`);
            }
          })
        );

        const formatSize = (bytes: number): string => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
        };

        if (deletedCount > 0 || keptCount > 0) {
          conn.logger.info(
            `Yuki Keep: ${deletedCount} deleted (${formatSize(deletedSize)}), ${keptCount} kept`
          );
        }

        if (Math.random() < 0.1) {
          cleanupMemory();
        }
      } catch (e: any) {
        console.error(e)
      }
    }, config.interval * 60 * 1000);
  };

  if (fs.existsSync(tmpPath)) {
    configWatcher = chokidar.watch(yukiKeepPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    cleanupManager.addWatcher(configWatcher);

    configWatcher.on('change', () => {
      yukiKeepParser.clearCache();
      startCleanup();
    });

    configWatcher.on('add', () => {
      startCleanup();
    });

    configWatcher.on('unlink', () => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      startCleanup();
    });
  }

  startCleanup();
  cleanupManager.addCleanupHandler(() => {
    cleanupMemory();
  });
}

async function connectionUpdate(update: any) {
  const { receivedPendingNotifications, connection, lastDisconnect, isOnline, isNewLogin } = update;

  if (isNewLogin) {
    conn.isInit = true;
  }

  if (connection == 'connecting') {
    conn.logger.warn('Activating Bot, Please wait a moment...');
  } else if (connection == 'open') {
    conn.logger.info('✅ Connected');
  }

  if (isOnline == true) {
    conn.logger.info('Active Status');
  } else if (isOnline == false) {
    conn.logger.error('Dead Status');
  }

  if (receivedPendingNotifications) {
    conn.logger.warn('Waiting for New Messages');
  }

  if (connection == 'close') {
    conn.logger.error('Connection lost...');
  }

  if (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
    console.log(await global.reloadHandler(true));
  }

  if (global.db.data == null) {
    await global.loadDatabase();
  }
}

process.on("uncaughtException", console.error);
process.on("message", (msg) => {
  if (msg === "get_memory_stats") {
    memoryMonitor.displayMemoryTable();
  }
  if (msg === "force_garbage_collector") {
    memoryMonitor.forceGC();
  }
})

let isInit = true
let handler = await import('./handler')
global.reloadHandler = async function(restatConn: boolean) {
  try {
    const Handler = await import(`./handler.ts?update=${Date.now()}`).catch(console.error)
    if (Object.keys(Handler || {}).length) handler = Handler
  } catch (e) {
    console.error(e)
  }

  if (restatConn) {
    const oldChats = global.conn.chats
    try { global.conn.ws.close() } catch { }
    conn.ev.removeAllListeners("messages.upsert")
    global.conn = makeWASocket(connOptions, { chats: oldChats })
    isInit = true
  }

  if (!isInit) {
    conn.ev.off('messages.upsert', conn.handler)
    conn.ev.off('group-participants.update', conn.participantsUpdate)
    conn.ev.off('groups.update', conn.groupsUpdate)
    conn.ev.off('connection.update', conn.connectionUpdate)
    conn.ev.off('creds.update', conn.credsUpdate)
  }

  conn.handler = handler.handler.bind(global.conn)
  conn.connectionUpdate = connectionUpdate.bind(global.conn)
  conn.credsUpdate = saveCreds.bind(global.conn)
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn)
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn)

  conn.ev.on('messages.upsert', conn.handler)
  conn.ev.on('connection.update', conn.connectionUpdate)
  conn.ev.on('creds.update', conn.credsUpdate)
  conn.ev.on('group-participants.update', conn.participantsUpdate)
  conn.ev.on('groups.update', conn.groupsUpdate)
  isInit = false;
  return true
}

function getAllTsFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath)

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllTsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".ts")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

let pluginFolder = path.join(__dirname, "plugins");
let pluginFilter = (filename: string) => /\.ts$/.test(filename);
let tsFiles = getAllTsFiles(pluginFolder);
global.plugins = {}

for (let fullPath of tsFiles) {
  const filename = path.relative(pluginFolder, fullPath);

  try {
    const file = path.join(pluginFolder, filename);
    const module = await import(file)
    global.plugins[filename] = module.default || module;
  } catch (e) {
    console.error(`Failed to load plugins ${filename}: ${e}`);
    delete global.plugins[filename];
  }
}

commandCache.build(global.plugins)

conn.logger.info(`Loaded ${Object.keys(global.plugins).length} plugins...`);

function checkTsSyntax(code: string, fileName: string) {
  const result = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
    reportDiagnostics: true,
  });

  return result.diagnostics ?? [];
}

// Store file content hashes to detect actual content changes
// We use MD5 hashes instead of timestamps because
// Some editors don't update mtime on every save,
// File systems may have timestamp precision issues,
// and Content hash is more reliable for detecting real changes
const fileHashes = new Map<string, string>();
const pluginModules = new Map<string, any>();

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * In Bun with cluster setup, module caching is very aggressive.
 * Traditional dynamic import() with query strings doesn't bypass the cache.
 * So we use this approach:
 * - Read file content directly
 * - Check if content actually changed (via hash comparison)
 * - Transpile TypeScript to CommonJS
 * - Execute in isolated scope using Function constructor
 * 
 * Every time a change is made to this file, it is hash signed, so it remains safe from memory leaks.
 * 
 * This allows true hot reload without worker restart, making development
 * much faster and avoiding connection drops to WhatsApp.
 * https://github.com/oven-sh/bun/issues/14435
 */
global.reload = async (filename: string = "") => {
  if (!pluginFilter(filename)) return;

  const relPath = path.relative(pluginFolder, filename);
  const fullPath = path.resolve(filename);

  const exists = fs.existsSync(fullPath);

  if (!exists) {
    conn.logger.warn(`deleted plugin '${relPath}'`);
    delete global.plugins[relPath];
    fileHashes.delete(fullPath);
    pluginModules.delete(fullPath);
    commandCache.build(global.plugins);
    return;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const contentHash = hashContent(content);

  const lastHash = fileHashes.get(fullPath);
  if (lastHash === contentHash) {
    return;
  }

  fileHashes.set(fullPath, contentHash);
  conn.logger.info(`re-require plugin '${relPath}'`);

  const diagnostics = checkTsSyntax(content, fullPath);

  if (diagnostics.length) {
    const msg = diagnostics
      .map(d =>
        ts.flattenDiagnosticMessageText(d.messageText, "\n")
      )
      .join("\n");

    conn.logger.error(
      `syntax error while loading '${relPath}':\n${msg}`
    );

    delete global.plugins[relPath];
    return;
  }

  try {
    delete global.plugins[relPath];

    // At first, I was confused as to why there were 
    // always errors related to import. However, I
    // noticed an issue at https://github.com/oven-sh/bun/issues/6082
    // That way, the decision to transpile to CommonJS 
    // is the right decision. We can still use imports,
    // global variables like __dirname and so on 
    // without any problems. But, Transpile 
    // Changes will only affect plugin change triggers.
    const result = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,   // CommonJs
        target: ts.ScriptTarget.ES2020, // ES2020
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
    });

    const moduleExports: any = {};
    const moduleObj = { exports: moduleExports };

    const moduleFactory = new Function(
      'require',
      'exports',
      'module',
      '__filename',
      '__dirname',
      result.outputText
    );

    moduleFactory(
      require,
      moduleExports,
      moduleObj,
      fullPath,
      path.dirname(fullPath)
    );

    const plugin = moduleObj.exports.default || moduleObj.exports;

    global.plugins[relPath] = plugin;
    pluginModules.set(fullPath, plugin);

    conn.logger.info(`reloaded plugin '${relPath}' successfully`);
    commandCache.build(global.plugins);
  } catch (e) {
    conn.logger.error(`error require plugin '${relPath}'\n${e}'`);
    delete global.plugins[relPath];
  } finally {
    global.plugins = Object.fromEntries(
      Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
    );
  }
}

const watcher = chokidar.watch(pluginFolder, {
  persistent: true,
  ignoreInitial: true,
  usePolling: false,
  depth: Infinity,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100
  },
});

cleanupManager.addWatcher(watcher);

watcher
  .on("change", global.reload)
  .on("add", global.reload)
  .on("unlink", global.reload);

global.reloadHandler();

async function _quickTest() {
  let test = await Promise.all([
    cp.spawn('ffmpeg'),
    cp.spawn('ffprobe'),
    cp.spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
    cp.spawn('convert'),
    cp.spawn('magick'),
    cp.spawn('gm'),
    cp.spawn('find', ['--version'])
  ].map(p => {
    return Promise.race([
      new Promise(resolve => {
        p.on('close', code => {
          resolve(code !== 127)
        })
      }),
      new Promise(resolve => {
        p.on('error', _ => resolve(false))
      })
    ])
  }))
  let [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test
  let s = {
    ffmpeg,
    ffprobe,
    ffmpegWebp,
    convert,
    magick,
    gm,
    find
  }
  Object.freeze(s)
  if (!s.ffmpeg) conn.logger.warn('Please install ffmpeg for sending videos (pkg install ffmpeg)')
  if (s.ffmpeg && !s.ffmpegWebp) conn.logger.warn('Stickers may not animated without libwebp on ffmpeg (--enable-ibwebp while compiling ffmpeg)')
  if (!s.convert && !s.magick && !s.gm) conn.logger.warn('Stickers may not work without imagemagick if libwebp on ffmpeg doesnt isntalled (pkg install imagemagick)')
}

_quickTest()
  .then(() => conn.logger.info('Quick Test Done'))
  .catch(console.error)

async function gracefulShutdown(signal: string) {
  conn.logger.info(`\n${signal} received. Starting graceful shutdown...`);

  try {
    if (global.conn?.ws) {
      conn.logger.info('Closing WhatsApp connection...');
      global.conn.ws.close();
    }

    conn.logger.info('Running cleanup handlers...');
    await cleanupManager.cleanup();

    const stats = cleanupManager.getStats();
    conn.logger.info(`Cleanup complete: ${JSON.stringify(stats)}`);
    conn.logger.info(`Final memory: ${memoryMonitor.getStats()}`);

    conn.logger.info('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    conn.logger.error(`Error during shutdown: ${error}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('exit', () => {
  conn.logger.info('Process exiting...');
});
