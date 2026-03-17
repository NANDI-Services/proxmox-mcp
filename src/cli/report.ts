export type ReportItem = {
  check: string;
  ok: boolean;
  detail: string;
};

export const printReport = (title: string, items: ReportItem[]): void => {
  process.stdout.write(`\n${title}\n`);
  process.stdout.write(`${"-".repeat(title.length)}\n`);

  for (const item of items) {
    const light = item.ok ? "GREEN" : "RED";
    process.stdout.write(`[${light}] ${item.check}: ${item.detail}\n`);
  }
};
