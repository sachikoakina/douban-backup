import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { consola } from 'consola';
import type { NeodbShelfEntry } from '../types/platform-model';

/**
 * NeoDB → TMDB 链路的增量同步状态。
 *
 * 为每个 (货架, 条目) 记录内容指纹，未变化的条目在后续运行中零 TMDB 请求。
 * 存成普通 JSON 文件，便于人工查看与删除。
 */

// ───────────────────────────────────────────────────────────────────────────
// NeoDB → TMDB path: incremental sync state
//
// Records a content fingerprint per (shelf, item) so an unchanged mark costs
// zero TMDB requests on later runs. Kept as a plain JSON file so it is easy to
// inspect and delete.
// ───────────────────────────────────────────────────────────────────────────

export type StateEntry = {
  /** Content fingerprint: changes whenever the mark changes. */
  fp: string;
  /** When this entry was last written, for pruning. */
  at: string;
};

export type SyncState = {
  version: number;
  updatedAt: string;
  /** key = `${shelfType}:${itemUuid}` */
  synced: Record<string, StateEntry>;
};

const STATE_VERSION = 1;
/** Keep the state file bounded; oldest entries are dropped first. */
const MAX_STATE_ENTRIES = 20000;

export function emptyState(): SyncState {
  return { version: STATE_VERSION, updatedAt: new Date().toISOString(), synced: {} };
}

export function readState(file: string): SyncState {
  if (!file) {
    return emptyState();
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as SyncState;
    if (parsed?.version !== STATE_VERSION || typeof parsed.synced !== 'object') {
      consola.warn(`State file ${file} has an unexpected shape; starting fresh.`);
      return emptyState();
    }
    return parsed;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      consola.warn(`Could not read state file ${file}: ${error?.message ?? error}`);
    }
    return emptyState();
  }
}

export function writeState(file: string, state: SyncState): void {
  if (!file) {
    return;
  }
  try {
    const pruned = pruneState(state);
    pruned.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(pruned, null, 2)}\n`, 'utf8');
  } catch (error: any) {
    consola.error(`Could not write state file ${file}: ${error?.message ?? error}`);
  }
}

function pruneState(state: SyncState): SyncState {
  const keys = Object.keys(state.synced);
  if (keys.length <= MAX_STATE_ENTRIES) {
    return state;
  }

  const kept = keys
    .sort((a, b) =>
      (state.synced[b]?.at ?? '').localeCompare(state.synced[a]?.at ?? ''),
    )
    .slice(0, MAX_STATE_ENTRIES);

  const synced: Record<string, StateEntry> = {};
  for (const key of kept) {
    synced[key] = state.synced[key]!;
  }
  consola.info(`State pruned: ${keys.length} → ${kept.length} entries.`);
  return { ...state, synced };
}

export function stateKey(shelfType: string, itemUuid: string): string {
  return `${shelfType}:${itemUuid}`;
}

/**
 * Content fingerprint of a mark. Only the fields this sync actually pushes are
 * included, so an unrelated field change does not force a re-sync.
 */
export function fingerprintMark(mark: NeodbShelfEntry): string {
  const payload = [
    mark.shelf_type ?? '',
    String(mark.rating_grade ?? 0),
    mark.comment_text ?? '',
  ].join('\u0001');
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}
