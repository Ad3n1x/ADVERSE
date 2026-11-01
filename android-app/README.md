# ADVERSE for Android

ADVERSE for Android is a **native Kotlin + Jetpack Compose app**. It does not embed the website in a WebView.

## Native experience

- Public federated search powered by the existing ADVERSE API.
- Native result cards with source previews and clearly labelled link-access status.
- Save and remove sources in a local reading list.
- Recent search history stored locally on the device.
- Open original source pages in the user's preferred browser.
- Lightweight UI designed to remain responsive on entry-level Android devices.

The website remains a separate React application. Both clients use the same public-search API and the shared midnight / cobalt / cyan visual system. Search is available without creating an account. Saved items and history are currently device-local and are not synced to the website.

## Build an APK

The GitHub Actions workflow **Build ADVERSE Android APK** builds the debug APK. Download the `ADVERSE-android-debug` artifact from the workflow run, or use the public `android-latest` release asset when the workflow has completed.

The APK is a debug-signed testing build, not a Play Store release. Updating an existing installation may require uninstalling the older differently signed build; uninstalling clears that app's local saved items and search history.

## API

The Android client calls the public API at `https://adverse-api-7yim.onrender.com/api/v1`. Public search does not require sign-in. Search coverage is limited to the configured public providers and is not a complete index of the web.

## Privacy and permissions

The app requests internet access only. Search history and saved sources are stored locally with Android app preferences. The app does not request contacts, location, microphone, or camera access.
