import type { Update } from '@tauri-apps/plugin-updater';
import type { UpdateCheckResult, UpdateProgress } from './types';

let activeUpdate: Update | null = null;

export const isTauriDesktop = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
};

export async function getAppVersion(): Promise<string> {
  if (!isTauriDesktop()) return '1.0.1';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return '1.0.1';
  }
}

/**
 * Checks for updates against configured release endpoints.
 */
export async function checkForAppUpdate(_manual = false): Promise<UpdateCheckResult> {
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
      activeUpdate = null;
      return {
        status: 'latest',
        currentVersion,
        message: `MCP Switchboard is up to date (v${currentVersion}).`,
      };
    }

    activeUpdate = update;
    return {
      status: 'available',
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date,
      body: update.body,
    };
  } catch (err) {
    activeUpdate = null;
    const msg = err instanceof Error ? err.message : String(err);

    let userMsg = 'Unable to check for updates.';
    if (msg.includes('404') || msg.includes('Could not resolve') || msg.includes('Failed to fetch')) {
      userMsg = 'Update server currently unreachable or offline.';
    } else if (msg.includes('Could not find') || msg.includes('endpoint')) {
      userMsg = 'No release endpoints configured yet.';
    } else {
      userMsg = msg;
    }

    return {
      status: 'error',
      error: userMsg,
    };
  }
}

/**
 * Downloads and installs the active update with real-time progress callbacks.
 */
export async function installAppUpdate(onProgress: (progress: UpdateProgress) => void = () => {}): Promise<void> {
  if (!activeUpdate) {
    throw new Error('No active update available to install.');
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  try {
    await activeUpdate.downloadAndInstall((event) => {
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
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to download and install update.');
  }
}
