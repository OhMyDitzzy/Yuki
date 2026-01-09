import "./config"
import { Browsers, DisconnectReason, jidNormalizedUser, makeCacheableSignalKeyStore, type UserFacingSocketConfig } from 'baileys';
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import pino from 'pino';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import yargs from "yargs";
import { makeWASocket, serialize, protoType } from './libs/serialize';
import chalk from "chalk";
import ts from "typescript";
import chokidar, { FSWatcher } from "chokidar";
import cp from "node:child_process";
import crypto from 'node:crypto';
import { commandCache } from "./libs/commandCache";
import { yukiKeepMatcher, yukiKeepParser } from "libs/yukiKeepParser";
import { CleanupManager } from "libs/cleanupManager";
import { MemoryMonitor } from "libs/MemoryMonitor";
import { closeSQLiteAuthState, useSQLiteAuthState } from "libs/useSQLAuthState";

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
global.prefix = new RegExp(`^[${(opts['prefix'] || "@#_\\/.!$%+£¥€°=¬‚„…†‡ˆ‰Š‹ŒŽ'':;?&\\-").replace(/[|\\{}()[\]^$+*?.\-]/g, "\\$&")}]`)

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
    rpg: {},
    ...(db.data || {})
  }
}

const DB_PATH = "data/auth.db";

let authState: any;
let saveCredsFunction: any;

async function initializeAuthState() {
  const result = await useSQLiteAuthState(DB_PATH);
  authState = result.state;
  saveCredsFunction = result.saveCreds;
  return result;
}

const { state } = await initializeAuthState();

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
  // @ts-ignore
  getMessage: async (key) => {
    const jid = jidNormalizedUser(key.remoteJid!);
    const msg = await store.loadMessage(jid, key.id!);

    return msg?.message || '';
  },
  generateHighQualityLinkPreview: true,
}

global.conn = makeWASocket(connOptions);
conn.isInit = false;

const cleanupManager = new CleanupManager();
const memoryMonitor = new MemoryMonitor(conn.logger, cleanupManager, {
  baselineDelayMs: 180000,
  thresholds: {
    heapAbsoluteMB: 1000,
    rssPercentOfSystemRAM: 0.6,
  }
});

cleanupManager.addCleanupHandler(async () => {
  if (global.db && global.db.data) {
    conn.logger.info('Saving database before shutdown...');
    await global.db.write().catch(console.error);
  }

  if (global.store) {
    conn.logger.info('Cleaning up store...');
    await global.store.cleanup();
  }

  try {
    if (saveCredsFunction) {
      await saveCredsFunction();
    }

    closeSQLiteAuthState(DB_PATH);
  } catch (e) {
    console.error('Error closing SQLite:', e);
  }
});

if (!conn.authState.creds.registered) {
  console.warn(chalk.yellow("Processing pairing code, wait a moment..."));
  setTimeout(async () => {
    let code = await conn.requestPairingCode(global.pairing, "DITZDEVS")
    code = code?.match(/.{1,4}/g)?.join('-') || code
    console.log(chalk.black(chalk.bgGreen(`Your pairing code : `)), chalk.black(chalk.white(code)))
  }, 3000)
}

function getAllTsFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath)

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);

    if (file.endsWith('_utils') || file.endsWith('_utils.ts')) return;

    if (fs.statSync(fullPath).isDirectory()) {
      getAllTsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".ts")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

let isShuttingDown = false;
let connectionRestartTimer: NodeJS.Timeout | null = null;
let lastRestartTime = Date.now();
let isRestartingConnection = false;

function getConnectionState() {
  try {
    if (!global.conn?.ws?.socket) {
      return { state: -1, stateText: 'NO_SOCKET', isConnected: false };
    }

    const readyState = global.conn.ws.socket.readyState;
    
    let stateText = 'UNKNOWN';
    let isConnected = false;
    
    switch(readyState) {
      case 0: 
        stateText = 'CONNECTING'; 
        break;
      case 1: 
        stateText = 'OPEN'; 
        isConnected = true; 
        break;
      case 2: 
        stateText = 'CLOSING'; 
        break;
      case 3: 
        stateText = 'CLOSED'; 
        break;
      default: 
        stateText = `UNKNOWN(${readyState})`;
    }
    
    return { state: readyState, stateText, isConnected };
  } catch (e) {
    return { state: -1, stateText: 'ERROR', isConnected: false };
  }
}

