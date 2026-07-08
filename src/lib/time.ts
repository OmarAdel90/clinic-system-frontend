export function formatLocalDateTime(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
}

export function formatRelativeDateLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Tomorrow";
  }

  if (diffDays === -1) {
    return "Yesterday";
  }

  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d overdue`;
  }

  return `In ${diffDays}d`;
}

export function looksLikeDateKey(key: string) {
  return /(?:^|_)(at|date|time)$/.test(key);
}

export function looksLikeDateValue(value: unknown) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2})/.test(value)
  );
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
