# Google Play Data safety answers

Answers for Play Console → App content → Data safety, matching the app as built (Android Phase 8). Keep in sync with `docs/legal/privacy-policy.md`.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only in release builds) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in the app (Settings → Your data → Delete account) and a web URL [TO FILL] |

## Data types

"Shared" means sent to a third party for its own purposes; service providers acting for us (Supabase, the host, Sentry, Expo) are **not** sharing under Play's definition. Nothing is used for ads or sold.

| Category → type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | Required | Account management |
| Personal info → **Name** (display name) | Yes | No | Optional | App functionality |
| Personal info → **User IDs** (account id, username, friend code) | Yes | No | Required | App functionality, account management |
| Photos and videos → **Photos** | Yes | No | Optional | App functionality |
| App activity → **Other user-generated content** (places marked, trips, notes, feedback) | Yes | No | Required for the core features | App functionality |
| App info and performance → **Crash logs**, **Diagnostics** | Only when Sentry is on | No | Required when on | Analytics (crash diagnosis) |
| Device or other IDs → **Device or other IDs** (Expo push token) | Only when notifications are allowed | No | Optional | App functionality (notifications) |

**Not collected:** location (approximate or precise: the app has no location permission; places are chosen by the user), contacts, calendar, messages, audio, health, financial info, web history, installed apps, advertising ID.

**Processed ephemerally / not stored:** camera frames for QR scanning (on the device only).

## Security practices

- Data is encrypted in transit: **Yes**.
- Users can request deletion: **Yes**.
- Committed to the Play Families policy: **No** (not designed for children).
- Independent security review: **No**.

## Related Play declarations

- **Account deletion URL:** required (web page explaining how to delete, plus a form or email) [TO FILL].
- **Privacy policy URL:** host `docs/legal/privacy-policy.md` [TO FILL].
- **Camera permission:** used only to scan friend QR codes; a rationale screen is shown before the system prompt.
- **Photo picker:** no storage or media permission is requested (`READ_MEDIA_*` and storage permissions are blocked in the manifest).
- **Target API level:** set by Expo SDK 57 (API 36), which meets Play's current requirement.
