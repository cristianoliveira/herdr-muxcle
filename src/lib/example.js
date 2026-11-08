// Minimal runnable example of a pure Herdr mod helper.
export function normalizeLabel(value) {
  return String(value).trim().replace(/\s+/g, " ");
}
