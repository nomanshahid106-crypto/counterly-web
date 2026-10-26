"use client";
import Link from 'next/link';
export default function Page(){
 return <div className="authWrap"><div className="card center" style={{padding:32}}>
  <div aria-hidden="true" style={{display:'flex',justifyContent:'center',marginBottom:16}}>
   <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#0A9BD8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.6" fill="#0A9BD8" stroke="none"/></svg>
  </div>
  <h1 style={{marginTop:0}}>You need to get access from admin.</h1>
  <p className="muted">Web access for the Counterly web portal must be granted by an administrator before you can sign in here. Please contact your administrator and ask them to enable web module access for your registered email address.</p>
  <p className="muted"><strong>Your mobile app access is not affected.</strong> You can keep using Counterly on mobile normally — web access and mobile access are managed separately.</p>
  <Link href="/login" className="btn" style={{display:'inline-block',marginTop:10}}>Back to sign in</Link>
 </div></div>;
}
