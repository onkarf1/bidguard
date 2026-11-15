"use client";
import exifr from "exifr";
import type { ExifSummary } from "./agents-types";

export type PreparedImage = { dataUrl: string; dhash: string; exif: ExifSummary | null; name: string };

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });

/** 64-bit difference hash: survives resizing/re-compression, so reused photos are caught. */
function dhash(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  };
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray(x, y) > gray(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Reads camera metadata from the original file, then downsizes to a ≤1024px JPEG for upload. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use JPEG, PNG or WebP photos");
  if (file.size > 15 * 1024 * 1024) throw new Error("Each photo must be under 15 MB");
  let exif: ExifSummary | null = null;
  try {
    const t = await exifr.parse(file, { pick: ["Make", "Model", "DateTimeOriginal", "Software", "GPSLatitude"] });
    if (t) exif = { make: t.Make?.slice(0, 60), model: t.Model?.slice(0, 60), taken: t.DateTimeOriginal ? new Date(t.DateTimeOriginal).toISOString() : undefined, software: t.Software?.slice(0, 80), hasGps: t.GPSLatitude != null };
  } catch {
    /* no metadata */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL("image/jpeg", 0.82), dhash: dhash(img), exif, name: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}
