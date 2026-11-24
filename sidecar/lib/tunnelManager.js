import { EventEmitter } from 'node:events';
import { checkBinary, getInstallHint, killProcessTree, spawnManaged } from './processUtils.js';

const TRY_CLOUDFLARE_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const MAX_TUNNEL_LOGS = 200;

export class TunnelManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // 'offline' | 'starting' | 'live' | 'error'
    this.mode = 'quick'; // 'quick' | 'named'
    this.publicUrl = null; // Full https://.../mcp URL
    this.error = null;
    this.installHint = null;
    this.logs = [];
    this.localPort = 8000;
    this._startTimer = null;
  }

  _pushLog(stream, line) {
    const entry = { ts: new Date().toISOString(), stream, line };
    this.logs.push(entry);
    if (this.logs.length > MAX_TUNNEL_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_TUNNEL_LOGS);
    }
    this.emit('log', entry);
  }

  _emitState() {
    this.emit('state', this.getState());
  }

  getState() {
    return {
      status: this.status,
      mode: this.mode,
      publicUrl: this.publicUrl,
      localUrl: `http://localhost:${this.localPort}/mcp`,
      error: this.error,
      installHint: this.installHint,
      pid: this.proc?.pid || null,
    };
  }

  getLogs() {
    return this.logs;
  }

  async start(localPort, settings = {}) {
    if (this.proc) {
      await this.stop();
    }

    this.localPort = localPort;
    this.mode = settings.tunnelMode === 'named' ? 'named' : 'quick';
    this.error = null;
    this.installHint = null;
    this.publicUrl = null;
    this.status = 'starting';
    this._emitState();

    // Check cloudflared availability first so we never crash silently
    const probe = await checkBinary('cloudflared', ['--version']);
    if (!probe.installed) {
      this.status = 'error';
      this.error = 'cloudflared is not installed or not found on PATH.';
      this.installHint = getInstallHint('cloudflared');
      this._pushLog('stderr', this.error);
      this._emitState();
      return this.getState();
    }

    let args;
    if (this.mode === 'named') {
      const token = String(settings.namedTunnelToken || '').trim();
      const name = String(settings.namedTunnelName || '').trim();
      const domain = String(settings.namedTunnelDomain || '').trim();

      if (token) {
        args = ['tunnel', 'run', '--token', token];
      } else if (name) {
        args = ['tunnel', 'run', '--url', `http://localhost:${localPort}`, name];
      } else {
        this.status = 'error';
        this.error = 'Named Tunnel mode requires either a Cloudflare Tunnel Token or a Named Tunnel name in Settings.';
        this._emitState();
        return this.getState();
      }

      if (domain) {
        const cleanDomain = domain.replace(/\/+$/, '');
        this.publicUrl = cleanDomain.endsWith('/mcp')
          ? cleanDomain
          : `${cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`}/mcp`;
      }
    } else {
      args = ['tunnel', '--no-autoupdate', '--url', `http://localhost:${localPort}`];
    }

    this._pushLog('system', `Starting cloudflared (${this.mode} mode) -> http://localhost:${localPort}`);

    const proc = spawnManaged(probe.binary || 'cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;

    const handleChunk = (stream, chunk) => {
      const text = chunk.toString('utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        this._pushLog(stream, line);

        if (this.mode === 'quick') {
          const match = line.match(TRY_CLOUDFLARE_REGEX);
          if (match && !this.publicUrl) {
            this.publicUrl = `${match[0].replace(/\/+$/, '')}/mcp`;
            this.status = 'live';
            this.error = null;
            this._emitState();
          }
        } else if (
          this.status === 'starting' &&
          (/registered tunnel connection/i.test(line) || /connection .* registered/i.test(line))
        ) {
          this.status = 'live';
          this.error = null;
          this._emitState();
        }
      }
    };

    proc.stdout?.on('data', (chunk) => handleChunk('stdout', chunk));
    proc.stderr?.on('data', (chunk) => handleChunk('stderr', chunk));

    proc.on('error', (err) => {
      this.status = 'error';
      this.error = err.code === 'ENOENT'
        ? 'cloudflared binary not found in PATH.'
        : `Failed to start cloudflared: ${err.message}`;
      this.installHint = err.code === 'ENOENT' ? getInstallHint('cloudflared') : null;
      this.proc = null;
      this._pushLog('stderr', this.error);
      this._emitState();
    });

    proc.on('exit', (code, signal) => {
      const wasActive = this.proc === proc;
      if (!wasActive) return;
      this.proc = null;
      if (this.status !== 'offline') {
        this.status = code === 0 ? 'offline' : 'error';
        if (code !== 0) {
          this.error = `cloudflared exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'none'}).`;
        }
        this.publicUrl = null;
        this._pushLog('system', `cloudflared stopped (code=${code}, signal=${signal})`);
        this._emitState();
      }
    });

    // Startup timeout guard (20 seconds)
    clearTimeout(this._startTimer);
    this._startTimer = setTimeout(() => {
      if (this.proc === proc && this.status === 'starting') {
        if (this.mode === 'named' && this.publicUrl) {
          // Named tunnels may already be serving even if log format differs
          this.status = 'live';
          this._emitState();
        } else {
          this.error = 'Timed out waiting for Cloudflare Tunnel URL. Check your internet connection or tunnel logs.';
          this.status = 'error';
          this._emitState();
          this.stop().catch(() => {});
        }
      }
    }, 20000);

    return this.getState();
  }

  async stop() {
    clearTimeout(this._startTimer);
    this._startTimer = null;
    const proc = this.proc;
    this.proc = null;
    this.status = 'offline';
    this.publicUrl = null;
    this.error = null;
    this.installHint = null;
    this._emitState();

    if (proc?.pid) {
      await killProcessTree(proc.pid, 2000);
    }
    return this.getState();
  }
}
