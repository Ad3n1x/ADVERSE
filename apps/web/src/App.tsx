import AdminApp from './features/admin/AdminApp';
import WorkspaceApp from './app/WorkspaceApp';
import ConnectionStatus from './components/ConnectionStatus';
import SharedLinkHandler from './components/SharedLinkHandler';
import DownloadPage from './pages/DownloadPage';

export default function App() {
  const isLegacyRoute = window.location.pathname === '/classic' || window.location.pathname === '/classic/';
  const isDownloadRoute =
    window.location.pathname === '/download' ||
    window.location.pathname === '/download/';
  const isAdminRoute =
    window.location.pathname === '/admin' ||
    window.location.pathname === '/admin/' ||
    new URLSearchParams(window.location.search).get('admin') === '1';

  if (isLegacyRoute) {
    window.location.replace('/experience');
    return null;
  }

  if (isAdminRoute || window.location.pathname === '/experience') {
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
    </>
  );
}
