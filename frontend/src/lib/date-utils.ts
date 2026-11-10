/**
 * Date and Time utilities for InfraScan
 * Enforces Indian Standard Time (IST, UTC+05:30) per project requirements.
 * Automatically normalizes database UTC timestamps (with or without 'Z')
 * to accurate IST wall-clock time.
 */

export function parseDateInput(dateInput: string | number | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === "number") {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  let str = String(dateInput).trim();
  if (!str) return null;

  // Pure date format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T12:00:00Z`);
  }

  // Replace whitespace separator with T
  str = str.replace(" ", "T");

  // If there is no timezone offset at the end (e.g. no Z and no +HH:MM / -HH:MM),
  // treat the database naive timestamp as UTC (standard for backend SQLite / UTC storage)
  if (!str.endsWith("Z") && !/[+-]\d{2}(?::?\d{2})?$/.test(str)) {
    str += "Z";
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatISTDateTime(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "—";
  try {
    const d = parseDateInput(dateInput);
    if (!d) return String(dateInput);
    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d) + " IST"
    );
  } catch {
    return String(dateInput);
  }
}

export function formatISTTimeOnly(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "—";
  try {
    const d = parseDateInput(dateInput);
    if (!d) return String(dateInput);
    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d) + " IST"
    );
  } catch {
    return String(dateInput);
  }
}

export function formatISTDateOnly(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "—";
  try {
    const d = parseDateInput(dateInput);
    if (!d) return String(dateInput);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateInput);
  }
}