async function connectionUpdate(update: any) {
  const { receivedPendingNotifications, connection, lastDisconnect, isOnline, isNewLogin } = update;    
  
  if (isNewLogin) {
    conn.isInit = true;
  }

  if (connection == 'connecting') {
    conn.logger.warn('Activating Bot, Please wait a moment...');
  } else if (connection == 'open') {
    conn.logger.info('Connected... ✓');     
     
    if (isRestartingConnection) {
      conn.logger.info('✓ Scheduled/manual restart successful');
      isRestartingConnection = false;
      lastRestartTime = Date.now();
    }
  }

  if (isOnline == true) {
    conn.logger.info('Active Status... ✓');
  } else if (isOnline == false) {
    conn.logger.error('Dead Status');
  }

  if (receivedPendingNotifications) {
    conn.logger.warn('Waiting for New Messages...');
  }

  if (connection == 'close') {
    if (conn.isShuttingDown) {
      conn.logger.info('Connection closed gracefully');
      return;
    }

    if (isRestartingConnection) {
      conn.logger.info('🔄 Connection closed by restart process, skipping auto-reconnect');
      return;
    }

    conn.logger.error('Connection lost...');

    if (lastDisconnect?.error) {
      const statusCode = lastDisconnect.error.output?.statusCode;
      const errorMessage = lastDisconnect.error.output?.payload?.message || lastDisconnect.error.message;

      conn.logger.error(`Disconnect reason: ${errorMessage} (${statusCode})`);

      if (statusCode === DisconnectReason.loggedOut) {
        conn.logger.error('Logged out permanently. Please do pairing code again.');
        await cleanupManager.cleanup();
        process.exit(0);
      }

      if (statusCode === DisconnectReason.badSession) {
        conn.logger.error('Bad session. Clearing auth state...');
        try {
          closeSQLiteAuthState(DB_PATH);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await fs.promises.unlink('./data/auth.db').catch(() => { });
          await fs.promises.unlink('./data/auth.db-shm').catch(() => { });
          await fs.promises.unlink('./data/auth.db-wal').catch(() => { });
        } catch (e) {
          conn.logger.error('Failed to clear session:', e);
        }
        process.exit(0);
      }

      if (
        statusCode === DisconnectReason.connectionClosed ||
        statusCode === DisconnectReason.connectionLost ||
        statusCode === DisconnectReason.connectionReplaced ||
        statusCode === DisconnectReason.timedOut
      ) {
        conn.logger.warn('Connection issue detected. Attempting reconnect in 5s...');

        try {
          if (saveCredsFunction && authState?.creds) {
            await saveCredsFunction();
            conn.logger.info('Credentials saved before reconnect');
          }
        } catch (e) {
          conn.logger.error('Failed to save creds before reconnect:', e);
        }

        setTimeout(async () => {
          try {
            await global.reloadHandler(true);
          } catch (e) {
            conn.logger.error('Reconnect failed:', e);
            process.exit(1);
          }
        }, 5000);
        return;
      }

      if (statusCode === DisconnectReason.restartRequired) {
        conn.logger.warn('Restart required by WhatsApp...');
        try {
          if (saveCredsFunction && authState?.creds) {
            await saveCredsFunction();
          }
        } catch (e) {
          conn.logger.error('Failed to save creds:', e);
        }

        setTimeout(async () => {
          try {
            await global.reloadHandler(true);
          } catch (e) {
            conn.logger.error('Reconnect failed:', e);
            process.exit(1);
          }
        }, 5000);
        return;
      }

      conn.logger.error(`Unknown disconnect reason: ${statusCode}`);
      setTimeout(async () => {
        try {
          if (saveCredsFunction && authState?.creds) {
            await saveCredsFunction();
          }
          await global.reloadHandler(true);
        } catch (e) {
          conn.logger.error('Reconnect failed:', e);
          process.exit(1);
        }
      }, 5000);
    }
  }

  if (global.db.data == null) {
    await global.loadDatabase();
  }
}

let isInit = true
let handler = await import('./handler')

