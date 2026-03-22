import { open } from "node:fs/promises";
import { fileTypeFromBuffer } from "file-type";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const FILE_TYPE_SNIFF_BYTES = 4100;

export async function detectSupportedImageMimeTypeFromBuffer(
  buffer: Uint8Array,
): Promise<string | null> {
  if (buffer.byteLength === 0) {
    return null;
  }

  const fileType = await fileTypeFromBuffer(
    buffer.subarray(0, FILE_TYPE_SNIFF_BYTES),
  );
  if (!fileType) {
    return null;
  }

  if (!IMAGE_MIME_TYPES.has(fileType.mime)) {
    return null;
  }

  return fileType.mime;
}

export async function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<string | null> {
  const fileHandle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(FILE_TYPE_SNIFF_BYTES);
    const { bytesRead } = await fileHandle.read(
      buffer,
      0,
      FILE_TYPE_SNIFF_BYTES,
      0,
    );
    if (bytesRead === 0) {
      return null;
    }

    return detectSupportedImageMimeTypeFromBuffer(
      buffer.subarray(0, bytesRead),
    );
  } finally {
    await fileHandle.close();
  }
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([k, v]) => [v, k]),
);

export const mimeToExtension = (mimeType: string) =>
  MIME_TO_EXT[mimeType] ?? ".bin";

export const extensionToMime = (ext: string) =>
  EXT_TO_MIME[ext] ?? "application/octet-stream";
