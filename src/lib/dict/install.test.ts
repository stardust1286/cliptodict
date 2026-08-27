import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installDictionary } from './install';

vi.mock('../db', () => ({
  openDictDb: vi.fn(),
  dbPutBulk: vi.fn(),
  dbCount: vi.fn(),
  STORE_JMDICT: 'jmdict',
  STORE_PITCH: 'pitchAccent',
}));

vi.mock('../install-status', () => ({
  setInstallStatus: vi.fn(),
}));

vi.mock('./jmdict-parser', () => ({
  downloadAndParseJMdict: vi.fn(),
}));

vi.mock('./pitch-accent-parser', () => ({
  downloadAndParsePitchAccent: vi.fn(),
}));

import { openDictDb, dbPutBulk, dbCount } from '../db';
import { setInstallStatus } from '../install-status';
import { downloadAndParseJMdict } from './jmdict-parser';
import { downloadAndParsePitchAccent } from './pitch-accent-parser';

const mockOpenDictDb = vi.mocked(openDictDb);
const mockDbCount = vi.mocked(dbCount);
const mockDbPutBulk = vi.mocked(dbPutBulk);
const mockSetInstallStatus = vi.mocked(setInstallStatus);
const mockDownloadJMdict = vi.mocked(downloadAndParseJMdict);
const mockDownloadPitch = vi.mocked(downloadAndParsePitchAccent);

const FAKE_DB = {} as IDBDatabase;

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenDictDb.mockResolvedValue(FAKE_DB);
  mockDbPutBulk.mockResolvedValue(undefined);
  mockSetInstallStatus.mockResolvedValue(undefined);
  mockDownloadJMdict.mockResolvedValue({ entries: [{ word: '食', reading: 'たべ', partOfSpeech: 'n', common: true }] });
  mockDownloadPitch.mockResolvedValue([{ key: '食+たべ', word: '食', reading: 'たべ', position: 0 }]);
});

describe('installDictionary — concurrency', () => {
  it('shares a single in-flight run when called concurrently before either finishes', async () => {
    mockDbCount.mockResolvedValue(0);

    const [a, b] = [installDictionary(), installDictionary()];
    await Promise.all([a, b]);

    // Only one real download/parse pass should have happened despite two calls.
    expect(mockDownloadJMdict).toHaveBeenCalledTimes(1);
    expect(mockDownloadPitch).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh install after a prior run has fully completed', async () => {
    mockDbCount.mockResolvedValue(0);
    await installDictionary();
    expect(mockDownloadJMdict).toHaveBeenCalledTimes(1);

    // Simulate both stores now populated — a second call should be a no-op download.
    mockDbCount.mockResolvedValue(1);
    await installDictionary();
    expect(mockDownloadJMdict).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight lock even when the run fails, so a later call can retry', async () => {
    mockDbCount.mockResolvedValue(0);
    mockDownloadJMdict.mockRejectedValueOnce(new Error('network down'));

    await expect(installDictionary()).rejects.toThrow('network down');

    mockDownloadJMdict.mockResolvedValueOnce({ entries: [] });
    await installDictionary();
    expect(mockDownloadJMdict).toHaveBeenCalledTimes(2);
  });
});

describe('installDictionary — per-step resumability', () => {
  it('skips re-downloading JMdict when it is already indexed but pitch accent is not', async () => {
    mockDbCount.mockImplementation(async (_db, storeName) => (storeName === 'jmdict' ? 500 : 0));

    await installDictionary();

    expect(mockDownloadJMdict).not.toHaveBeenCalled();
    expect(mockDownloadPitch).toHaveBeenCalledTimes(1);
  });

  it('skips re-downloading pitch accent when it is already indexed but JMdict is not', async () => {
    mockDbCount.mockImplementation(async (_db, storeName) => (storeName === 'pitchAccent' ? 500 : 0));

    await installDictionary();

    expect(mockDownloadJMdict).toHaveBeenCalledTimes(1);
    expect(mockDownloadPitch).not.toHaveBeenCalled();
  });

  it('downloads nothing and reports done when both stores are already populated', async () => {
    mockDbCount.mockResolvedValue(500);

    await installDictionary();

    expect(mockDownloadJMdict).not.toHaveBeenCalled();
    expect(mockDownloadPitch).not.toHaveBeenCalled();
    expect(mockSetInstallStatus).toHaveBeenCalledWith({ phase: 'done' });
  });
});

describe('installDictionary — error status reporting', () => {
  it('reports phase: error when openDictDb itself fails', async () => {
    mockOpenDictDb.mockRejectedValueOnce(new Error('IndexedDB blocked'));

    await expect(installDictionary()).rejects.toThrow('IndexedDB blocked');

    expect(mockSetInstallStatus).toHaveBeenCalledWith({
      phase: 'error',
      error: 'IndexedDB blocked',
    });
  });

  it('reports phase: error when a download/parse step fails', async () => {
    mockDbCount.mockResolvedValue(0);
    mockDownloadJMdict.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(installDictionary()).rejects.toThrow('HTTP 500');

    expect(mockSetInstallStatus).toHaveBeenCalledWith({
      phase: 'error',
      error: 'HTTP 500',
    });
  });
});
