import type { Update } from '@tauri-apps/plugin-updater';
import type { UpdateCheckResult, UpdateProgress } from './types';

let activeUpdate: Update | null = null;

function fallbackVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : '1.0.2';
}

function releaseActiveUpdate(): void {
  const prev = activeUpdate;
  activeUpdate = null;
  if (prev) {
    void prev.close().catch(() => {});
  }
}

export const isTauriDesktop = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
};

export async function getAppVersion(): Promise<string> {
  const fallback = fallbackVersion();
  if (!isTauriDesktop()) return fallback;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return fallback;
  }
}

/**
 * Checks for updates against configured release endpoints.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriDesktop()) {
    return {
      status: 'unsupported',
      message: 'Updater active in native desktop build.',
    };
  }

  try {
    const [{ check }, currentVersion] = await Promise.all([
      import('@tauri-apps/plugin-updater'),
      getAppVersion(),
    ]);
    const update = await check({ timeout: 12000 });

    if (!update) {
      releaseActiveUpdate();
      return {
        status: 'latest',
        currentVersion,
        message: `MCP Switchboard is up to date (v${currentVersion}).`,
      };
    }

    releaseActiveUpdate();
    activeUpdate = update;
    return {
      status: 'available',
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date,
      body: update.body,
    };
  } catch (err) {
    releaseActiveUpdate();
    const msg = err instanceof Error ? err.message : String(err);

    let userMsg = msg;
    if (/404|not found|could not fetch a valid release|could not resolve|failed to fetch|error sending request/i.test(msg)) {
      userMsg = 'No published release manifest found yet, or GitHub Releases is unreachable.';
    } else if (/endpoint/i.test(msg)) {
      userMsg = 'No release endpoints configured yet.';
    }

    return {
      status: 'error',
      error: userMsg,
    };
  }
}

/**
 * Downloads, stops the local sidecar cleanly so files/ports aren't locked,
 * installs the update, and relaunches non-Windows targets where install() returns.
 */
export async function installAppUpdate(onProgress: (progress: UpdateProgress) => void = () => {}): Promise<void> {
  if (!activeUpdate && isTauriDesktop()) {
    const { check } = await import('@tauri-apps/plugin-updater');
    activeUpdate = await check({ timeout: 12000 });
  }
  const update = activeUpdate;
  if (!update) {
    throw new Error('No active update available to install.');
  }

  let totalBytes = 0;
  let downloadedBytes = 0;
  let installing = false;

  try {
    await update.download((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data?.contentLength ?? 0;
        onProgress({ percent: 0, downloaded: 0, total: totalBytes });
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data?.chunkLength ?? 0;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        onProgress({ percent, downloaded: downloadedBytes, total: totalBytes });
      } else if (event.event === 'Finished') {
        onProgress({ percent: 100, downloaded: totalBytes, total: totalBytes });
      }
    });

    installing = true;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('prepare_for_update').catch(() => {});
    await update.install({ restartAfterInstall: true });
    await invoke('relaunch_app').catch(() => {});
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to download and install update.');
  } finally {
    if (installing) {
      releaseActiveUpdate();
    }
  }
}
