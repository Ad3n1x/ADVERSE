import AdminApp from './features/admin/AdminApp';
import WorkspaceApp from './app/WorkspaceApp';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import ConnectionStatus from './components/ConnectionStatus';
import SharedLinkHandler from './components/SharedLinkHandler';
import AndroidDownloadLink from './components/AndroidDownloadLink';
import DownloadPage from './pages/DownloadPage';
import './android-download.css';

export default function App() {
  const isDownloadRoute = window.location.pathname === '/download' || window.location.pathname === '/download/';
  const isAdminRoute =
    window.location.pathname === '/admin' ||
    window.location.pathname === '/admin/' ||
    new URLSearchParams(window.location.search).get('admin') === '1';

  return (
    <>
      {isDownloadRoute ? <DownloadPage /> : isAdminRoute ? <AdminApp /> : <WorkspaceApp />}
      <ConnectionStatus />
      <SharedLinkHandler />
      <PwaInstallPrompt />
      {!isAdminRoute && !isDownloadRoute && <AndroidDownloadLink />}
    </>
  );
}
