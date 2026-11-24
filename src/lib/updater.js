/**
 * Native Tauri v2 In-App Updater Client
 * Handles update checking, download progress, error recovery, and seamless restart.
 */

let activeUpdate = null;

export const isTauriDesktop = () => {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
};

/**
 * Checks for updates against configured release endpoints.
 * @param {boolean} manual Whether this check was triggered manually by user click
 * @returns {Promise<{
 *   status: 'available' | 'latest' | 'error' | 'unsupported',
 *   version?: string,
 *   currentVersion?: string,
 *   date?: string,
 *   body?: string,
 *   error?: string
 * }>}
 */
export async function checkForAppUpdate(manual = false) {
  if (!isTauriDesktop()) {
    return {
      status: 'unsupported',
      message: 'Updater active in native desktop build.',
    };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 12000 });

    if (!update) {
      activeUpdate = null;
      return {
        status: 'latest',
        currentVersion: '1.0.0',
        message: 'MCP Switchboard is up to date (v1.0.0).',
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
    const msg = err?.message || String(err);

    // Gracefully handle common network / endpoint states
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
 * @param {(progress: { percent: number, downloaded: number, total: number }) => void} onProgress
 */
export async function installAppUpdate(onProgress = () => {}) {
  if (!activeUpdate) {
    throw new Error('No active update available to install.');
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  try {
    await activeUpdate.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data?.contentLength || 0;
        onProgress({ percent: 0, downloaded: 0, total: totalBytes });
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data?.chunkLength || 0;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        onProgress({ percent, downloaded: downloadedBytes, total: totalBytes });
      } else if (event.event === 'Finished') {
        onProgress({ percent: 100, downloaded: totalBytes, total: totalBytes });
      }
    });
  } catch (err) {
    throw new Error(err?.message || 'Failed to download and install update.');
  }
}
