import AdminApp from './features/admin/AdminApp';
import WorkspaceApp from './app/WorkspaceApp';
import ConnectionStatus from './components/ConnectionStatus';
import SharedLinkHandler from './components/SharedLinkHandler';
import AndroidDownloadLink from './components/AndroidDownloadLink';
import DownloadPage from './pages/DownloadPage';
import './android-download.css';

export default function App() {
  const isDownloadRoute =
    window.location.pathname === '/download' ||
    window.location.pathname === '/download/';
  const isAdminRoute =
    window.location.pathname === '/admin' ||
    window.location.pathname === '/admin/' ||
    new URLSearchParams(window.location.search).get('admin') === '1';

  if (isAdminRoute) {
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex, nofollow, noarchive');
  }

  if (isDownloadRoute) return <DownloadPage />;

  return (
    <>
      {isAdminRoute ? <AdminApp /> : <WorkspaceApp />}
      <ConnectionStatus />
      <SharedLinkHandler />
      {!isAdminRoute && <AndroidDownloadLink />}
    </>
  );
}
