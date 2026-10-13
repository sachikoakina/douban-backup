import fs from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';

/**
 * 未处理条目的复查日志（各链路共用）。
 *
 * 按 `source::externalId|uuid|title` 做 upsert（而非追加），
 * 保留 firstSeenAt 并刷新 lastSeenAt。
 */

/** Fields every entry carries. Path-specific fields are added on top. */
export type ReviewLogEntry = Record<string, unknown> & {
  /** Which path wrote it, e.g. `bangumi→neodb` / `neodb→tmdb`. */
  source: string;
  /** Why it could not be processed, e.g. `neodb-unresolved`. */
  reason: string;
  /** ISO timestamp of the first run that reported this entry. */
  firstSeenAt: string;
  /** ISO timestamp of the most recent run that still reported it. */
  lastSeenAt: string;
};

/**
 * Identity of an entry: which path, and which item on that path.
 * Both writers always supply one of these ids, so the title fallback only
 * matters for hand-edited files.
 */
function reviewKey(entry: Record<string, unknown>): string {
  const id = entry.externalId ?? entry.uuid ?? entry.title ?? '';
  return `${String(entry.source ?? '')}::${String(id)}`;
}

function readReviewLog(file: string): ReviewLogEntry[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item) => typeof item === 'object' && item !== null,
    ) as ReviewLogEntry[];
  } catch {
    // Missing on the first run, or hand-edited into invalid JSON — start over.
    return [];
  }
}

/**
 * Record an entry that could not be processed, keyed so re-running does not
 * duplicate it. Best effort: never throws.
 *
 * This is an upsert rather than an append on purpose. The same few obscure
 * items fail on every run, so appending would grow the file without bound
 * while telling you nothing new — and, because entries carried no timestamp,
 * the "history" it appeared to preserve could not even be ordered: two runs
 * produced two identical records with no way to say which was newer.
 * Re-recording refreshes `lastSeenAt` and leaves `firstSeenAt` alone, which is
 * what separates a long-standing gap from a newly appeared one.
 */
export function upsertReviewEntry(
  file: string,
  entry: Record<string, unknown> & { source: string; reason: string },
  now: string = new Date().toISOString(),
): void {
  if (!file) {
    return;
  }
  try {
    const key = reviewKey(entry);
    const existing = readReviewLog(file);
    const index = existing.findIndex((item) => reviewKey(item) === key);

    if (index >= 0) {
      const previous = existing[index]!;
      existing[index] = {
        ...entry,
        // Keep the original sighting; only the trailing edge moves.
        firstSeenAt: previous.firstSeenAt ?? now,
        lastSeenAt: now,
      } as ReviewLogEntry;
    } else {
      existing.push({ ...entry, firstSeenAt: now, lastSeenAt: now } as ReviewLogEntry);
    }

    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  } catch (error: any) {
    consola.warn(`Could not update review log ${file}: ${error?.message ?? error}`);
  }
}
