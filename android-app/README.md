# ADVERSE for Android

ADVERSE for Android is a **native Kotlin + Jetpack Compose app**. It does not embed the website in a WebView.

## Native feature set

- Public federated web search through the existing ADVERSE API.
- Image, video, and people search using the public media-search endpoint.
- Search suggestions and supported advanced operators: `site:`, `after:`, `before:`, and `type:`.
- Image-based visual matching through the public visual-match endpoint. The selected image is sent to ADVERSE for analysis and related public image/video discovery; matches are candidates, not identity verification.
- Native result cards with source previews, retrieval explanations, caution signals, corroboration context, and clearly labelled link-access status.
- Direct public URL checking with safe server-side URL validation.
- Filter results by link-access status or provider, dismiss irrelevant results, and search for alternatives to unconfirmed links.
- Share a search using Android's native share sheet.
- Save and remove sources, plus recent search history, stored locally.
- Account registration, sign-in, session restore, sign-out, and password-reset email requests.
- Session cookies are persisted using Android Keystore-backed encrypted preferences.
- Original source pages open in the user's preferred browser.

The app is designed to remain lightweight on entry-level Android devices. Search is available without creating an account. Saved items and history remain device-local and are not synced to the website.

## Website and API

The website remains a separate React application. Both clients use the same public-search API and dark teal / mint visual system, shared with the website. The Android app calls `https://adverse-api-7yim.onrender.com/api/v1`.

Search coverage is limited to the configured public providers and is not a complete index of the web. Reachability, ranking signals, and similar results are not proof that a page or its claims are trustworthy.

## Build an APK

The GitHub Actions workflow **Build ADVERSE Android APK** builds the debug APK. Download the `ADVERSE-android-debug` artifact from the workflow run, or use the public `android-latest` release asset when the workflow has completed.

The APK is a debug-signed testing build, not a Play Store release. Updating an existing installation may require uninstalling the older differently signed build; uninstalling clears that app's local saved items and search history.

## Privacy and permissions

The app requests internet access only. Saved sources, history, and the authenticated session cookie are stored in app-private encrypted preferences. When visual matching is used, the selected image is uploaded to the ADVERSE API for processing. The app does not request contacts, location, microphone, or direct camera access; image selection uses Android's system photo picker.
