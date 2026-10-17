/**
 * Uploads in progress. Kept in a store (not component state) so that closing the
 * place sheet mid-upload and opening it again still shows the progress.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImagePickerAsset } from 'expo-image-picker';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { photosApi, type PhotoUpload } from '../../services/api';
import type { PhotoTarget } from '../../types';
import { haptics } from '../../ui/haptics';
import { notify } from '../../utils/dialogs';
import { pickPhotos, preparePhoto } from './prepare';
import { refreshPhotos } from './queries';

export interface PendingPhoto {
  key: string;
  targetKey: string;
  /** The picked file, shown while uploading */
  previewUri: string;
  progress: number;
  status: 'uploading' | 'failed';
  error?: string;
}

interface UploadState {
  pending: PendingPhoto[];
  set: (key: string, patch: Partial<PendingPhoto>) => void;
  add: (items: PendingPhoto[]) => void;
  remove: (key: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  pending: [],
  set: (key, patch) => set((s) => ({ pending: s.pending.map((p) => (p.key === key ? { ...p, ...patch } : p)) })),
  add: (items) => set((s) => ({ pending: [...s.pending, ...items] })),
  remove: (key) => set((s) => ({ pending: s.pending.filter((p) => p.key !== key) })),
}));

export function targetKey(target: PhotoTarget): string {
  return [target.place_type, target.place_code, target.trip_id].map((v) => v ?? '').join(':');
}

let counter = 0;
// What a failed upload needs to be retried
const retries = new Map<string, () => Promise<boolean>>();

/** Upload one picked photo; on failure the tile stays, with a retry. */
function uploadOne(key: string, asset: ImagePickerAsset, target: PhotoTarget): Promise<boolean> {
  let prepared: PhotoUpload | undefined;
  const attempt = async () => {
    const store = useUploadStore.getState();
    try {
      prepared ??= await preparePhoto(asset);
      await photosApi.upload(prepared, target, (progress) => useUploadStore.getState().set(key, { progress }));
      store.remove(key);
      retries.delete(key);
      return true;
    } catch (err) {
      store.set(key, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
      retries.set(key, attempt);
      return false;
    }
  };
  return attempt();
}

export function usePendingPhotos(target: PhotoTarget | null) {
  const key = target ? targetKey(target) : null;
  return useUploadStore(useShallow((s) => (key ? s.pending.filter((p) => p.targetKey === key) : [])));
}

/** Pick photos and upload them one by one to `target`, for the signed-in user. */
export function useAddPhotos(userId: string | undefined, target: PhotoTarget | null) {
  const client = useQueryClient();
  const { t } = useTranslation();

  return useCallback(async () => {
    if (!userId || !target) return;
    const assets = await pickPhotos();
    if (!assets.length) return;
    const items = assets.map((a) => ({
      key: `upload-${++counter}`,
      targetKey: targetKey(target),
      previewUri: a.uri,
      progress: 0,
      status: 'uploading' as const,
    }));
    useUploadStore.getState().add(items);
    let ok = 0;
    // One at a time: steady progress, and the phone isn't re-encoding ten photos at once
    for (const [i, asset] of assets.entries()) {
      if (await uploadOne(items[i].key, asset, target)) ok++;
      void refreshPhotos(client, userId);
    }
    if (ok === assets.length) haptics.success();
    else notify(t('photos.failedTitle'), t('photos.failedBody', { count: assets.length - ok }), 'error');
  }, [client, t, target, userId]);
}

/** Retry a failed upload, or drop it. */
export function useRetryPhoto(userId: string | undefined) {
  const client = useQueryClient();
  return {
    retry: async (key: string) => {
      const again = retries.get(key);
      if (!again) return;
      useUploadStore.getState().set(key, { status: 'uploading', progress: 0, error: undefined });
      const ok = await again();
      if (userId) void refreshPhotos(client, userId);
      if (ok) haptics.success();
      else haptics.error();
    },
    discard: (key: string) => {
      retries.delete(key);
      useUploadStore.getState().remove(key);
    },
  };
}
