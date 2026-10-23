# ADVERSE for Android

This is the native Android companion for ADVERSE. It is designed to be selectable as a handler for ordinary `http://` and `https://` links, and for shared text containing a URL. Incoming web links open in the ADVERSE app's browser-style WebView, with Android back navigation.

## Build an APK

The GitHub Actions workflow **Build ADVERSE Android APK** builds a debug APK on pushes affecting `android-app/**`. Download `ADVERSE-android-debug` from the workflow run's Artifacts section. A debug APK is for direct testing; it is not a Play Store release.

## Install and test

1. Install the APK on Android.
2. Tap a web link in another app, or long-press a link and select **Open with** if that app offers the chooser.
3. Choose **ADVERSE**. Depending on Android version and the source app, the first selection may be remembered or may need to be repeated.
4. You can also use another app's **Share** action and select ADVERSE.

## Important link-handling limitation

Android's app-link verification is domain-specific. This app can appear as a user-selectable handler for general HTTP/HTTPS links, but making ADVERSE the verified default for `adverse-web.onrender.com` requires hosting `/.well-known/assetlinks.json` with the SHA-256 fingerprint of the final signing certificate. A debug build is signed with a debug certificate and is not suitable for establishing the production Play Store identity. Android and individual apps also control whether a chooser appears.

The app only accepts HTTP/HTTPS URLs from incoming intents. It does not request contacts, location, microphone, or camera access.
