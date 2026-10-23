import { useWorkspaceContext } from '../WorkspaceContext';
import { ChevronDown, ExternalLink, Fingerprint, Settings2, ShieldCheck } from 'lucide-react';

/** Primary workspace navigation and account controls. */
export default function WorkspaceSidebar() {
 const { nav, tab, setTab, setToolPopupSelector, tabLabels, accountRole, userEmail } = useWorkspaceContext();
 return (
<aside className="sidebar"><div className="brand"><div className="brand-mark"><Fingerprint size={22}/></div><div><strong>ADVERSE</strong><span>INTELLIDESK WORKSPACE</span></div></div><button className="workspace-switch"><span className="workspace-dot"/> ADVERSE WORKSPACE <ChevronDown size={14}/></button><div className="nav-groups">{nav.map(g=><div className="nav-group" key={g.label}><span className="nav-label">{g.label}</span>{g.items.map((item,i)=>{const Icon=g.icons[i];return <button key={item} className={'nav-item '+(tab===item?'active':'')} onClick={()=>{setToolPopupSelector('');setTab(item);}}><Icon size={17}/><span>{tabLabels[item]||item}</span></button>})}</div>)}</div>{(accountRole==='owner'||accountRole==='admin')&&<button className="nav-item" onClick={()=>{window.location.href='/?admin=1';}} title="Open the protected ADVERSE administration console"><ShieldCheck size={17}/><span>Admin console</span><ExternalLink size={13}/></button>}<div className="sidebar-bottom"><div className="security-note"><ShieldCheck size={17}/><div><b>Sources matter</b><span>Find useful links and understand them.</span></div></div><button type="button" className="user-row account-shortcut" onClick={()=>{setToolPopupSelector('');setTab('Settings');}} aria-label="Open account and workspace settings"><div className="avatar">{userEmail.slice(0,1).toUpperCase()||'A'}</div><div className="user-copy"><b>{userEmail||'Your account'}</b><span>{accountRole==='owner'||accountRole==='admin'?'Workspace admin':'Account & preferences'}</span></div><Settings2 size={16}/></button></div></aside>
 );
}
