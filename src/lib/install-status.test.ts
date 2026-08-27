import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInstallStatus, setInstallStatus } from './install-status';

interface FakeChromeStorage {
  data: Record<string, unknown>;
  lastError: { message: string } | undefined;
}

function installFakeChrome(state: FakeChromeStorage) {
  vi.stubGlobal('chrome', {
    runtime: {
      get lastError() {
        return state.lastError;
      },
    },
    storage: {
      local: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) => {
          callback(state.lastError ? {} : { [key]: state.data[key] });
        },
        set: (items: Record<string, unknown>, callback: () => void) => {
          if (!state.lastError) Object.assign(state.data, items);
          callback();
        },
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getInstallStatus', () => {
  let state: FakeChromeStorage;

  beforeEach(() => {
    state = { data: {}, lastError: undefined };
    installFakeChrome(state);
  });

  it('returns the stored status when present', async () => {
    state.data.dictInstallStatus = { phase: 'downloading-jmdict', progress: 42 };
    const status = await getInstallStatus();
    expect(status).toEqual({ phase: 'downloading-jmdict', progress: 42 });
  });

  it('defaults to idle when nothing is stored', async () => {
    const status = await getInstallStatus();
    expect(status).toEqual({ phase: 'idle' });
  });

  it('logs and falls back to idle when chrome.runtime.lastError is set', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.lastError = { message: 'storage quota exceeded' };

    const status = await getInstallStatus();

    expect(status).toEqual({ phase: 'idle' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('getInstallStatus failed'),
      'storage quota exceeded',
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('setInstallStatus', () => {
  let state: FakeChromeStorage;

  beforeEach(() => {
    state = { data: {}, lastError: undefined };
    installFakeChrome(state);
  });

  it('writes the status to storage', async () => {
    await setInstallStatus({ phase: 'done' });
    expect(state.data.dictInstallStatus).toEqual({ phase: 'done' });
  });

  it('logs (but does not throw) when chrome.runtime.lastError is set', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.lastError = { message: 'storage quota exceeded' };

    await expect(setInstallStatus({ phase: 'done' })).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('setInstallStatus failed'),
      'storage quota exceeded',
    );
    consoleErrorSpy.mockRestore();
  });
});
