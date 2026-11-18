'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api, Feedback } from './auth-ui';
type Choice = {id:string;name:string};
type Account = {id:string;name:string;email:string;permission_version:number;memberships:Choice[];roles:{clientId:string;role:string}[];defaultClientId:string};
type Directory = {accounts:Account[];clients:Choice[];total:number;page:number;allowJoin:boolean};
export function PlatformAccounts({csrf,onChanged}:{csrf:string;onChanged:()=>void}) {
 const [data,setData]=useState<Directory|null>(null),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');
  api<Directory>('/platform/client-accounts?'+new URLSearchParams({search:query,page:String(page)}))
   .then(result=>{if(!cancelled)setData(result);}).catch(e=>{if(!cancelled)setError(e.message);})
   .finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};
 },[query,page,revision]);
 const reload=()=>setRevision(n=>n+1);
 return <section id="client-account-access" className="panel directory-panel" aria-label="Client account access" aria-busy={loading}>
  <h2>Client account access</h2><p>Choose an account and client before changing access. Client Admin access does not grant training review permissions.</p>
  <form role="search" aria-label="Find client accounts" onSubmit={e=>{e.preventDefault();setQuery(String(new FormData(e.currentTarget).get('search')));setPage(1);reload();}}>
   <label>Search accounts<input type="search" name="search" maxLength={120}/></label>
   <button className="secondary" disabled={loading}>Search accounts</button>
  </form>
  <Feedback error={error} success={success}/>
  {error && <button className="secondary" onClick={reload}>Reload accounts</button>}
  {loading && <p role="status">Loading accounts...</p>}
  {data && !loading && <>
   <p>{data.total} matching accounts</p>
   {!data.accounts.length && <p>No accounts match this search. Change the search to try again.</p>}
   {data.accounts.map(account=><AccountAccess key={account.id+':'+account.permission_version+':'+revision} account={account} clients={data.clients} allowJoin={data.allowJoin} csrf={csrf}
    reload={reload} onSaved={()=>{setSuccess(`Access updated for ${account.name}. Affected sessions have ended.`);reload();onChanged();}}/>)}
   <div className="form-actions"><button className="secondary" disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous accounts</button>
    <span>Page {page}</span><button className="secondary" disabled={page*20>=data.total} onClick={()=>setPage(n=>n+1)}>Next accounts</button></div>
  </>}
 </section>;
}
function AccountAccess({account,clients,allowJoin,csrf,reload,onSaved}:{account:Account;clients:Choice[];allowJoin:boolean;csrf:string;reload:()=>void;onSaved:()=>void}) {
 const [client,setClient]=useState(account.defaultClientId),[action,setAction]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy||stale||!confirmed)return;
  const reason=String(new FormData(e.currentTarget).get('reason'));setBusy(true);setError('');
  try{await api('/platform/client-accounts',{csrf,clientId:client,userId:account.id,action,expectedVersion:account.permission_version,reason});onSaved();}
  catch(failure){const e=failure as Error & {code?:string};setError(e.message);setStale(e.code==='account_version_conflict');}
  finally{setBusy(false);}
 }
 return <details className="review-section"><summary>{account.name} - {account.email}</summary>
  <p>Current clients: {account.memberships.map(m=>m.name).join(', ')||'No active client membership'}</p>
  <p>Client roles: {account.roles.map(r=>`${clients.find(c=>c.id===r.clientId)?.name??'Unavailable client'}: ${r.role}`).join('; ')||'None'}</p>
  <form aria-label={'Manage client access for '+account.email} onSubmit={save} aria-busy={busy}>
   <fieldset disabled={busy||stale}>
    <label>Client<select required value={client} onChange={e=>{setClient(e.target.value);setConfirmed(false);}}><option value="">Choose a client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Action<select required value={action} onChange={e=>{setAction(e.target.value);setConfirmed(false);}}>
     <option value="">Choose an action</option>{allowJoin&&<option value="join">Join client</option>}<option value="grant">Grant Client Admin</option><option value="revoke">Revoke Client Admin</option>
    </select></label>
    {!allowJoin&&<p>Joining another client requires an invitation accepted by the account owner.</p>}
    <label>Reason<input name="reason" required minLength={8} maxLength={2000}/></label>
    <label className="choices"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this access change for {account.name} in {clients.find(c=>c.id===client)?.name??'the selected client'}.</label>
    <p>Affected sessions will end. Review the account, client and action before applying.</p>
    <button className="secondary" disabled={busy||stale}>{busy?'Updating access...':'Apply access change'}</button>
   </fieldset>
   <Feedback error={error}/>{stale&&<button type="button" className="secondary" onClick={reload}>Reload accounts</button>}
  </form>
 </details>;
}
