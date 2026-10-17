import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert } from 'react-native';

import { PhotoGrid, PhotoStrip } from '../features/photos/PhotoStrip';
import { exifDate, MAX_EDGE, preparePhoto, targetSize } from '../features/photos/prepare';
import { filterKey, msUntilRefresh } from '../features/photos/queries';
import { useUploadStore } from '../features/photos/uploads';
import '../i18n';
import { photosApi } from '../services/api';
import type { Photo } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../services/api', () => ({ photosApi: { forUser: jest.fn(), upload: jest.fn(), remove: jest.fn() } }));

const api = photosApi as unknown as Record<'forUser' | 'upload' | 'remove', jest.Mock>;
const picker = ImagePicker.launchImageLibraryAsync as jest.Mock;
const { haptics } = jest.requireMock('../ui/haptics') as { haptics: Record<string, jest.Mock> };

const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

const photo = (id: string, extra: Partial<Photo> = {}): Photo => ({
  id,
  url: `https://cdn/${id}/full.jpg?token=t`,
  thumb_url: `https://cdn/${id}/thumb.jpg?token=t`,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  width: 2048,
  height: 1536,
  taken_on: '2025-12-24',
  place_type: 'country',
  place_code: 'BD',
  place_name: 'Bangladesh',
  country_iso2: 'BD',
  trip_id: null,
  created_at: '2026-10-17T08:00:00Z',
  ...extra,
});

const asset = (uri: string, width = 4000, height = 3000) => ({ uri, width, height, exif: { DateTimeOriginal: '2025:12:24 10:30:00', GPSLatitude: 23.7 } });
const BD = { place_type: 'country' as const, place_code: 'BD' };

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.setState({ pending: [] });
});

describe('preparing photos', () => {
  it('reads only the capture date from EXIF, never a future or malformed one', () => {
    expect(exifDate({ DateTimeOriginal: '2025:12:24 10:30:00' })).toBe('2025-12-24');
    expect(exifDate({ DateTime: '2024-02-29 08:00:00' })).toBe('2024-02-29');
    expect(exifDate({ DateTimeOriginal: '2025:02:30 10:00:00' })).toBeNull();
    expect(exifDate({ DateTimeOriginal: '2999:01:01 00:00:00' })).toBeNull();
    expect(exifDate({ DateTimeOriginal: 'yesterday' })).toBeNull();
    expect(exifDate(null)).toBeNull();
  });

  it('shrinks the long edge to 2048 and keeps small photos as they are', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: MAX_EDGE });
    expect(targetSize(3000, 4000)).toEqual({ height: MAX_EDGE });
    expect(targetSize(1600, 1200)).toBeNull();
  });

  it('re-encodes as JPEG and sends only the file and its date', async () => {
    const prepared = await preparePhoto(asset('file:///picked.heic') as unknown as ImagePicker.ImagePickerAsset);
    const context = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value;
    expect(context.resize).toHaveBeenCalledWith({ width: MAX_EDGE });
    const image = await context.renderAsync.mock.results[0].value;
    expect(image.saveAsync).toHaveBeenCalledWith({ compress: 0.85, format: 'jpeg' });
    expect(prepared).toEqual({ uri: 'file:///cache/prepared.jpg', takenOn: '2025-12-24' }); // no GPS
    expect(image.release).toHaveBeenCalled();
  });
});

describe('photo lists', () => {
  it('refresh a minute before the signed URLs run out', () => {
    const now = Date.parse('2026-10-17T08:00:00Z');
    const soon = photo('a', { expires_at: '2026-10-17T08:10:00Z' });
    expect(msUntilRefresh([soon], now)).toBe(9 * 60_000);
    expect(msUntilRefresh([photo('b', { expires_at: '2026-10-17T08:00:30Z' })], now)).toBe(5_000);
    expect(msUntilRefresh([], now)).toBe(false);
  });

  it('key places, trips and everything apart', () => {
    expect(filterKey(BD)).toBe('country:BD');
    expect(filterKey({ trip_id: 4 })).toBe('trip:4');
    expect(filterKey({})).toBe('all');
  });
});

