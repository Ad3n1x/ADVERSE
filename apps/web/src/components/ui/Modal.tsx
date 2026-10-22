import { X } from 'lucide-react';

function Modal({title,kicker,onClose,children}:{title:string;kicker:string;onClose:()=>void;children:any}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal"><div className="modal-heading"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>{children}</section></div>}
export default Modal;
