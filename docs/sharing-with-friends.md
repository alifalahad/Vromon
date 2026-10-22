# Sharing Vromon with friends (free, from this Mac)

Before hosting exists (`docs/go-live.md`), friends anywhere can use Vromon through a free
Cloudflare quick tunnel to this Mac. **It works only while the Mac is on and the share is running.**

## How it fits together

- **The friends' app** is the *preview* variant: "Vromon (Preview)", package `com.vromon.app.preview`.
  It sits next to your dev app on a phone and doesn't replace it.
- **At start, it reads where the backend is** from a small public file:
  `https://qwogxxitmlvjuwviwdab.supabase.co/storage/v1/object/public/share/config.json`
  (`{"apiUrl":"https://….trycloudflare.com"}`).
  - The address changes every time the share starts, and the app picks up the new one at its next start, so the APK never needs rebuilding.
  - The phone keeps the last address that worked (`src/services/serverConfig.ts`).
  - Only `https://` addresses are accepted.
- **`scripts/share/start.sh`:**
  - starts a second backend on `127.0.0.1:8002` in **production mode**: sign-in is required, there's no dev shortcut, and admin needs a token;
  - opens the tunnel and publishes its address;
  - serves the APK from `scripts/share/apk/` on a second tunnel;
  - keeps the Mac awake.
  - It uses the same database as development, so your account and your friends' accounts are in one place (friends can add each other, and you).
- **The Supabase service key** stays in `backend/.env`. Only `publish_config.py` uses it, and only to talk to Supabase. The app holds nothing secret.

## Every time you want friends to use it

```bash
cd ~/Codes/Vromon
scripts/share/start.sh
```

- Leave that Terminal window open. The script prints the **APK download link** (it changes each run).
- **To stop:** press Ctrl+C, or close the Terminal window (that stops everything too). If something was left running (the Mac crashed, or the script was force-killed), `scripts/share/stop.sh` stops it.
- If friends had the app open while the share was off, they close it fully and reopen it.
- **A link that doesn't change:** upload `scripts/share/apk/vromon.apk` (106 MB) to Google Drive once and share that link ("Anyone with the link"). Friends need the APK only once; after that they just open the app.

## Testing the friends' app on a phone

- The Maestro flows set `APP_ID` (and `launch.yaml` sets `DEV_CLIENT`) in their own `env`, and with Maestro 2.11 that beats `-e`. So to test the preview app, run a copy of `.maestro` with `com.vromon.app.dev` replaced by `com.vromon.app.preview` and `DEV_CLIENT: "true"` by `"false"`.
- On 2026-10-22, flows 00, 01, 05, 06, 09 and 99 passed this way on the realme phone. The phone had no USB route to the share backend, so every request went through the tunnel.

## Building the friends' APK again (only after app code changes)

```bash
cd ~/Codes/Vromon/mobile
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-22.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk SENTRY_DISABLE_AUTO_UPLOAD=true
APP_VARIANT=preview EXPO_PUBLIC_CONFIG_URL=https://qwogxxitmlvjuwviwdab.supabase.co/storage/v1/object/public/share/config.json \
  npx expo prebuild -p android --clean --no-install
(cd android && APP_VARIANT=preview EXPO_PUBLIC_CONFIG_URL=https://qwogxxitmlvjuwviwdab.supabase.co/storage/v1/object/public/share/config.json \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)
mkdir -p ../scripts/share/apk && cp android/app/build/outputs/apk/release/app-release.apk ../scripts/share/apk/vromon.apk
npx expo prebuild -p android --clean --no-install    # back to your dev app's native project
```

- Friends install the new APK over the old one; their data stays.
- **The release is signed with the debug key.** Fine for friends; Play Store builds go through EAS (`docs/go-live.md`).

## Limits

| Limit | What it means |
|---|---|
| Mac off, asleep, offline, or the script stopped | Friends see "Cannot reach the server"; plans they already opened still show from the phone's saved copy |
| Sign-up emails | Supabase's built-in email sender allows only a few emails an hour. If a friend's confirmation email doesn't come, confirm them in Supabase → Authentication → Users |
| Friend request and push notifications | Not delivered (no Firebase project yet). The Friends badge still updates in the app |
| Speed | Every request goes Mac ↔ Cloudflare ↔ phone; slower than real hosting, fine for a few friends |
| Quick tunnels | Free, no account, no uptime promise from Cloudflare. For anything bigger, use the hosting in `docs/go-live.md` |
