import AdminApp from './features/admin/AdminApp';
import WorkspaceApp from './app/WorkspaceApp';
import PwaInstallPrompt from './components/PwaInstallPrompt';

export default function App() {
  const isAdminRoute =
    window.location.pathname === '/admin' ||
    window.location.pathname === '/admin/' ||
    new URLSearchParams(window.location.search).get('admin') === '1';

  return (
    <>
      {isAdminRoute ? <AdminApp /> : <WorkspaceApp />}
      <PwaInstallPrompt />
    </>
  );
}
