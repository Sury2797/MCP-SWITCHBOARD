import { EventEmitter } from 'node:events';
import { checkBinary, getInstallHint, killProcessTree, spawnManaged } from './processUtils.js';

const TRY_CLOUDFLARE_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export class TunnelManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.status = 'offline'; // 'offline' | 'starting' | 'live' | 'error'
    this.mode = 'quick'; // 'quick' | 'named'
    this.publicUrl = null; // Full https://.../mcp URL
    this.error = null;
    this.installHint = null;
    this.localPort = 8000;
    this._startTimer = null;
    this._startGen = 0;
  }

  _emitState() {
    this.emit('state', this.getState());
  }

  _clearStartTimer() {
    if (this._startTimer) {
      clearTimeout(this._startTimer);
      this._startTimer = null;
    }
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

  async start(localPort, settings = {}) {
    const myGen = ++this._startGen;
    if (this.proc) {
      await this.stop();
    }
    if (myGen !== this._startGen) return this.getState();

    this.localPort = localPort;
    this.mode = settings.tunnelMode === 'named' ? 'named' : 'quick';
    this.error = null;
    this.installHint = null;
    this.publicUrl = null;
    this.status = 'starting';
    this._emitState();

    // Check cloudflared availability first so we never crash silently
    const probe = await checkBinary('cloudflared', ['--version']);
    if (myGen !== this._startGen) return this.getState();
    if (!probe.installed) {
      this.status = 'error';
      this.error = 'cloudflared is not installed or not found on PATH.';
      this.installHint = getInstallHint('cloudflared');
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
        args = ['tunnel', 'run', '--url', `http://127.0.0.1:${localPort}`, name];
      } else {
        this.status = 'error';
        this.error = 'Named Tunnel mode requires either a Cloudflare Tunnel Token or a Named Tunnel name in Settings.';
        this._emitState();
        return this.getState();
      }

      if (domain) {
        const cleanDomain = domain.replace(/\/+$/, '');
        const candidate = cleanDomain.endsWith('/mcp')
          ? cleanDomain
          : `${/^https?:\/\//i.test(cleanDomain) ? cleanDomain : `https://${cleanDomain}`}/mcp`;
        try {
          const parsed = new URL(candidate);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            this.publicUrl = parsed.toString();
          }
        } catch {}
      }
    } else {
      args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${localPort}`];
    }

    const proc = spawnManaged(probe.binary || 'cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;

    const handleChunk = (_stream, chunk) => {
      if (this.proc !== proc) return;
      const text = chunk.toString('utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        if (this.mode === 'quick') {
          const match = line.match(TRY_CLOUDFLARE_REGEX);
          if (match && !this.publicUrl) {
            this.publicUrl = `${match[0].replace(/\/+$/, '')}/mcp`;
            this.status = 'live';
            this.error = null;
            this._clearStartTimer();
            this._emitState();
          }
        } else if (
          this.status === 'starting' &&
          (/registered tunnel connection/i.test(line) || /connection .* registered/i.test(line))
        ) {
          this.status = 'live';
          this.error = null;
          this._clearStartTimer();
          this._emitState();
        }
      }
    };

    proc.stdout?.on('data', (chunk) => handleChunk('stdout', chunk));
    proc.stderr?.on('data', (chunk) => handleChunk('stderr', chunk));

    proc.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
      if (this.proc !== proc) return;
      this._clearStartTimer();
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      this.status = 'error';
      this.error = err.code === 'ENOENT'
        ? 'cloudflared binary not found in PATH.'
        : `Failed to start cloudflared: ${err.message}`;
      this.installHint = err.code === 'ENOENT' ? getInstallHint('cloudflared') : null;
      this.proc = null;
      this._emitState();
    });

    proc.on('exit', (code, signal) => {
      const wasActive = this.proc === proc;
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      if (!wasActive) return;
      this._clearStartTimer();
      this.proc = null;
      if (this.status !== 'offline') {
        this.status = code === 0 ? 'offline' : 'error';
        if (code !== 0) {
          this.error = `cloudflared exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'none'}).`;
        }
        this.publicUrl = null;
        this._emitState();
      }
    });

    // Startup timeout guard (20 seconds)
    this._clearStartTimer();
    this._startTimer = setTimeout(() => {
      if (this.proc === proc && this.status === 'starting') {
        if (this.mode === 'named' && this.publicUrl) {
          // Named tunnels may already be serving even if log format differs
          this.status = 'live';
          this._emitState();
        } else {
          this.error = 'Timed out waiting for Cloudflare Tunnel URL. Check your internet connection or cloudflared setup.';
          this.status = 'error';
          this._emitState();
          this.stop().catch(() => {});
        }
      }
    }, 20000);

    return this.getState();
  }

  async stop() {
    this._startGen += 1;
    this._clearStartTimer();
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
    }
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
