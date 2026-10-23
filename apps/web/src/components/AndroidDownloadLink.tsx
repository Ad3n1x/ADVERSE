import { Download, Fingerprint } from 'lucide-react';

const ANDROID_APK_URL =
  'https://github.com/Ad3n1x/ADVERSE/releases/download/android-latest/ADVERSE.apk';

export default function AndroidDownloadLink() {
  return (
    <a
      className="adverse-android-download"
      href={ANDROID_APK_URL}
      aria-label="Download ADVERSE for Android"
      title="Download ADVERSE for Android"
    >
      <span className="adverse-android-download__icon" aria-hidden="true">
        <Fingerprint size={19} strokeWidth={2.2} />
      </span>
      <span className="adverse-android-download__label">
        <strong>Get ADVERSE</strong>
        <small>Android app · APK</small>
      </span>
      <Download className="adverse-android-download__arrow" size={18} />
    </a>
  );
}