global.reloadHandler = async function(restatConn: boolean) {
  conn.logger.info("Preparing handler...");
  try {
    const Handler = await import(`./handler.ts?update=${Date.now()}`)
    if (Object.keys(Handler || {}).length) handler = Handler
  } catch (e) {
    conn.logger.error('Failed to load handler:', e);
    throw e;
  }

  if (restatConn) {
    const oldChats = global.conn.chats;

    try {
      global.conn.ws.close();
    } catch { }

    await new Promise(resolve => setTimeout(resolve, 3000));
    // @ts-ignore
    conn.ev.removeAllListeners();

    conn.logger.info('Recreating auth state...');
    const { state: newState, saveCreds: newSaveCreds } = await useSQLiteAuthState(DB_PATH);
    authState = newState;
    saveCredsFunction = newSaveCreds;

    const newConnOptions = {
      ...connOptions,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, pino().child({
          level: 'silent',
          stream: 'store'
        })),
      }
    };

    global.conn = makeWASocket(newConnOptions, { chats: oldChats });

    store.bind(global.conn.ev);
    isInit = true;
  }

  if (!isInit) {
    conn.ev.off('messages.upsert', conn.handler)
    conn.ev.off('group-participants.update', conn.participantsUpdate)
    conn.ev.off('groups.update', conn.groupsUpdate)
    conn.ev.off('connection.update', conn.connectionUpdate)
    conn.ev.off('creds.update', conn.credsUpdate)
    conn.ev.off('call', conn.onCall)
  }

  conn.handler = handler.handler.bind(global.conn)
  conn.connectionUpdate = connectionUpdate.bind(global.conn)
  conn.credsUpdate = async function() {
    try {
      await saveCredsFunction.call(global.conn);
    } catch (e) {
      console.error('Error saving creds:', e);
    }
  }.bind(global.conn);
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn)
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn)
  conn.onCall = handler.onCall.bind(global.conn);

  conn.ev.on('messages.upsert', conn.handler)
  conn.ev.on('connection.update', conn.connectionUpdate)
  conn.ev.on('creds.update', conn.credsUpdate)
  conn.ev.on('group-participants.update', conn.participantsUpdate)
  conn.ev.on('groups.update', conn.groupsUpdate)
  conn.ev.on('call', conn.onCall);

  isInit = false;
  conn.logger.info("The handler is ready... ✓");

  return true
}

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

const fileHashes = new Map<string, string>();
const pluginModules = new Map<string, any>();

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

let pluginFolder = path.join(__dirname, "plugins");
let pluginFilter = (filename: string) => /\.ts$/.test(filename);

global.reload = async (filename: string = "") => {  
  if (!pluginFilter(filename)) return;

  if (filename.includes('_utils')) return;

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

    const result = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
    });

    const moduleExports: any = {};
    const moduleObj = { exports: moduleExports };
    
    const Module = require('module');
    const customRequire = Module.createRequire(fullPath);
  
    const moduleFactory = new Function(
      'require',
      'exports',
      'module',
      '__filename',
      '__dirname',
      result.outputText
    );

    moduleFactory(
      customRequire,
      moduleExports,
      moduleObj,
      fullPath,
      path.dirname(fullPath)
    );

    let plugin = moduleObj.exports.default || moduleObj.exports;

    if (moduleObj.exports.default) {
      plugin = {
        ...plugin,
        ...(moduleObj.exports.all && { all: moduleObj.exports.all }),
        ...(moduleObj.exports.before && { before: moduleObj.exports.before }),
        ...(moduleObj.exports.after && { after: moduleObj.exports.after }),
      };
    }

    global.plugins[relPath] = plugin;
    pluginModules.set(fullPath, plugin);

    conn.logger.info(`reloaded plugin '${relPath}' successfully... ✓`);
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

async function _quickTest() {
  conn.logger.info("Running quick test...");
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

  conn.logger.info('Quick Test Done... ✓');
}

async function loadAllPlugins() {
  let tsFiles = getAllTsFiles(pluginFolder);
  global.plugins = {}

  conn.logger.info(`Loading ${tsFiles.length} plugins, please wait...`);

  for (let fullPath of tsFiles) {
    const filename = path.relative(pluginFolder, fullPath);

    if (filename.includes('_utils' + path.sep) || filename.endsWith('_utils.ts')) continue;

    try {
      const file = path.join(pluginFolder, filename);
      const module = await import(file)
      global.plugins[filename] = module.default || module;
    } catch (e) {
      conn.logger.error(`Failed to load plugins ${filename}: ${e}`);
      delete global.plugins[filename];
    }
  }

  conn.logger.info('Plugins loaded... ✓');
  return Object.keys(global.plugins).length;
}

