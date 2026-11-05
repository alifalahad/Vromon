/**
 * Pictures leave the app two ways: saved to the phone's gallery (album "Vromon"), or handed to
 * Android's share sheet, where Instagram and Facebook offer Story, Feed or a message. Pictures
 * from the server (district maps) are downloaded to the cache first.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';

const ALBUM = 'Vromon';

export type SaveResult = 'saved' | 'denied' | 'failed';

/** A local copy of a picture on the server (kept in the cache; the same URL is downloaded once). */
export async function localCopy(url: string, name: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'shared');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  if (file.exists && file.size > 0) return file.uri;
  const got = await File.downloadFileAsync(url, file, { idempotent: true });
  return got.uri;
}

export async function saveToGallery(uri: string): Promise<SaveResult> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!perm.granted) return 'denied';
    const asset = await MediaLibrary.createAssetAsync(uri);
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM);
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync(ALBUM, asset, false);
    } catch {
      // Saved to the gallery already; the album is a nicety
    }
    return 'saved';
  } catch {
    return 'failed';
  }
}

export async function shareImage(uri: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const mimeType = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType === 'image/png' ? 'public.png' : 'public.jpeg' });
  return true;
}
