export type ReportItem = {
  check: string;
  ok: boolean;
  detail: string;
  /**
   * An optional check that was not requested. Neither a pass nor a failure:
   * reporting it as RED tells a newcomer something is broken when nothing is,
   * which is enough to stop them.
   */
  skipped?: boolean;
  /** What to do about it. Only meaningful on a failure. */
  fix?: string;
};

export const printReport = (title: string, items: ReportItem[]): void => {
  process.stdout.write(`\n${title}\n`);
  process.stdout.write(`${"-".repeat(title.length)}\n`);

  for (const item of items) {
    const light = item.skipped ? "SKIP" : item.ok ? "GREEN" : "RED";
    process.stdout.write(`[${light}] ${item.check}: ${item.detail}\n`);
    if (item.fix && !item.ok && !item.skipped) {
      process.stdout.write(`         fix: ${item.fix}\n`);
    }
  }
};

/** Whether a report has anything genuinely wrong in it. Skips do not count. */
export const hasFailure = (items: ReportItem[]): boolean =>
  items.some((item) => !item.ok && item.skipped !== true);