function setupTmpCleanup() {
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

        const formatSize = (bytes: number): string => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
        };

        for (const file of files) {
          if (file === '.yuki_keep') continue;

          const filePath = path.join(tmpPath, file);

          try {
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) continue;

            const shouldKeep = yukiKeepMatcher.shouldKeep(
              file,
              filePath,
              currentConfig.keepRules
            );

            if (shouldKeep) {
              keptCount++;
              continue;
            }

            const shouldDelete = yukiKeepMatcher.shouldDelete(
              file,
              filePath,
              currentConfig.deleteRules
            );

            let exceedsMaxAge = false;
            let exceedsMaxSize = false;

            if (currentConfig.maxAge !== null) {
              const fileAge = Date.now() - stats.mtimeMs;
              exceedsMaxAge = fileAge > currentConfig.maxAge;
            }

            if (currentConfig.maxSize !== null) {
              exceedsMaxSize = stats.size > currentConfig.maxSize;
            }
            if (shouldDelete || exceedsMaxAge || exceedsMaxSize) {
              deletedSize += stats.size;
              fs.unlinkSync(filePath);
              deletedCount++;
            } else {
              keptCount++;
            }
          } catch (err) {
            conn.logger.error(`Failed to process file ${file}:`, err);
          }
        }

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

