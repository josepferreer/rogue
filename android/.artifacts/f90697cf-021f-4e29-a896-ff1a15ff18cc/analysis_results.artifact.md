# Android App Review: Permissions, Security, and Configuration

I have analyzed the native Android configuration of the **Rogue** app. Below is a summary of the current state and recommended improvements.

## Permissions Analysis

The `AndroidManifest.xml` is correctly configured for the plugins listed in `package.json`, with some extra permissions:

| Permission | Purpose | Status |
| :--- | :--- | :--- |
| `INTERNET` | Core app functionality | ✅ OK |
| `ACCESS_FINE_LOCATION` | Foreground geolocation | ✅ OK |
| `ACCESS_BACKGROUND_LOCATION` | Background tracking | ⚠️ Requires strict Play Store disclosure |
| `FOREGROUND_SERVICE` | Background task execution | ✅ OK (Required for API 28+) |
| `FOREGROUND_SERVICE_LOCATION` | Background location tracking | ✅ OK (Required for API 34+) |
| `POST_NOTIFICATIONS` | Local notifications | ✅ OK (Required for API 33+) |
| `CAMERA` | Barcode scanning / photos | ℹ️ Permission present but plugin missing in `package.json` |

> [!WARNING]
> **ACCESS_BACKGROUND_LOCATION** is a high-sensitivity permission. To publish on Google Play, you must provide a prominent in-app disclosure and a privacy policy explaining why the app needs to track location while closed.

## Security & Configuration

### 1. Deep Links
The app defines a custom URL scheme `com.rogue.app` in `strings.xml`, but the **intent filter is missing** in the `AndroidManifest.xml`. Without this, external links (like `com.rogue.app://home`) won't open the app.

### 2. Data Backup
Currently, `android:allowBackup="true"` is enabled.
> [!TIP]
> If your app handles sensitive user data (via Supabase, etc.), it is recommended to set this to `false` to prevent data extraction via ADB backups.

### 3. Cleartext Traffic
`android:usesCleartextTraffic` is NOT enabled. This is good for security as it enforces `https`. However, if you need to test against a local dev server (e.g., `http://192.168.1.50:3000`), you will need to enable this or use a Network Security Config.

### 4. Firebase (Push Notifications)
The build script checks for `google-services.json`, but it is **missing** in the `app/` directory. If you plan to use Push Notifications (not just Local ones), you'll need to add this file from the Firebase Console.

### 5. SDK Versions
- **Compile/Target SDK**: 36 (Bleeding edge).
- **Min SDK**: 24 (Android 7.0).
This is a good range, but ensure your plugins support API 36 behaviors.

## Summary of Recommendations
1. **Add Deep Link support** to the Manifest.
2. **Disable allowBackup** unless explicitly needed.
3. **Verify Camera requirement**: Either add the plugin (e.g., `@capacitor/camera`) or remove the permission to keep the app "lean".