describe('PhotoStrip', () => {
  it('your place: Add picks photos and uploads each one to that place', async () => {
    api.forUser.mockResolvedValue([]);
    picker.mockResolvedValue({ canceled: false, assets: [asset('file:///a.jpg'), asset('file:///b.jpg', 800, 600)] });
    let finish: (v: Photo) => void = () => undefined;
    api.upload.mockImplementation(() => new Promise<Photo>((resolve) => (finish = resolve)));

    await renderWithQuery(<PhotoStrip ownerId="me" filter={BD} target={BD} canEdit />);
    expect(await screen.findByText(/Location data is removed/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('photo-add')));

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true }));
    expect(await screen.findAllByTestId('photo-uploading')).toHaveLength(2);
    await act(async () => finish(photo('p1')));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
    expect(api.upload.mock.calls[0][0]).toEqual({ uri: 'file:///cache/prepared.jpg', takenOn: '2025-12-24' });
    expect(api.upload.mock.calls[0][1]).toEqual(BD);
    await act(async () => finish(photo('p2')));
    await waitFor(() => expect(screen.queryByTestId('photo-uploading')).toBeNull());
    expect(haptics.success).toHaveBeenCalledTimes(1);
    expect(api.forUser.mock.calls.length).toBeGreaterThan(1); // the list refreshed
  });

  it('a failed upload stays with a retry', async () => {
    api.forUser.mockResolvedValue([]);
    picker.mockResolvedValue({ canceled: false, assets: [asset('file:///a.jpg')] });
    api.upload.mockRejectedValueOnce(new Error('Cannot reach the server')).mockResolvedValueOnce(photo('p1'));
    const alert = jest.spyOn(Alert, 'alert');

    await renderWithQuery(<PhotoStrip ownerId="me" filter={BD} target={BD} canEdit />);
    await act(async () => fireEvent.press(await screen.findByTestId('photo-add')));
    expect(await screen.findByTestId('photo-failed')).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Upload failed', expect.stringContaining('1 photo'));
    expect(haptics.success).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('photo-failed'));
    const buttons = alert.mock.calls.at(-1)![2]!;
    await act(async () => buttons.find((b) => b.text === 'Retry')!.onPress!());
    await waitFor(() => expect(screen.queryByTestId('photo-failed')).toBeNull());
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(haptics.success).toHaveBeenCalled();
  });

  it('cancelling the picker uploads nothing', async () => {
    api.forUser.mockResolvedValue([]);
    picker.mockResolvedValue({ canceled: true, assets: null });
    await renderWithQuery(<PhotoStrip ownerId="me" filter={BD} target={BD} canEdit />);
    await act(async () => fireEvent.press(await screen.findByTestId('photo-add')));
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('opens the viewer, where you can delete your own photo', async () => {
    api.forUser.mockResolvedValue([photo('p1'), photo('p2')]);
    api.remove.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithQuery(<PhotoStrip ownerId="me" filter={BD} target={BD} canEdit />);
    await fireEvent.press(await screen.findByTestId('photo-p2'));
    expect(screen.getByTestId('photo-viewer')).toBeTruthy();
    expect(screen.getByText('Bangladesh', { exact: false })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('photo-delete'));
    expect(alert.mock.calls.at(-1)![0]).toBe('Delete this photo?');
    const buttons = alert.mock.calls.at(-1)![2]!;
    await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());
    expect(api.remove).toHaveBeenCalledWith('p2');
    expect(haptics.warning).toHaveBeenCalled();
  });
});

describe("a friend's photos", () => {
  it('are a read-only grid: no Add, no Delete', async () => {
    api.forUser.mockResolvedValue([photo('f1')]);
    await renderWithQuery(<PhotoGrid ownerId="friend" filter={{}} />);
    await fireEvent.press(await screen.findByTestId('photo-f1'));
    expect(api.forUser).toHaveBeenCalledWith('friend', {});
    expect(screen.queryByTestId('photo-add')).toBeNull();
    expect(screen.queryByTestId('photo-delete')).toBeNull();
  });

  it('say so when there are none', async () => {
    api.forUser.mockResolvedValue([]);
    await renderWithQuery(<PhotoGrid ownerId="friend" filter={{}} />);
    expect(await screen.findByText('No photos yet')).toBeTruthy();
  });
});