async function initialize() {
  try {
    await global.loadDatabase();
    await loadAllPlugins();
    commandCache.build(global.plugins);
    await _quickTest();
    await global.reloadHandler();
    memoryMonitor.start(60000);
    scheduleConnectionRestart();

    if (!opts["test"]) {
      const dbSaveInterval = setInterval(async () => {
        if (global.db.data) await global.db.write().catch(console.error);
      }, 30000);
      cleanupManager.addInterval(dbSaveInterval);
    }

    if (!opts["test"]) {
      setupTmpCleanup();
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

    conn.logger.info('Bot initialization complete... ✓');

  } catch (error) {
    conn.logger.error('Failed to initialize:', error);
    process.exit(1);
  }
}

initialize();

async function restartWhatsAppConnection() {
  if (isShuttingDown) {
    conn.logger.warn('Cannot restart during shutdown');
    return;
  }

  if (isRestartingConnection) {
    conn.logger.warn('⚠️ Restart already in progress, skipping...');
    return;
  }

  isRestartingConnection = true;
  conn.logger.info('🔄 Starting connection restart...');
  
  try {
    if (saveCredsFunction && authState?.creds) {
      await saveCredsFunction();
      conn.logger.info('✓ Credentials saved');
    }
    
    if (global.db?.data) {
      await global.db.write();
      conn.logger.info('✓ Database saved');
    }

    conn.logger.info('⏳ Waiting 3s for pending operations...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    conn.logger.info('🔌 Closing old connection...');
    const oldConn = global.conn;
  
    if (oldConn?.ev) {
      oldConn.ev.removeAllListeners();
      conn.logger.info('✓ Event listeners removed');
    }

    if (oldConn?.ws?.socket) {
      try {
        const currentState = oldConn.ws.socket.readyState;
        conn.logger.info(`Current socket state: ${currentState}`);
        
        if (currentState === 0 || currentState === 1) {
          oldConn.ws.socket.close();
          conn.logger.info('Socket close initiated');
        }

        let waitCount = 0;
        while (oldConn.ws?.socket && oldConn.ws.socket.readyState !== 3 && waitCount < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (oldConn.ws?.socket?.readyState === 3) {
          conn.logger.info('✓ Socket closed successfully');
        } else {
          conn.logger.warn('⚠️ Socket close timeout, proceeding anyway');
        }
      } catch (e) {
        conn.logger.error('Error closing socket:', e);
      }
    }

    conn.logger.info('Waiting 3s for server to detect disconnect...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    conn.logger.info('Creating new connection...');
    await global.reloadHandler(true);
    conn.logger.info('Waiting for new connection to stabilize...');
    
    let attempts = 0;
    let connected = false;
    
    while (!connected && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const connState = getConnectionState();
      conn.logger.info(`Attempt ${attempts + 1}/15: ${connState.stateText}`);
      
      if (connState.isConnected) {
        connected = true;
        conn.logger.info('✓ Connection verified as OPEN');
        break;
      }
      
      attempts++;
    }
    
    if (!connected) {
      throw new Error('Connection did not stabilize after 15 attempts');
    }
    
    conn.logger.info('✅ Connection restart completed successfully');
    
  } catch (error) {
    conn.logger.error('❌ Failed to restart connection:', error);
    isRestartingConnection = false;
    
    conn.logger.warn('⏰ Will retry in 5 minutes...');
    scheduleConnectionRestart(5 * 60 * 1000);
  }
}

function scheduleConnectionRestart(intervalMs: number = 16 * 60 * 60 * 1000) {
  if (connectionRestartTimer) {
    clearTimeout(connectionRestartTimer);
  }

  connectionRestartTimer = setTimeout(async () => {
    const now = new Date();
    const wibTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const currentHour = wibTime.getUTCHours();
    if (currentHour >= 8 && currentHour < 22) {
      const next3AMWIB = new Date(wibTime);
      next3AMWIB.setUTCHours(3, 0, 0, 0);
 
      if (next3AMWIB.getTime() <= wibTime.getTime()) {
        next3AMWIB.setUTCDate(next3AMWIB.getUTCDate() + 1);
      }
      
      const delayMs = next3AMWIB.getTime() - wibTime.getTime();
      
      conn.logger.info(
        `Restart postponed to 3 AM WIB (${Math.round(delayMs / 60000)} minutes)`
      );
      
      scheduleConnectionRestart(delayMs);
      return;
    }
    await restartWhatsAppConnection();

    scheduleConnectionRestart(16 * 60 * 60 * 1000);
  }, intervalMs);

  cleanupManager.addCleanupHandler(() => {
    if (connectionRestartTimer) {
      clearTimeout(connectionRestartTimer);
      connectionRestartTimer = null;
    }
  });

  const nextRestartUTC = new Date(Date.now() + intervalMs);
  const nextRestartWIB = new Date(nextRestartUTC.getTime() + (7 * 60 * 60 * 1000));
  const wibString = nextRestartWIB.toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
  
  conn.logger.info(`Next scheduled restart: ${wibString}`);
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    conn.logger.warn(`Shutdown already in progress, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;

  conn.logger.info(`\n${signal} received. Starting graceful shutdown...`);

  if (global.conn) {
    global.conn.isShuttingDown = true;
  }

  try {
    if (global.conn?.ev) {
      conn.logger.info('Removing event listeners...');
      // @ts-ignore
      global.conn.ev.removeAllListeners();
    }

    if (global.conn?.ws) {
      conn.logger.info('Closing WhatsApp connection...');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          conn.logger.warn('WebSocket close timeout, forcing...');
          resolve();
        }, 3000);

        try {
          global.conn.ws.close();
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 1000);
        } catch (e) {
          conn.logger.error('Error closing WebSocket:', e);
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    conn.logger.info('Running cleanup handlers...');
    await cleanupManager.cleanup();

    if (global.db?.data) {
      conn.logger.info('Final database save... ✓');
      await global.db.write().catch((e: any) => {
        conn.logger.error('Failed to save database:', e);
      });
    }

    const stats = cleanupManager.getStats();
    conn.logger.info(`Cleanup complete: ${JSON.stringify(stats)} ... ✓`);
    conn.logger.info(`Final memory: ${memoryMonitor.getStats()} ... ✓`);

    conn.logger.info('Shutdown complete ✓');
    process.exit(0);
  } catch (error) {
    conn.logger.error(`Error during shutdown: ${error}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

process.on('uncaughtException', async (error) => {
  conn.logger.error('Uncaught Exception:', error);
  await gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', async (reason, promise) => {
  conn.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
  conn.logger.info(`Process exiting with code: ${code}`);
});

process.on('message', async (msg) => {
  if (msg === 'shutdown') {
    await gracefulShutdown('PM2_SHUTDOWN');
  }
  
  if (msg === "get_memory_stats") {
    memoryMonitor.displayMemoryTable();
  }
  
  if (msg === "force_garbage_collector") {
    memoryMonitor.forceGC();
  }
  
  if (msg === 'restart_connection') {
    conn.logger.info('📨 Manual restart command received');
    await restartWhatsAppConnection();
  }
  
  if (msg === 'connection_status') {
    const uptime = Date.now() - lastRestartTime;
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    const connState = getConnectionState();
    
    const lastRestartWIB = new Date(lastRestartTime + (7 * 60 * 60 * 1000));
    const wibString = lastRestartWIB.toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
    
    const status = {
      wsState: connState.stateText,
      readyStateCode: connState.state,
      isConnected: connState.isConnected,
      isRestarting: isRestartingConnection,
      lastRestart: wibString,
      uptimeSinceRestart: `${uptimeHours}h ${uptimeMinutes}m`,
      isShuttingDown,
      hasConnection: !!global.conn,
      hasWebSocket: !!global.conn?.ws,
      hasActualSocket: !!global.conn?.ws?.socket,
      hasEventEmitter: !!global.conn?.ev
    };
    
    conn.logger.info('📊 Connection Status:', JSON.stringify(status, null, 2));
  }
});