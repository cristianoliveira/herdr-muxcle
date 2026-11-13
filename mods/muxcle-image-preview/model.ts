const MAX_PATH_CHARS = 4_096;
const MAX_PIXELS = 25_000_000;
const PREVIEW_NAME = /^image-[0-9a-f]{64}\.(png|jpg)$/;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PreviewResult extends ImageDimensions {
  path: string;
}

export function imagePath(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PATH_CHARS + 2) {
    throw new Error("Paste one image file path, not a URL.");
  }

  let path = value.trim();
  if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
    path = path.slice(1, -1);
  }
  if (!path || path.length > MAX_PATH_CHARS || /[\u0000-\u001f\u007f]/.test(path) || path.includes("://")) {
    throw new Error("Paste one image file path, not a URL.");
  }
  return path;
}

export function fitImage(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): ImageDimensions {
  if (![width, height, availableWidth, availableHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Image and viewport dimensions must be positive finite numbers.");
  }
  const scale = Math.min(availableWidth / width, availableHeight / height);
  return { width: width * scale, height: height * scale };
}

export function previewAsset(result: unknown, appHome: string): string {
  if (typeof appHome !== "string" || appHome.length === 0) {
    throw new Error("Invalid preview cache location.");
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Invalid preview asset.");
  }

  const candidate = result as Record<string, unknown>;
  const cacheRoot = `${appHome.replace(/\/+$/, "")}/image-previews/`;
  const path = candidate.path;
  if (typeof path !== "string" || !path.startsWith(cacheRoot)) {
    throw new Error("Invalid preview asset.");
  }

  const name = path.slice(cacheRoot.length);
  const { width, height } = candidate;
  if (
    !PREVIEW_NAME.test(name) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_PIXELS
  ) {
    throw new Error("Invalid preview asset.");
  }
  return `image-previews/${name}`;
}
