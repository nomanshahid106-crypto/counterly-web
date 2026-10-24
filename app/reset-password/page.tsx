"use client";
import { useState } from 'react'; import { authService } from '@/services';
export default function Page(){ const [password,setPassword]=useState(''); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
 const submit=async(e:React.FormEvent)=>{ e.preventDefault(); try{ await authService.updatePassword(password); setMsg('Password updated. Redirecting to login…'); setTimeout(()=>window.location.href='/login',1000);}catch(x:any){setErr(x.message);} };
 return <div className="authWrap"><h1 className="center">Set new password</h1><div className="card"><form onSubmit={submit}>{err&&<div className="error">{err}</div>}{msg&&<div className="success">{msg}</div>}<label>New password<input className="input" type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn" style={{width:'100%'}}>Update password</button></form></div></div>; }
