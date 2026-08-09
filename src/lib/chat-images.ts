import type { FileUIPart } from "ai";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 3_500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Downscale + JPEG-compress for chat (keeps spreadsheets readable). */
export async function fileToImagePart(file: File): Promise<FileUIPart> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    const url = await readFileAsDataUrl(file);
    return {
      type: "file",
      mediaType: file.type || "image/png",
      filename: file.name || "image.png",
      url,
    };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  // If still huge, compress harder
  if (url.length > MAX_BYTES) {
    url = canvas.toDataURL("image/jpeg", 0.65);
  }

  return {
    type: "file",
    mediaType: "image/jpeg",
    filename: (file.name || "image").replace(/\.\w+$/, "") + ".jpg",
    url,
  };
}

export async function clipboardImagesToParts(
  items: DataTransferItemList | undefined
): Promise<FileUIPart[]> {
  if (!items?.length) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return Promise.all(files.map(fileToImagePart));
}
