import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { meApi } from '../../services/api';

/** Everything the account holds (GET /me/export, chats included), as a JSON file to share or save. */
export async function exportMyData() {
  const data = await meApi.export();
  const file = new File(Paths.cache, `vromon-export-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Vromon data export' });
}
