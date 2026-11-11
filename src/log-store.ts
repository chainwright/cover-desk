/**
 * Keeps the tester log on the headset, meant to survive a reload, a power
 * cycle and a new URL (a new URL is shown in the emulator; the rest not yet on a Quest), so a tester session returns all of its data (day-3 fix: the log
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

/** New samples and events of one session, plus where the cursor goes once they are stored. */
export interface PendingChunk extends LogChunk {
  /** The session object these rows came from, and its lengths when taken. */
  readonly from: LogSession;
  readonly toS: number;
  readonly toE: number;
}

/**
 * Remembers how much of each session is already stored.
 *
 * Day 4: `take` no longer advances the cursor; `commit` does, after the write
 * succeeded. Before, a failed write lost its chunk for good (the next flush
 * started after it).
 */
export class LogCursor {
  private done = new Map<LogSession, { s: number; e: number }>();

  /** Everything in `log` is already stored (after a restore). */
  markAll(log: TesterLog): void {
    for (const s of log.sessions) this.done.set(s, { s: s.samples.length, e: s.events.length });
  }

  reset(): void {
    this.done.clear();
  }

  /** The samples and events added since the last commit, per session. Does not advance the cursor. */
  take(log: TesterLog): PendingChunk[] {
    const out: PendingChunk[] = [];
    for (const s of log.sessions) {
      const d = this.done.get(s) ?? { s: 0, e: 0 };
      if (s.samples.length === d.s && s.events.length === d.e) continue;
      out.push({
        session: s.index,
        samples: s.samples.slice(d.s),
        events: s.events.slice(d.e),
        from: s,
        toS: s.samples.length,
        toE: s.events.length,
      });
    }
    return out;
  }

  /** These chunks are stored now: advance past them. */
  commit(chunks: readonly PendingChunk[]): void {
    for (const c of chunks) this.done.set(c.from, { s: c.toS, e: c.toE });
  }
}

/** What goes into storage: the chunk without the cursor bookkeeping. */
export function storedChunk(c: PendingChunk): LogChunk {
  return { session: c.session, samples: c.samples, events: c.events };
}

/**
 * Writes the log's new part to storage, one write at a time, and advances the
 * cursor only when the write succeeded (a failed write is retried, whole, by
 * the next flush). Pure apart from the `write` it is given, so it is tested
 * with a fake store.
 */
export class LogFlusher {
  private chain: Promise<boolean> = Promise.resolve(true);
  readonly cursor: LogCursor;
  private write: (meta: LogMeta, chunks: LogChunk[]) => Promise<boolean>;

  constructor(cursor: LogCursor, write: (meta: LogMeta, chunks: LogChunk[]) => Promise<boolean>) {
    this.cursor = cursor;
    this.write = write;
  }

  /** Queues a flush after any running one (two overlapping flushes would write the same rows twice). */
  flush(log: TesterLog): Promise<boolean> {
    const run = () => this.flushNow(log);
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private async flushNow(log: TesterLog): Promise<boolean> {
    const chunks = this.cursor.take(log);
    if (!chunks.length) return true;
    const ok = await this.write(metaOf(log), chunks.map(storedChunk));
    if (ok) this.cursor.commit(chunks);
    return ok;
  }
}

/** Tester log: write the new part to storage every this many seconds (and at every session end). */
export const LOG_FLUSH_S = 5;

/** Says when the periodic flush is due (called every frame with the frame time in seconds). */
export class FlushTimer {
  private last = Number.NaN;
  readonly every: number;

  constructor(every = LOG_FLUSH_S) {
    this.every = every;
  }

