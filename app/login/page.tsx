"use client";
import { useState } from 'react'; import { authService, adminService, isSetupMissingError } from '@/services'; import Link from 'next/link';
export default function Page(){ const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{ e.preventDefault(); setBusy(true); setErr('');
  try{
   await authService.signIn(email,password);
   // Web Module Access check (web portal ONLY — the mobile app never does
   // this and is completely unaffected by web access status).
   try{
    const access=await adminService.getMyAccess();
    if(access && !access.is_admin && !access.web_access_enabled){
     // Credentials are valid, but the admin has not granted web access.
     await authService.signOut();
     window.location.href='/access-denied';
     return;
    }
    // Access granted (or platform admin): record activity, then continue.
    adminService.touchActivity().catch(()=>{});
   }catch(accessErr:any){
    // Fail open during rollout: if the access backend is not installed yet
    // (ADMIN_SETUP.sql not run), allow login so existing users are not
    // locked out before the admin has had a chance to set access up.
    // Once the SQL is installed, the check above is fully enforced.
    if(!isSetupMissingError(accessErr)) throw accessErr;
   }
   window.location.href='/';
  }catch(x:any){ setErr(x.message); }
  setBusy(false); };
 return <div className="authWrap"><div className="center"><img src="/counterly-icon.png" alt="Counterly" width={64} height={64} style={{borderRadius:14}}/><h1>Counterly</h1><p className="muted">Sign in to your store</p></div><div className="card"><form onSubmit={submit}>{err&&<div className="error">{err}</div>}<label>Email<input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input className="input" type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn" style={{width:'100%'}} disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><p className="muted">No account? <Link href="/register">Register</Link> · <Link href="/forgot-password">Forgot password?</Link></p></div></div>; }
