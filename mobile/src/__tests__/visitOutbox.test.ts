import { QueryClient } from '@tanstack/react-query';

import { clearVisit, flushOutbox, setVisitStatus, statusOf, useVisitOutbox, visitsKey } from '../features/map/visits';
import { ApiError, visitsApi } from '../services/api';
import type { Visit } from '../types';

jest.mock('../features/auth/supabase', () => ({ supabase: null, authRedirectUrl: () => '' }));
jest.mock('../services/api', () => {
  const actual = jest.requireActual('../services/api');
  return { ...actual, visitsApi: { upsert: jest.fn(), remove: jest.fn(), forUser: jest.fn(), stats: jest.fn() } };
});

const upsert = visitsApi.upsert as jest.Mock;
const remove = visitsApi.remove as jest.Mock;
const offline = () => Promise.reject(new ApiError('Cannot reach the server'));
const ME = 'user-1';

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  // gcTime Infinity: no garbage-collection timer to keep Jest alive after the tests
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  useVisitOutbox.setState({ userId: null, ops: [] });
});

const cached = () => client.getQueryData<Visit[]>(visitsKey(ME));

it('updates the map immediately and keeps the edit queued while offline', async () => {
  upsert.mockImplementation(offline);
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'BD' }, 'lived');
  expect(statusOf(cached(), 'country', 'BD')).toBe('lived'); // optimistic
  await flushOutbox(ME, client);
  expect(useVisitOutbox.getState().ops).toHaveLength(1);
  expect(useVisitOutbox.getState().ops[0]).toMatchObject({ kind: 'upsert', visit: { place_code: 'BD', status: 'lived' } });
});

it('sends the queue when the server is reachable again, in order', async () => {
  upsert.mockImplementation(offline);
  remove.mockImplementation(offline);
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'NP' }, 'want');
  clearVisit(client, ME, { place_type: 'city', place_code: '1185241' });
  await flushOutbox(ME, client);
  expect(useVisitOutbox.getState().ops).toHaveLength(2);

  upsert.mockResolvedValue([]);
  remove.mockResolvedValue(undefined);
  await flushOutbox(ME, client);
  expect(useVisitOutbox.getState().ops).toHaveLength(0);
  expect(upsert).toHaveBeenLastCalledWith([expect.objectContaining({ place_code: 'NP', status: 'want', client_updated_at: expect.any(String) })]);
  expect(remove).toHaveBeenLastCalledWith('city', '1185241');
});

it('keeps only the latest queued change per place', async () => {
  upsert.mockImplementation(offline);
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'IN' }, 'want');
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'IN' }, 'visited');
  await flushOutbox(ME, client);
  const ops = useVisitOutbox.getState().ops;
  expect(ops).toHaveLength(1);
  expect(ops[0]).toMatchObject({ visit: { status: 'visited' } });
});

it('drops an edit the server rejects so it cannot block the queue', async () => {
  upsert.mockRejectedValueOnce(new ApiError('Unknown places', 422)).mockResolvedValue([]);
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'ZZ' }, 'visited');
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'FR' }, 'visited');
  await flushOutbox(ME, client);
  expect(useVisitOutbox.getState().ops).toHaveLength(0);
  expect(upsert).toHaveBeenCalledTimes(2);
});

it("never sends another account's queued edits", async () => {
  upsert.mockImplementation(offline);
  setVisitStatus(client, 'someone-else', { place_type: 'country', place_code: 'JP' }, 'visited');
  upsert.mockReset().mockResolvedValue([]);
  await flushOutbox(ME, client);
  expect(upsert).not.toHaveBeenCalled();
  // A new edit by this account replaces the other account's queue
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'BD' }, 'visited');
  await flushOutbox(ME, client);
  expect(upsert).toHaveBeenCalledTimes(1);
  expect(upsert.mock.calls[0][0][0].place_code).toBe('BD');
});

it('sends only the API fields, even when given a richer place object', async () => {
  upsert.mockResolvedValue([]);
  const searchResult = { place_type: 'country' as const, place_code: 'BD', country_iso2: 'BD', name: 'Bangladesh', detail: '', flag: '🇧🇩' };
  setVisitStatus(client, ME, searchResult, 'lived');
  await flushOutbox(ME, client);
  expect(Object.keys(upsert.mock.calls[0][0][0]).sort()).toEqual(['client_updated_at', 'place_code', 'place_type', 'status']);
  expect(statusOf(cached(), 'country', 'BD')).toBe('lived');
});

it('refetches after dropping a rejected edit so the map shows the server state', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  upsert.mockRejectedValue(new ApiError('Unknown places', 422));
  setVisitStatus(client, ME, { place_type: 'country', place_code: 'ZZ' }, 'visited');
  await flushOutbox(ME, client);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: visitsKey(ME) });
});
