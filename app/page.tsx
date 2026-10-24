"use client";
import { useEffect } from 'react'; import { useStore } from '@/context/StoreContext'; import { useRouter } from 'next/navigation';
export default function Home(){ const {user,loading,stores}=useStore(); const r=useRouter();
 useEffect(()=>{ if(loading) return; if(!user) r.replace('/login'); else if(!stores.length) r.replace('/create-store'); else r.replace('/dashboard'); },[loading,user,stores,r]);
 return <div className="authWrap card center">Loading Counterly…</div>; }
