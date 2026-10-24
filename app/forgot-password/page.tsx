"use client";
import { useState } from 'react'; import { authService } from '@/services'; import Link from 'next/link';
export default function Page(){ const [email,setEmail]=useState(''); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
 const submit=async(e:React.FormEvent)=>{ e.preventDefault(); try{ await authService.resetPassword(email); setMsg('Password reset email sent. Check your inbox.'); }catch(x:any){setErr(x.message);} };
 return <div className="authWrap"><h1 className="center">Forgot password</h1><div className="card"><form onSubmit={submit}>{err&&<div className="error">{err}</div>}{msg&&<div className="success">{msg}</div>}<label>Email<input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="btn" style={{width:'100%'}}>Send reset link</button></form><p className="muted"><Link href="/login">Back to sign in</Link></p></div></div>; }
