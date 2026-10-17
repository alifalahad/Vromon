/**
 * Picking and preparing photos before upload.
 *
 * The Android photo picker needs no storage permission. Each photo is re-encoded
 * on the phone (at most 2048 px, JPEG) so uploads stay small on mobile data; the
 * server re-encodes again and removes all metadata, GPS included (that is the
 * guarantee, not this step). Only the capture date is read from EXIF and sent.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PhotoUpload } from '../../services/api';

export const MAX_EDGE = 2048;
export const PICK_LIMIT = 10;
const QUALITY = 0.85;

export async function pickPhotos(): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: PICK_LIMIT,
    quality: 1,
    exif: true, // only for the capture date
  });
  return result.canceled ? [] : result.assets;
}

/** "2025:12:24 10:30:00" → "2025-12-24"; anything else (or a future date) → null. */
export function exifDate(exif: Record<string, unknown> | null | undefined, today = new Date()): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getFullYear() < 1900 || date.getMonth() !== Number(mo) - 1 || date > today) return null;
  return `${y}-${mo}-${d}`;
}

/** The size to resize to, keeping the aspect ratio; null when it's small enough. */
export function targetSize(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= MAX_EDGE) return null;
  return width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE };
}

export async function preparePhoto(asset: ImagePicker.ImagePickerAsset): Promise<PhotoUpload> {
  const context = ImageManipulator.manipulate(asset.uri);
  const size = targetSize(asset.width, asset.height);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, takenOn: exifDate(asset.exif) };
  } finally {
    image.release();
    context.release();
  }
}
