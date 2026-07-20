# EduGuard Mobile Development with Capacitor

## What Capacitor does

Capacitor packages EduGuard's existing React application inside a native Android or iOS shell. The React code is still built by Vite and runs in a native WebView; it is not rewritten in React Native.

```text
React/TypeScript source
        ↓ npm run build
frontend/dist
        ↓ npx cap sync
Android WebView / iOS WKWebView
        ↓ HTTPS + WSS
ASP.NET Core API, MongoDB and SignalR
```

Most frontend code remains shared. Capacitor plugins provide access to native features such as app lifecycle events, network status, push notifications, camera, files, and secure device storage.

> Current status: EduGuard supports browser/home-screen installation, but Capacitor native projects have not been added yet.

## Prerequisites

- A supported Node.js and npm version
- Android Studio, Android SDK and a supported JDK for Android builds
- macOS, Xcode and an Apple Developer account for iOS builds
- An HTTPS production API URL

## One-time setup

Run these commands from `frontend`:

```powershell
npm install @capacitor/core @capacitor/android @capacitor/ios
npm install @capacitor/app @capacitor/network @capacitor/push-notifications @capacitor/splash-screen
npm install -D @capacitor/cli @capacitor/assets

npx cap init "EduGuard" "com.eduguard.app" --web-dir dist
npx cap add android
npx cap add ios
```

Confirm the final package ID before publishing. Changing it later creates a different Play Store or App Store application.

The generated `capacitor.config.ts` should use the Vite output directory:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eduguard.app",
  appName: "EduGuard",
  webDir: "dist",
};

export default config;
```

Do not configure a production `server.url`. Production builds should package the local `dist` files instead of loading the Vercel website inside a remote WebView.

## API configuration

Set the production backend URL in `frontend/.env.production`:

```env
VITE_API_URL=https://api.example.com
```

The backend must use HTTPS, SignalR must connect over WSS, and ASP.NET Core CORS must explicitly allow the generated Capacitor WebView origins. Never use a wildcard CORS policy with authenticated requests.

## Daily development workflow

After changing React code:

```powershell
cd frontend
npm run build
npx cap sync
```

Run on a device or emulator:

```powershell
npx cap run android
npx cap run ios
```

Open the native projects when platform configuration is required:

```powershell
npx cap open android
npx cap open ios
```

`npx cap sync` copies the latest `dist` build into both native projects and updates installed native plugins. Forgetting this step leaves the device running an older frontend build.

## Android APK and Play Store bundle

For local testing:

```powershell
cd frontend
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The debug APK is generated under `frontend/android/app/build/outputs/apk/debug/`.

For Google Play, configure a release signing key outside the repository and build an Android App Bundle:

```powershell
.\gradlew.bat bundleRelease
```

Upload the generated `.aab` through Play Console internal testing before production release.

## iOS and App Store

iOS builds require macOS:

```bash
cd frontend
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode, select the Apple development team, configure signing and capabilities, test on a physical iPhone, then use **Product → Archive** to upload the build to TestFlight and App Store Connect.

## EduGuard-specific behavior

### SignalR chat

SignalR WebSockets work while the app is active. Android and iOS may suspend the WebView when the app is backgrounded, so the app must reconnect, rejoin chat groups and fetch missed messages when it resumes. Closed-app notifications require native push; SignalR alone cannot provide them.

### Authentication

Do not keep long-lived JWTs in WebView `localStorage` for a production native release. Keep short-lived access tokens in memory and store the rotating refresh credential in Android Keystore or iOS Keychain through a maintained secure-storage plugin.

### Push notifications

The Capacitor Push Notifications plugin receives device tokens. EduGuard still needs authenticated backend endpoints to register/unregister those tokens and a Firebase/APNs sender for messages, assignments, announcements and risk alerts.

### Offline attendance

Do not synchronize an offline attendance record after the server time window by trusting a device timestamp. Late synchronization needs a short-lived server-issued attendance ticket, idempotency key and audit timestamps. Without that backend feature, outside-window submissions must remain rejected.

### Excel and report files

The existing HTML file input can open the native document picker. Add camera or filesystem plugins only when a real camera/file-management requirement exists.

## Icons and splash screens

Use the supplied EduGuard shield logo as the source asset, then generate platform resources:

```powershell
npx capacitor-assets generate
npx cap sync
```

Review Android adaptive icons and iOS icons in their native projects before release.

## What should be committed

Commit `capacitor.config.ts`, `android/`, `ios/`, package changes and source assets. Do not commit signing keys, keystore passwords, Apple certificates, Firebase service-account secrets, production environment files or generated build outputs.

Official documentation: [Capacitor getting started](https://capacitorjs.com/docs/getting-started) and [development workflow](https://capacitorjs.com/docs/basics/workflow).
