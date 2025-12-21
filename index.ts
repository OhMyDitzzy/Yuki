import cluster, { setupPrimary } from "node:cluster";
import { existsSync, unwatchFile, watchFile } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import yargs from "yargs";

var isInit: boolean = false;
const rl = createInterface(process.stdin, process.stdout);

function start(file: string) {
  if (isInit) return;
  isInit = true;

  let args: string[] = [join(dirname(fileURLToPath(import.meta.url)), file), ...Bun.argv.slice(2)];

  // setupPrimary is the newest and most modern than setupMaster
  setupPrimary({
    exec: args[0],
    args: args.slice(1)
  });

  let p: cluster.Worker = cluster.fork();
  const fileHasExists = existsSync(file);

  if (!fileHasExists) {
    console.error("The file to be clustered could not be found or has been deleted. Exit...")
    p.kill();
    process.exit(404);
  }

  p.on('message', data => {
    console.log('[RECEIVED]', data);
    switch (data) {
      case 'reset':
        p.kill();
        isInit = false;
        start(file);
        break;
      case 'uptime':
        p.send(process.uptime());
        break;
      default:
        console.warn('[UNRECOGNIZED MESSAGE]', data);
    }
  });

  p.on('exit', (code, _) => {
    isInit = false;
    console.error('[❗] Exited with code:', code);
    if (code !== 0) {
      console.log('[🔄 Restarting worker due to non-zero exit code...');
      return start(file);
    }

    watchFile(args[0] as any, () => {
      unwatchFile(args[0] as any);
      start(file);
    });
  });

  let opts: any = yargs(Bun.argv.slice(2)).exitProcess(false).parse();

  if (!opts["test"]) {
    if (!rl.listenerCount("")) {
      rl.on('line', line => {
        const cmd = line.trim().toLowerCase();

        if (cmd === 'memory' || cmd === 'mem' || cmd === 'stats') {
          p.send('get_memory_stats');
        } else if (cmd === "fc_gc" || cmd === "force_gc") {
          p.send('force_garbage_collector')
        } else {
          p.emit('message', line.trim());
        }
      });
    }
  }
}

start("main.ts");
