/**
 * Keeps the tester log on the headset across reloads, a power cycle and a
 * new URL, so a tester session returns all of its data (day-3 fix: the log
 * lived in memory only, and three protocol steps reloaded the page before
 * the export).
 *
 * Storage is IndexedDB in this origin, written in append-only chunks: every
 * few seconds only the samples and events added since the last write are
 * stored, so a long session never re-serialises the whole log inside a frame.
 * A small `meta` record holds the log header and each session's header.
 *
 * Versioned twice: the database name carries the log format version
 * (`cover-tester-log-v2`), and the meta record carries STORE_VERSION. A stored
 * log of another format, log version or store version is never mixed into the
 * current one: `assemble` returns null and the store starts empty.
 *
 * The chunking and reassembly are pure (unit-tested in Node); `LogStore` is
 * the thin IndexedDB adapter.
 */
import { LOG_FORMAT, LOG_VERSION, type LogEvent, type LogSession, type TesterLog } from './touch-log.ts';

export const STORE_VERSION = 1;
export const DB_NAME = `${LOG_FORMAT}-v${LOG_VERSION}`;
const META_KEY = 'log';

export type SessionHeader = Omit<LogSession, 'samples' | 'events'>;

export interface LogMeta {
  storeVersion: number;
  header: Omit<TesterLog, 'sessions'>;
  sessions: SessionHeader[];
}

/** New samples and events of one session since the last write. */
export interface LogChunk {
  session: number;
  samples: number[][];
  events: LogEvent[];
}

export function metaOf(log: TesterLog): LogMeta {
  const { sessions, ...header } = log;
  return {
    storeVersion: STORE_VERSION,
    header,
    sessions: sessions.map(({ samples: _s, events: _e, ...h }) => h),
  };
}

/** Remembers how much of each session is already stored. */
export class LogCursor {
  private done = new Map<LogSession, { s: number; e: number }>();

  /** Everything in `log` is already stored (after a restore). */
  markAll(log: TesterLog): void {
    for (const s of log.sessions) this.done.set(s, { s: s.samples.length, e: s.events.length });
  }

  reset(): void {
    this.done.clear();
  }

  /** The samples and events added since the last call, per session; advances the cursor. */
  take(log: TesterLog): LogChunk[] {
    const out: LogChunk[] = [];
    for (const s of log.sessions) {
      let d = this.done.get(s);
      if (!d) this.done.set(s, (d = { s: 0, e: 0 }));
      if (s.samples.length === d.s && s.events.length === d.e) continue;
      out.push({ session: s.index, samples: s.samples.slice(d.s), events: s.events.slice(d.e) });
      d.s = s.samples.length;
      d.e = s.events.length;
    }
    return out;
  }
}

/** Rebuilds a log from its meta record and chunks (in write order); null when the versions don't match. */
export function assemble(meta: LogMeta | null | undefined, chunks: readonly LogChunk[]): TesterLog | null {
  if (!meta || meta.storeVersion !== STORE_VERSION) return null;
  if (meta.header.format !== LOG_FORMAT || meta.header.version !== LOG_VERSION) return null;
  const sessions: LogSession[] = meta.sessions.map((h) => ({ ...h, samples: [], events: [] }));
  const byIndex = new Map(sessions.map((s) => [s.index, s]));
  for (const c of chunks) {
    const s = byIndex.get(c.session);
    if (!s) continue; // a chunk written after its meta was lost: skip it, never guess
    for (const row of c.samples) s.samples.push(row);
    for (const e of c.events) s.events.push(e);
  }
  return { ...meta.header, sessions };
}

export type StoreStatus = 'off' | 'opening' | 'ready' | 'failed';

/** IndexedDB adapter. Every method swallows storage errors and reports them in `status`. */
export class LogStore {
  status: StoreStatus = 'off';
  error = '';
  private db: IDBDatabase | null = null;

  async open(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') {
      this.fail('IndexedDB is not available in this browser');
      return false;
    }
    this.status = 'opening';
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
      this.status = 'ready';
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }

  async load(): Promise<TesterLog | null> {
    const db = this.db;
    if (!db) return null;
    try {
      const tx = db.transaction(['meta', 'chunks'], 'readonly');
      const meta = await request<LogMeta | undefined>(tx.objectStore('meta').get(META_KEY));
      const chunks = await request<LogChunk[]>(tx.objectStore('chunks').getAll());
      return assemble(meta, chunks);
    } catch (e) {
      this.fail(e);
      return null;
    }
  }

  /** Appends the chunks and replaces the meta record in one transaction. */
  write(meta: LogMeta, chunks: readonly LogChunk[]): Promise<boolean> {
    const db = this.db;
    if (!db || this.status !== 'ready') return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['meta', 'chunks'], 'readwrite');
        tx.objectStore('meta').put(meta, META_KEY);
        const store = tx.objectStore('chunks');
        for (const c of chunks) store.add(c);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => {
          this.fail(tx.error);
          resolve(false);
        };
      } catch (e) {
        this.fail(e);
        resolve(false);
      }
    });
  }

  /** Forgets the stored log (the tester pressed "Start a new log"). */
  async clear(): Promise<void> {
    const db = this.db;
    if (!db) return;
    try {
      const tx = db.transaction(['meta', 'chunks'], 'readwrite');
      tx.objectStore('meta').clear();
      tx.objectStore('chunks').clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
      if (this.status === 'failed') this.status = 'ready';
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    this.status = 'failed';
    this.error = e instanceof Error ? e.message : String(e ?? 'unknown error');
  }
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
