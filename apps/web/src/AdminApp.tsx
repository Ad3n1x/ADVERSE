import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, LogOut, RefreshCw, Search, ShieldCheck, Users, Layers3, CalendarDays, LockKeyhole } from 'lucide-react';

const API=(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/,'');
type AdminUser={id:string;email:string;displayName:string;createdAt?:string;lastUpdatedAt?:string;investigations:number};
type Overview={metrics:{totalUsers:number;totalInvestigations:number;usersCreatedLast7Days:number};recentUsers:AdminUser[];generatedAt:string;limitations:string[]};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(API+path,{...init,credentials:'include',headers:{'Content-Type':'application/json',...(init?.headers||{})}});
 if(!response.ok){let message='Request failed';try{const body=await response.json();message=body.error?.message||message;}catch{}throw new Error(message);}
 if(response.status===204)return undefined as T;
 return response.json();
}
const dateLabel=(value?:string)=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—';
export default function AdminApp(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [signedIn,setSignedIn]=useState(false);
 const [overview,setOverview]=useState<Overview|null>(null);const [users,setUsers]=useState<AdminUser[]>([]);const [search,setSearch]=useState('');const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [page,setPage]=useState(1);const [total,setTotal]=useState(0);const [pages,setPages]=useState(1);
 const load=useCallback(async(q=search,p=page)=>{
  setLoading(true);setError('');
  try{
   const [o,u]=await Promise.all([
    call<{data:Overview}>('/admin/overview'),
    call<{data:AdminUser[];meta:{total:number;pages:number}}>('/admin/users?q='+encodeURIComponent(q)+'&page='+p+'&limit=20')
   ]);
   setOverview(o.data);setUsers(u.data);setTotal(u.meta.total);setPages(Math.max(1,u.meta.pages));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load admin data.');}
  finally{setLoading(false);}
 },[search,page]);
 useEffect(()=>{if(signedIn)void load();},[signedIn,load]);
 const login=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{await call('/admin/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');setSignedIn(true);}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setLoading(false);}};
 const logout=async()=>{await call('/admin/logout',{method:'POST'}).catch(()=>undefined);setSignedIn(false);setOverview(null);setUsers([]);};
 const bg='#080d12',panel='#0f171e',line='#22313b',muted='#91a1ae',text='#edf4f8',accent='#8ee7c4';
 const card:React.CSSProperties={background:panel,border:'1px solid '+line,borderRadius:18,padding:22};
 if(!signedIn)return <main style={{minHeight:'100vh',background:bg,color:text,fontFamily:'Inter,ui-sans-serif,system-ui',display:'grid',placeItems:'center',padding:20}}>
  <section style={{...card,width:'min(440px,100%)',boxSizing:'border-box'}}>
   <div style={{display:'flex',alignItems:'center',gap:10,color:accent,fontWeight:800,letterSpacing:2,fontSize:12}}><ShieldCheck size={20}/> ADVERSE / CONTROL ROOM</div>
   <h1 style={{fontSize:32,letterSpacing:-1,margin:'22px 0 8px'}}>Admin sign in</h1>
   <p style={{color:muted,lineHeight:1.6,marginTop:0}}>Private operational view. Admin credentials are checked on the server and are never embedded in the website.</p>
   <form onSubmit={login} style={{display:'grid',gap:14,marginTop:24}}>
    <label style={{display:'grid',gap:7,fontSize:13,color:'#c7d3db'}}>Administrator email<input autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle}/></label>
    <label style={{display:'grid',gap:7,fontSize:13,color:'#c7d3db'}}>Password<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle}/></label>
    {error&&<p role="alert" style={{color:'#ff9d9d',fontSize:13,margin:0}}>{error}</p>}
    <button disabled={loading} style={buttonStyle}>{loading?'Checking…':'Sign in securely'}</button>
   </form>
   <p style={{fontSize:12,color:muted,marginBottom:0}}>Admin access must be configured through the API service environment.</p>
  </section>
 </main>;
 return <main style={{minHeight:'100vh',background:bg,color:text,fontFamily:'Inter,ui-sans-serif,system-ui',padding:'clamp(16px,3vw,36px)',boxSizing:'border-box'}}>
  <div style={{maxWidth:1240,margin:'0 auto'}}>
   <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:32}}>
    <div><div style={{display:'flex',alignItems:'center',gap:9,color:accent,fontWeight:800,letterSpacing:2,fontSize:12}}><ShieldCheck size={19}/> ADVERSE / ADMIN</div><h1 style={{fontSize:'clamp(28px,4vw,42px)',letterSpacing:-1.5,margin:'10px 0 5px'}}>Control room</h1><p style={{color:muted,margin:0}}>User accounts and product health signals, without exposing passwords or provider keys.</p></div>
    <div style={{display:'flex',gap:9,flexWrap:'wrap'}}><button onClick={()=>void load()} style={secondaryButton}><RefreshCw size={15}/> Refresh</button><button onClick={()=>void logout()} style={secondaryButton}><LogOut size={15}/> Sign out</button><a href="/" style={{...secondaryButton,textDecoration:'none'}}><ArrowLeft size={15}/> Open app</a></div>
   </header>
   {error&&<div role="alert" style={{...card,borderColor:'#8b4444',color:'#ffb6b6',marginBottom:18}}>{error}</div>}
   <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:14,marginBottom:22}}>
    <Metric icon={<Users size={19}/>} label="Registered users" value={overview?.metrics.totalUsers} detail="All persisted accounts"/>
    <Metric icon={<Layers3 size={19}/>} label="Saved investigations" value={overview?.metrics.totalInvestigations} detail="Across all user accounts"/>
    <Metric icon={<CalendarDays size={19}/>} label="New users · 7 days" value={overview?.metrics.usersCreatedLast7Days} detail="Based on account creation date"/>
   </section>
   <section style={{...card,marginBottom:20}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:18}}><div><h2 style={{fontSize:19,margin:'0 0 5px'}}>User directory</h2><p style={{color:muted,fontSize:13,margin:0}}>{total.toLocaleString()} accounts · email, signup date, and saved investigation count</p></div><form onSubmit={e=>{e.preventDefault();setPage(1);void load(search,1);}} style={{display:'flex',gap:8,flexWrap:'wrap'}}><div style={{position:'relative'}}><Search size={15} style={{position:'absolute',left:11,top:13,color:muted}}/><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)} style={{...inputStyle,width:'min(280px,65vw)',paddingLeft:34}}/></div><button style={secondaryButton} type="submit">Search</button></form></div>
    <div style={{overflowX:'auto'}}><table style={{borderCollapse:'collapse',width:'100%',minWidth:620,textAlign:'left'}}><thead><tr>{['User','Email','Joined','Investigations'].map(x=><th key={x} style={thStyle}>{x}</th>)}</tr></thead><tbody>{users.map(user=><tr key={user.id}><td style={tdStyle}><strong>{user.displayName||'Unnamed user'}</strong><div style={{fontSize:11,color:muted,marginTop:4}}>{user.id.slice(-8)}</div></td><td style={tdStyle}>{user.email}</td><td style={tdStyle}>{dateLabel(user.createdAt)}</td><td style={tdStyle}>{user.investigations}</td></tr>)}{!users.length&&<tr><td colSpan={4} style={{...tdStyle,color:muted}}>{loading?'Loading accounts…':'No users match this search.'}</td></tr>}</tbody></table></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:16,color:muted,fontSize:13}}><span>Page {page} of {pages}</span><div style={{display:'flex',gap:8}}><button disabled={page<=1||loading} style={secondaryButton} onClick={()=>{const p=page-1;setPage(p);void load(search,p);}}>Previous</button><button disabled={page>=pages||loading} style={secondaryButton} onClick={()=>{const p=page+1;setPage(p);void load(search,p);}}>Next</button></div></div>
   </section>
   <section style={{...card,marginBottom:20}}><h2 style={{fontSize:17,marginTop:0}}>Transparency & next instrumentation</h2><p style={{color:muted,lineHeight:1.7,fontSize:13}}>This first release shows registered accounts and saved-workspace counts. It deliberately does not expose password hashes, session tokens, API keys, private research notes, or users’ private source records. Search volume, provider failure trends, last-login activity, and retention metrics are not shown until they are collected with clear data minimization.</p>{overview?.limitations.map(item=><p key={item} style={{color:muted,fontSize:12,lineHeight:1.6}}>• {item}</p>)}<p style={{fontSize:11,color:muted}}>Last refreshed: {overview?new Date(overview.generatedAt).toLocaleString():'—'}</p></section>
  </div>
 </main>;
}
function Metric({icon,label,value,detail}:{icon:React.ReactNode;label:string;value?:number;detail:string}){return <section style={{background:'#0f171e',border:'1px solid #22313b',borderRadius:18,padding:22}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'#8ee7c4'}}>{icon}<span style={{fontSize:11,color:'#91a1ae',textTransform:'uppercase',letterSpacing:1}}>{label}</span></div><div style={{fontSize:36,fontWeight:750,letterSpacing:-1.5,margin:'18px 0 4px'}}>{value===undefined?'—':value.toLocaleString()}</div><div style={{fontSize:12,color:'#91a1ae'}}>{detail}</div></section>}
const inputStyle:React.CSSProperties={background:'#080d12',border:'1px solid #2a3b46',borderRadius:10,padding:'12px 13px',color:'#edf4f8',font:'inherit',outline:'none',width:'100%',boxSizing:'border-box'};
const buttonStyle:React.CSSProperties={display:'flex',alignItems:'center',justifyContent:'center',background:'#8ee7c4',border:0,borderRadius:10,padding:'13px 16px',fontWeight:750,color:'#092019',cursor:'pointer',fontSize:14};
const secondaryButton:React.CSSProperties={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,background:'#111b23',border:'1px solid #2a3b46',borderRadius:10,padding:'10px 12px',color:'#dce7ed',cursor:'pointer',fontSize:13};
const thStyle:React.CSSProperties={padding:'12px 10px',fontSize:11,textTransform:'uppercase',letterSpacing:1,color:'#91a1ae',borderBottom:'1px solid #2a3b46',fontWeight:650};
const tdStyle:React.CSSProperties={padding:'14px 10px',fontSize:13,borderBottom:'1px solid #1d2a33',verticalAlign:'top'};
