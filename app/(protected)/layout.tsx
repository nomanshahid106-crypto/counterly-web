"use client";
import Link from 'next/link'; import { useCallback, useEffect, useRef } from 'react'; import { useRouter, usePathname } from 'next/navigation'; import { useStore } from '@/context/StoreContext'; import { authService } from '@/services';
export default function Layout({children}:{children:React.ReactNode}){ const {user,loading,stores,current,setStoreId,profile,role,signOut,isAdmin,webAccessKnown,webAccessEnabled,refreshAccess}=useStore(); const r=useRouter(); const path=usePathname();
 const enforcingRef=useRef(false);

 const enforce=useCallback(async()=>{
   // Re-check web access against the backend. If an admin has revoked this
   // user's web access, the existing session must stop working here too —
   // the check is against get_my_access (SECURITY DEFINER RPC), not just UI.
   const access=await refreshAccess();
   if(!access) return; // setup not installed yet -> no enforcement (fail open in rollout)
   if(!access.is_admin && !access.web_access_enabled){
     if(enforcingRef.current) return; enforcingRef.current=true;
     try{ await authService.signOut(); }catch{}
     r.replace('/access-denied');
   }
 },[refreshAccess,r]);

 useEffect(()=>{ if(loading) return; if(!user) r.replace('/login'); else if(!stores.length) r.replace('/create-store'); },[loading,user,stores,r]);

 // Initial enforcement when access state is known.
 useEffect(()=>{ if(loading||!user) return; if(webAccessKnown && !webAccessEnabled && !isAdmin){ enforce(); } },[loading,user,webAccessKnown,webAccessEnabled,isAdmin,enforce]);

 // Periodic + on-focus re-check, so a revoked user cannot keep using an
 // existing session indefinitely (at most ~60 seconds).
 useEffect(()=>{ if(!user) return; const t=setInterval(()=>{ enforce(); },60000); const onFocus=()=>{ enforce(); }; window.addEventListener('focus',onFocus); return ()=>{ clearInterval(t); window.removeEventListener('focus',onFocus); }; },[user,enforce]);

 if(loading||!user||!current) return <div className="authWrap card center">Loading…</div>;
 const links=[['/dashboard','Dashboard'],['/pos','POS'],['/products','Products'],['/categories','Categories'],['/inventory','Inventory'],['/sales','Sales'],['/settings','Settings']];
 return <div className="shell"><aside className="sidebar"><div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16}}><img src="/counterly-icon.png" width={36} height={36} style={{borderRadius:8}} alt=""/><strong style={{fontSize:18}}>Counterly</strong></div>
 {stores.length>1 && <select className="input" value={current.store_id} onChange={e=>setStoreId(e.target.value)}>{stores.map(s=><option key={s.store_id} value={s.store_id}>{s.stores?.name||s.store_id}</option>)}</select>}
 {links.map(([href,label])=><Link key={href} href={href} style={path.startsWith(href)?{background:'rgba(255,255,255,.15)',color:'#fff'}:undefined}>{label}</Link>)}
 {isAdmin && <Link href="/admin" style={{border:'1px solid rgba(255,255,255,.35)'}}>Admin</Link>}
 <div style={{marginTop:'auto'}}><div style={{fontSize:13,color:'#CBD5E1'}}>{profile?.full_name||user.email}<br/><span className="badge">{role}</span>{isAdmin && <> <span className="badge">Admin</span></>}</div><button className="btn secondary small" style={{marginTop:10}} onClick={signOut}>Sign out</button></div></aside>
 <main className="main"><div className="topbar"><div><strong>{current.stores?.name}</strong> <span className="badge">Live POS</span></div><span className="muted">{user.email} · {role}</span></div>{children}</main></div>; }
