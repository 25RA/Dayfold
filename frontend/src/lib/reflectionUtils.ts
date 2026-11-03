/**
 * Utilities for parsing and serializing expandable additional reflection thoughts.
 * Stores thoughts in the existing TEXT column (additional_notes) as a JSON array of strings
 * with 100% backward compatibility for legacy plain-text strings.
 */

export function parseAdditionalThoughts(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) {
    return [''];
  }
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const strings = parsed.map((item) => (typeof item === 'string' ? item : String(item)));
      return strings.length > 0 ? strings : [''];
    }
  } catch {
    // Legacy plain text note fallback
  }
  return [trimmed];
}

export function serializeAdditionalThoughts(thoughts: string[]): string | null {
  const cleaned = thoughts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) {
    return null;
  }
  return JSON.stringify(cleaned);
}

export function getDisplayableThoughts(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }
  const thoughts = parseAdditionalThoughts(raw);
  return thoughts.map((t) => t.trim()).filter((t) => t.length > 0);
}

