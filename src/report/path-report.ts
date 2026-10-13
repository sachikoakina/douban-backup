/**
 * 各链路执行结果的统一契约。
 *
 * 渲染见 report/console-summary.ts；退出码判定见本文件的 pathHasFailed。
 */

// ───────────────────────────────────────────────────────────────────────────
// Per-path result reporting
// ───────────────────────────────────────────────────────────────────────────

/**
 * Outcome of one sync path, consumed by the closing summary.
 *
 * Two counts are deliberately treated differently by the exit code:
 *
 *   `unresolved` — the destination simply has no counterpart for this entry
 *                  (an obscure OVA, a book NeoDB never catalogued). That is a
 *                  data gap, not a defect: record it and warn, but never fail
 *                  the run, or CI would go red on every pass.
 *   `failed`     — something threw. A real error: fail the run.
 */
export type PathReport = {
  /** Shown in the summary, e.g. `Bangumi → NeoDB`. */
  label: string;
  scanned: number;
  written: number;
  unchanged: number;
  skipped: number;
  unresolved: number;
  failed: number;
  /** A configured cap stopped the run before everything was walked. */
  capped: boolean;
  /** The path could not run at all (missing credentials, network failure). */
  aborted: boolean;
  /** Titles needing a human look, in encounter order. */
  unresolvedTitles: string[];
  /** Set only when entries were actually appended to it. */
  reviewLog: string;
};

export function newPathReport(label: string): PathReport {
  return {
    label,
    scanned: 0,
    written: 0,
    unchanged: 0,
    skipped: 0,
    unresolved: 0,
    failed: 0,
    capped: false,
    aborted: false,
    unresolvedTitles: [],
    reviewLog: '',
  };
}

/** Whether this report should make the run exit non-zero. */
export function pathHasFailed(report: PathReport): boolean {
  return report.aborted || report.failed > 0;
}
