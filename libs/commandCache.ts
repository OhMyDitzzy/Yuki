import type { PluginHandler } from "@yuki/types";

interface CachedCommand {
  plugin: PluginHandler;
  pluginName: string;
  command: string;
}

interface PluginMetadata {
  name: string;
  description: string;
  tags: string[];
  usage: string;
}

class CommandCache {
  private cache = new Map<string, CachedCommand>();
  private regexCommands: Array<{ regex: RegExp; plugin: PluginHandler; pluginName: string }> = [];
  private metadata = new Map<string, PluginMetadata>();

  /**
   * Build command cache from all loaded plugins
   * Call this once during bot startup and whenever plugins are reloaded.
   * We realize that manually viewing all plugin.cmd is not good.
   * This is good for checking bot id response in m.msg.selectedId,
   * So, when the bot checks the response button id, it doesn't 
   * need to check each plugin.cmd one by one.
   */
  build(plugins: Record<string, PluginHandler>) {
    conn.logger.info('🔄 Building command cache...');

    this.cache.clear();
    this.regexCommands = [];

    let cachedCount = 0;
    let regexCount = 0;

    for (let name in plugins) {
      const plugin = plugins[name];

      if (plugin?.name && plugin.description && plugin.tags) {
        this.metadata.set(name, {
          name: plugin.name,
          description: plugin.description,
          tags: Array.isArray(plugin.tags) ? plugin.tags : [plugin.tags],
          usage: Array.isArray(plugin.usage) ? plugin.usage.join(", ") : (plugin.usage || "") as string
        })
      }

      if (!plugin) continue;
      if (plugin.disabled) continue;
      if (typeof plugin.exec !== 'function') continue;
      if (!plugin.cmd) continue;

      const commands = Array.isArray(plugin.cmd) ? plugin.cmd : [plugin.cmd];

      for (const cmd of commands) {
        if (cmd instanceof RegExp) {
          this.regexCommands.push({ regex: cmd, plugin, pluginName: name });
          regexCount++;
        } else if (typeof cmd === 'string') {
          const normalized = cmd.toLowerCase().trim();
          this.cache.set(normalized, {
            plugin,
            pluginName: name,
            command: normalized
          });
          cachedCount++;
        }
      }
    }

    conn.logger.info(`✅ Command cache built: ${cachedCount} string commands, ${regexCount} regex commands`);
  }

  find(command: string): CachedCommand | null {
    const normalized = command.toLowerCase().trim();

    const cached = this.cache.get(normalized);
    if (cached) {
      return cached;
    }

    for (const { regex, plugin, pluginName } of this.regexCommands) {
      if (regex.test(command)) {
        return { plugin, pluginName, command };
      }
    }

    return null;
  }

  getMetadata() {
    return this.metadata;
  }
  /**
   * Get cache statistics
   */
  getStats() {
    return {
      stringCommands: this.cache.size,
      regexCommands: this.regexCommands.length,
      total: this.cache.size + this.regexCommands.length
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.regexCommands = [];
  }
}

export const commandCache = new CommandCache();
