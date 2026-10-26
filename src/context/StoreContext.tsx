"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authService, adminService, isSetupMissingError } from '@/services';
import type { Role } from '@/types/database.types';
import type { MyAccess } from '@/lib/activity';
export interface StoreMembership { store_id: string; user_id: string; role: Role; stores: { id: string; name: string; address: string|null; phone: string|null; email: string|null } | null; }
interface Ctx { user: any; profile: any; stores: StoreMembership[]; current: StoreMembership|null; role: Role|null; loading: boolean; isAdmin: boolean; webAccessKnown: boolean; webAccessEnabled: boolean; myAccess: MyAccess|null; refreshAccess: ()=>Promise<MyAccess|null>; setStoreId: (id:string)=>void; refresh: ()=>Promise<void>; signOut: ()=>Promise<void>; }
const C = createContext<Ctx>({ user:null, profile:null, stores:[], current:null, role:null, loading:true, isAdmin:false, webAccessKnown:false, webAccessEnabled:false, myAccess:null, refreshAccess:async()=>null, setStoreId:()=>{}, refresh:async()=>{}, signOut:async()=>{} });
export const useStore = () => useContext(C);
export function StoreProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<any>(null); const [profile,setProfile]=useState<any>(null); const [stores,setStores]=useState<StoreMembership[]>([]); const [storeId,setStoreIdState]=useState<string>(''); const [loading,setLoading]=useState(true);
  const [myAccess,setMyAccess]=useState<MyAccess|null>(null); const [webAccessKnown,setWebAccessKnown]=useState(false);
  const myAccessRef=useRef<MyAccess|null>(null);

  // Fetch (or re-fetch) this user's web-module access via the get_my_access RPC.
  // If the backend setup SQL has not been run yet, the RPC is missing: we then
  // mark web access as "unknown" and do NOT enforce anything (fail open during
  // rollout — see login page). Mobile is never affected by any of this.
  const refreshAccess=useCallback(async(): Promise<MyAccess|null>=>{
    try{
      const access=await adminService.getMyAccess();
      myAccessRef.current=access; setMyAccess(access); setWebAccessKnown(true);
      return access;
    }catch(err){
      if(isSetupMissingError(err)){ myAccessRef.current=null; setMyAccess(null); setWebAccessKnown(false); return null; }
      // Non-setup errors: keep the last known state rather than kicking the user out.
      return myAccessRef.current;
    }
  },[]);

  const refresh=async()=>{
    const {data:{session}}=await supabase.auth.getSession(); const u=session?.user||null; setUser(u);
    if(!u){ setStores([]); setProfile(null); myAccessRef.current=null; setMyAccess(null); setWebAccessKnown(false); setLoading(false); return; }
    try{ const p=await authService.myProfile(u.id); setProfile(p);}catch{}
    await refreshAccess();
    try{ const s=await authService.myStores(); const arr=(s as unknown as StoreMembership[])||[]; setStores(arr); const saved=localStorage.getItem('counterly_store_id'); const pick=arr.find(x=>x.store_id===saved)||arr[0]; if(pick) setStoreIdState(pick.store_id);}catch{}
    setLoading(false);
  };
  useEffect(()=>{ refresh(); const {data:sub}=supabase.auth.onAuthStateChange(()=>{refresh();}); return ()=>sub.subscription.unsubscribe(); },[]);
  const setStoreId=(id:string)=>{ setStoreIdState(id); localStorage.setItem('counterly_store_id', id); };
  const current=stores.find(s=>s.store_id===storeId)||stores[0]||null;
  const signOut=async()=>{ await authService.signOut(); localStorage.removeItem('counterly_store_id'); window.location.href='/login'; };
  const isAdmin=!!myAccess?.is_admin;
  const webAccessEnabled=isAdmin || !!myAccess?.web_access_enabled;
  return <C.Provider value={{user,profile,stores,current,role:current?.role||null,loading,isAdmin,webAccessKnown,webAccessEnabled,myAccess,refreshAccess,setStoreId,refresh,signOut}}>{children}</C.Provider>;
}
