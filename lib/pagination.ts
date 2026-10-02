/** Page numbers to show, with "gap" where pages are skipped: 1 2 3 4 5 … 10, 1 … 4 5 6 … 10. */
export function pageItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  let from = Math.max(2, page - 1);
  let to = Math.min(pageCount - 1, page + 1);
  // Near either end, show a run of five so the list keeps the same length.
  if (page <= 4) [from, to] = [2, 5];
  if (page >= pageCount - 3) [from, to] = [pageCount - 4, pageCount - 1];
  const middle = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return [1, ...(from > 2 ? ["gap" as const] : []), ...middle, ...(to < pageCount - 1 ? ["gap" as const] : []), pageCount];
}
