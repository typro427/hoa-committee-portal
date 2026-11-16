import { AGENDA_SECTIONS } from "./format";

export function sortAgenda<T extends { section: string; displayOrder: number }>(items: T[]) {
  return [...items].sort(
    (a, b) => AGENDA_SECTIONS.indexOf(a.section as never) - AGENDA_SECTIONS.indexOf(b.section as never) || a.displayOrder - b.displayOrder,
  );
}
