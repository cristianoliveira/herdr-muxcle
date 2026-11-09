import { isSizingOperation, type DocumentSizingContext } from "./model.js";

export type SizingExec = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export async function executeDocumentEqualization(
  execute: SizingExec,
  helperDirectory: string,
  context: DocumentSizingContext,
  operation: string = "equalize",
): Promise<string> {
  if (!isSizingOperation(operation)) throw new Error("Unsupported pane sizing operation.");
  const payload = JSON.stringify(context);
  if (utf8Length(payload) > 96 * 1024) {
    throw new Error("Sizing context is too large; no helper was started.");
  }

  let result: Awaited<ReturnType<SizingExec>>;
  try {
    const args = ["-I", "-B", "equalize.py", payload];
    if (operation !== "equalize") args.push(operation);
    result = await execute("python3", args, { cwd: helperDirectory });
  } catch {
    throw new Error(
      "Sizing helper could not be confirmed; outcome may be uncertain. Check Python 3 and hc on Herdr's PATH.",
    );
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().slice(0, 512) || "Sizing helper failed; write outcome may be uncertain.");
  }
  if (result.stdout.length > 8_192) throw new Error("Sizing helper output is too large; outcome is uncertain.");
  return result.stdout;
}

function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}
