/**
 * Safely read a JSON-serialized value from localStorage, returning `defaultValue`
 * if unavailable, unparseable, or rejected by an optional validator.
 */
export function getStorageItem<T>(
  key: string,
  defaultValue: T,
  validate?: (value: unknown) => value is T
): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    if (validate && !validate(parsed)) {
      return defaultValue;
    }
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely serialize and persist a value to localStorage.
 */
export function setStorageItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}
