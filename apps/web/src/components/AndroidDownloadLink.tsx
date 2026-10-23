import { ArrowUpRight, Fingerprint } from 'lucide-react';

const DOWNLOAD_PAGE_URL = 'https://adverse-web.onrender.com/download';

export default function AndroidDownloadLink() {
  return (
    <a
      className="adverse-android-download"
      href={DOWNLOAD_PAGE_URL}
      aria-label="Get ADVERSE for Android, iPhone, or web"
      title="Get ADVERSE for your device"
    >
      <span className="adverse-android-download__icon" aria-hidden="true">
        <Fingerprint size={19} strokeWidth={2.2} />
      </span>
      <span className="adverse-android-download__label">
        <strong>Get ADVERSE</strong>
        <small>Android · iPhone · Web</small>
      </span>
      <ArrowUpRight className="adverse-android-download__arrow" size={18} />
    </a>
  );
}
