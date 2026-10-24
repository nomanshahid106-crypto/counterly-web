"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services';
import type { Role } from '@/types/database.types';
export interface StoreMembership { store_id: string; user_id: string; role: Role; stores: { id: string; name: string; address: string|null; phone: string|null; email: string|null } | null; }
interface Ctx { user: any; profile: any; stores: StoreMembership[]; current: StoreMembership|null; role: Role|null; loading: boolean; setStoreId: (id:string)=>void; refresh: ()=>Promise<void>; signOut: ()=>Promise<void>; }
const C = createContext<Ctx>({ user:null, profile:null, stores:[], current:null, role:null, loading:true, setStoreId:()=>{}, refresh:async()=>{}, signOut:async()=>{} });
export const useStore = () => useContext(C);
export function StoreProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<any>(null); const [profile,setProfile]=useState<any>(null); const [stores,setStores]=useState<StoreMembership[]>([]); const [storeId,setStoreIdState]=useState<string>(''); const [loading,setLoading]=useState(true);
  const refresh=async()=>{
    const {data:{session}}=await supabase.auth.getSession(); const u=session?.user||null; setUser(u);
    if(!u){ setStores([]); setProfile(null); setLoading(false); return; }
    try{ const p=await authService.myProfile(u.id); setProfile(p);}catch{}
    try{ const s=await authService.myStores(); const arr=(s as unknown as StoreMembership[])||[]; setStores(arr); const saved=localStorage.getItem('counterly_store_id'); const pick=arr.find(x=>x.store_id===saved)||arr[0]; if(pick) setStoreIdState(pick.store_id);}catch{}
    setLoading(false);
  };
  useEffect(()=>{ refresh(); const {data:sub}=supabase.auth.onAuthStateChange(()=>{refresh();}); return ()=>sub.subscription.unsubscribe(); },[]);
  const setStoreId=(id:string)=>{ setStoreIdState(id); localStorage.setItem('counterly_store_id', id); };
  const current=stores.find(s=>s.store_id===storeId)||stores[0]||null;
  const signOut=async()=>{ await authService.signOut(); localStorage.removeItem('counterly_store_id'); window.location.href='/login'; };
  return <C.Provider value={{user,profile,stores,current,role:current?.role||null,loading,setStoreId,refresh,signOut}}>{children}</C.Provider>;
}
