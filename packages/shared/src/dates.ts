// Utilitários de datas partilhados.

/** RN09: uma tarefa está em atraso se o prazo já passou e não está concluída. */
export function isOverdue(
  task: { status: string; dueDate: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (task.status === 'DONE' || task.dueDate === null) return false;
  return new Date(task.dueDate).getTime() < now.getTime();
}

/**
 * Semestre letivo que contém (ou está prestes a começar em) `date`.
 * Ago–Jan → 1.º semestre (set–jan); fev–jul → 2.º semestre (fev–jul).
 */
export function semesterFor(date: Date): { label: string; startDate: Date; endDate: Date } {
  const month = date.getUTCMonth(); // 0 = janeiro
  const year = date.getUTCFullYear();
  const yy = (n: number) => String(n % 100).padStart(2, '0');

  if (month >= 7 || month === 0) {
    const start = month === 0 ? year - 1 : year;
    return {
      label: `${start}/${yy(start + 1)} — 1.º semestre`,
      startDate: new Date(Date.UTC(start, 8, 1)),
      endDate: new Date(Date.UTC(start + 1, 0, 31)),
    };
  }
  return {
    label: `${year - 1}/${yy(year)} — 2.º semestre`,
    startDate: new Date(Date.UTC(year, 1, 1)),
    endDate: new Date(Date.UTC(year, 6, 31)),
  };
}
