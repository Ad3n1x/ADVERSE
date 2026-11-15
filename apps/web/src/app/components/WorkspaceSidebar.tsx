import { useWorkspaceContext } from '../WorkspaceContext';
import { ChevronDown, ExternalLink, Fingerprint, Settings2, ShieldCheck } from 'lucide-react';

/** Primary navigation for the ADVERSE intelligence workspace. */
export default function WorkspaceSidebar() {
  const {
    nav, tab, setTab, setToolPopupSelector, tabLabels,
    accountRole, userEmail,
  } = useWorkspaceContext();

  const openTab = (nextTab: string) => {
    setToolPopupSelector('');
    setTab(nextTab as typeof tab);
  };

  const isPrivileged = accountRole === 'owner' || accountRole === 'admin';

  return (
    <aside className="sidebar" aria-label="ADVERSE workspace navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><Fingerprint size={23} /></div>
        <div>
          <strong>ADVERSE</strong>
          <span>OPEN SOURCE INTELLIGENCE</span>
        </div>
      </div>

      <div className="workspace-switch" aria-label="Current workspace">
        <span className="workspace-dot" />
        <span>ADVERSE WORKSPACE</span>
        <span className="workspace-mode">PRIVATE</span>
        <ChevronDown size={14} aria-hidden="true" />
      </div>

      <nav className="nav-groups" aria-label="Workspace sections">
        {nav.map(group => (
          <div className="nav-group" key={group.label}>
            <span className="nav-label">{group.label}</span>
            {group.items.map((item, index) => {
              const Icon = group.icons[index];
              const selected = tab === item;
              return (
                <button
                  key={item}
                  type="button"
                  className={'nav-item ' + (selected ? 'active' : '')}
                  onClick={() => openTab(item)}
                  aria-current={selected ? 'page' : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{tabLabels[item] || item}</span>
                  {selected && <span className="nav-active-indicator" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {isPrivileged && (
        <button
          type="button"
          className="nav-item admin-nav-item"
          onClick={() => { window.location.href = '/?admin=1'; }}
          title="Open the protected ADVERSE administration console"
        >
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Admin console</span>
          <ExternalLink size={13} aria-hidden="true" />
        </button>
      )}

      <div className="sidebar-bottom">
        <div className="security-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <div>
            <b>Evidence over assumptions</b>
            <span>Trace claims to public sources. Keep provenance visible.</span>
          </div>
        </div>
        <button
          type="button"
          className="user-row account-shortcut"
          onClick={() => openTab('Settings')}
          aria-label="Open account and workspace settings"
        >
          <div className="avatar">{userEmail.slice(0, 1).toUpperCase() || 'A'}</div>
          <div className="user-copy">
            <b>{userEmail || 'Your account'}</b>
            <span>{isPrivileged ? 'Workspace administrator' : 'Account & preferences'}</span>
          </div>
          <Settings2 size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
