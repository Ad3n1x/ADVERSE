import { FileSearch, Plus } from 'lucide-react';
function Empty({title,text,action}:{title:string;text:string;action?:()=>void}){return <div className="empty-state"><div className="empty-icon"><FileSearch size={22}/></div><b>{title}</b><p>{text}</p>{action&&<button className="secondary-button" onClick={action}><Plus size={15}/> Get started</button>}</div>}
export default Empty;