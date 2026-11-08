import type { DocumentRotationContext } from "./model.js";

export type RotationExec = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export async function executeDocumentRotation(
  execute: RotationExec,
  helperDirectory: string,
  context: DocumentRotationContext,
): Promise<string> {
  const payload = JSON.stringify(context);
  let bytes = 0;
  for (const character of payload) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  if (bytes > 96 * 1024) throw new Error("Rotation context is too large; no helper was started.");

  let result: Awaited<ReturnType<RotationExec>>;
  try {
    result = await execute("python3", ["-I", "-B", "rotate.py", payload], { cwd: helperDirectory });
  } catch {
    throw new Error(
      "Rotation helper could not be confirmed; outcome may be uncertain. Check Python 3 and hc on Herdr's PATH.",
    );
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().slice(0, 512) || "Rotation helper failed; write outcome is uncertain.");
  }
  if (result.stdout.length > 8_192) throw new Error("Rotation helper output is too large; outcome is uncertain.");
  return result.stdout;
}