  due(time: number): boolean {
    if (Number.isNaN(this.last) || time < this.last) {
      this.last = time; // first frame, or the clock restarted
      return false;
    }
    if (time - this.last < this.every) return false;
    this.last = time;
    return true;
  }
}

interface Listenable {
  addEventListener(type: string, fn: () => void): void;
}

/** Writes the log when the page goes away: pagehide (reload, new URL) and a hidden tab (headset sleep, app switch). */
export function flushOnPageHide(win: Listenable, doc: Listenable & { visibilityState: string }, flush: () => void): void {
  win.addEventListener('pagehide', flush);
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') flush();
  });
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

/** A write that fails this many times in a row switches storage off for the page. */
export const MAX_WRITE_FAILURES = 3;

/**
 * IndexedDB adapter. Every method swallows storage errors and reports them in `status`.
 *
 * Day 5: a failed write no longer switches storage off at once (an outside
 * review found that the first failure did, so "retried" was not true in the
 * app). The store stays `ready`, the cursor stays where it was, and the next
 * flush writes the same rows again; only MAX_WRITE_FAILURES failures in a row
 * mark it `failed` (the panel then says NOT kept). A success resets the count.
 */
export class LogStore {
  status: StoreStatus = 'off';
  error = '';
  /** Failed writes in a row (reset by a successful write). */
  failures = 0;
  private db: IDBDatabase | null = null;

  /** `db`: an already open database (tests pass a fake one); otherwise call `open()`. */
  constructor(db?: IDBDatabase) {
    if (db) {
      this.db = db;
      this.status = 'ready';
    }
  }

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
        let settled = false;
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          this.failures = 0;
          resolve(true);
        };
        tx.onerror = tx.onabort = () => {
          if (settled) return;
          settled = true;
          this.writeFailed(tx.error);
          resolve(false);
        };
      } catch (e) {
        this.writeFailed(e);
        resolve(false);
      }
    });
  }

  /** One failed write: keep going (the next flush retries it) until MAX_WRITE_FAILURES in a row. */
  private writeFailed(e: unknown): void {
    this.failures++;
    this.error = e instanceof Error ? e.message : String(e ?? 'unknown error');
    if (this.failures >= MAX_WRITE_FAILURES) this.status = 'failed';
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
      this.failures = 0;
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    this.status = 'failed';
    this.error = e instanceof Error ? e.message : String(e ?? 'unknown error');
  }
}

/** What LogKeeper needs from a store (LogStore, or a fake in the tests). */
export interface WritableStore {
  readonly status: StoreStatus;
  write(meta: LogMeta, chunks: readonly LogChunk[]): Promise<boolean>;
}

/**
 * The tester log's whole write path, so the frame loop makes one call:
 * `frame(time)` every frame flushes when the 5 s timer is due; `flush()` also
 * runs at session end and when the page is hidden. A flush writes only while
 * the store is `ready`; a failed write leaves the cursor where it was, so the
 * next flush writes the same rows again (see LogStore for when it gives up).
 */
export class LogKeeper {
  readonly cursor = new LogCursor();
  readonly timer: FlushTimer;
  private flusher: LogFlusher;
  private store: WritableStore | null = null;
  private getLog: () => TesterLog | null;

  constructor(getLog: () => TesterLog | null, every = LOG_FLUSH_S) {
    this.getLog = getLog;
    this.timer = new FlushTimer(every);
    this.flusher = new LogFlusher(this.cursor, (meta, chunks) => this.store?.write(meta, chunks) ?? Promise.resolve(false));
  }

  /** The store to write to (once it is open), or null. */
  attach(store: WritableStore | null): void {
    this.store = store;
  }

  /** Storage is on: the log is being kept on the headset. */
  get kept(): boolean {
    return this.store?.status === 'ready';
  }

  /** Call every frame with the frame time (s). Returns the flush when one started (for tests), else null. */
  frame(time: number): Promise<boolean> | null {
    return this.timer.due(time) ? this.flush() : null;
  }

  flush(): Promise<boolean> {
    const log = this.getLog();
    if (!log || !this.kept) return Promise.resolve(false);
    return this.flusher.flush(log);
  }
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
