import { useWorkspaceContext } from '../WorkspaceContext';
import Empty from '../../components/ui/Empty';
import { ArrowDownRight, BookOpen, Plus, Sparkles, Trash2 } from 'lucide-react';

/** Research Collections Panel extracted from the workspace shell. */
export default function ResearchCollectionsPanel() {
 const { setCreateOpen, setToolPopupSelector, question, researching, cases, setCaseId, evidence, deleteCase, deleteAllWorkspaceData, researchAllCases } = useWorkspaceContext();
 return (
<section className="panel page-panel investigations-panel all-collections-panel"><div className="panel-heading"><div><h2>Your research folders</h2><p>Keep your searches and saved links organized.</p></div><div className="panel-tools">{cases.length>0&&<><button className="secondary-button" onClick={()=>void researchAllCases()} disabled={researching}><Sparkles size={14}/>{researching?'Researching cases…':'Refresh all collections'}</button><button className="danger-button" onClick={()=>void deleteAllWorkspaceData()}><Trash2 size={14}/> Delete all</button></>}<button className="primary-button" onClick={()=>setCreateOpen(true)}><Plus size={15}/> New collection</button></div></div>{cases.length?cases.map(c=><div key={c.id} style={{display:'flex',gap:8,alignItems:'stretch',marginBottom:8}}><button className="investigation-item" style={{flex:1,textAlign:'left'}} onClick={()=>{setCaseId(c.id);setToolPopupSelector('.evidence-vault-panel')}}><div className="case-icon"><BookOpen size={17}/></div><div className="case-copy"><b>{c.title}</b><span>{c.question||'No research question'}</span></div><span className="case-status">{c.status}</span><ArrowDownRight size={15}/></button><button className="secondary-button investigation-delete-button" title={'Delete '+c.title} aria-label={'Delete investigation '+c.title} onClick={e=>{e.stopPropagation();void deleteCase(c);}}><Trash2 size={15}/> <span>Delete</span></button></div>):<Empty title="No collections yet" text="Your research folders will appear here." action={()=>setCreateOpen(true)}/>}</section>
 );
}
