import {useEffect,useState,type FormEvent,type CSSProperties} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase,type Role} from './lib/supabase';
import {dictionaries,rememberLocale,storedLocale,type Locale,type Key} from './i18n';
import Editor from './Editor';

type Mode='login'|'register'|'recover'|'change';
type Page='dashboard'|'editor'|'admin';
type Profile={id:string;display_name:string;preferred_locale:Locale};
type RoleRow={user_id:string;role:Role};
const assetOrigin=(import.meta.env.VITE_ASSET_BASE_URL||'https://assets.voidnoir.net').replace(/\/$/,'');

function App(){
 const [locale,setLocale]=useState<Locale>(storedLocale);
 const t=(key:Key)=>dictionaries[locale][key];
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [role,setRole]=useState<Role>('user');
 const [loading,setLoading]=useState(true);
 const [profileError,setProfileError]=useState(false);
 const [mode,setMode]=useState<Mode>('login');
 const [page,setPage]=useState<Page>('dashboard');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 const [name,setName]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [rows,setRows]=useState<RoleRow[]>([]);
 const [rosterError,setRosterError]=useState('');

 const chooseLocale=(next:Locale)=>{
  setLocale(next);rememberLocale(next);
  if(user){void supabase.from('profiles').update({preferred_locale:next}).eq('id',user.id).then(({error})=>{
   if(!error)setProfile(p=>p?{...p,preferred_locale:next}:p);
  });}
 };
 useEffect(()=>{
  let mounted=true;
  const handle=async(next:User|null)=>{
   if(!mounted)return;
   setUser(next);setProfile(null);setRole('user');setProfileError(false);
   if(!next){setLoading(false);return;}
   setLoading(true);
   const [p,r]=await Promise.all([
    supabase.from('profiles').select('id,display_name,preferred_locale').eq('id',next.id).single(),
    supabase.from('user_roles').select('role').eq('user_id',next.id).single()
   ]);
   if(!mounted)return;
   if(p.error||r.error){setProfileError(true);setLoading(false);return;}
   setProfile(p.data as Profile);setRole((r.data?.role||'user') as Role);
   if(r.data?.role==='editor'||r.data?.role==='admin')setPage('editor');
   if(p.data?.preferred_locale==='hu'||p.data?.preferred_locale==='en'){
    setLocale(p.data.preferred_locale);rememberLocale(p.data.preferred_locale);
   }
   setLoading(false);
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(_event==='PASSWORD_RECOVERY')setMode('change');
   // Delay DB access outside the auth state-change callback to avoid auth-client deadlocks.
   queueMicrotask(()=>{if(mounted)void handle(session?.user??null);});
  });
  void supabase.auth.getUser().then(({data,error})=>{
   if(mounted && (error||!data.user))void handle(null);
  });
  return ()=>{mounted=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(page!=='admin'||role!=='admin'||!user)return;
  let mounted=true;setRosterError('');
  void supabase.from('user_roles').select('user_id,role').order('created_at').then(({data,error})=>{
   if(!mounted)return;
   if(error)setRosterError(dictionaries[storedLocale()].error);else setRows((data||[]) as RoleRow[]);
  });
  return ()=>{mounted=false;};
 },[page,role,user]);

 const resetMode=(next:Mode)=>{setMode(next);setError('');setMessage('');setPassword('');setConfirm('');};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;
  setError('');setMessage('');
  if((mode==='register'||mode==='change')&&password.length<8){setError(t('passwordShort'));return;}
  if((mode==='register'||mode==='change')&&password!==confirm){setError(t('passwordMismatch'));return;}
  setBusy(true);
  try {
   if(mode==='login'){
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }else if(mode==='register'){
    const {data,error}=await supabase.auth.signUp({
     email:email.trim(),password,options:{data:{display_name:name.trim(),preferred_locale:locale},emailRedirectTo:window.location.origin}
    });
    if(error)throw error;
    if(!data.session)setMessage(t('verify'));
   }else if(mode==='change'){
    const {error}=await supabase.auth.updateUser({password});
    if(error)throw error;
    await supabase.auth.signOut();
    setMode('login');setMessage(t('changed'));
   }else{
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});
    if(error)throw error;
    setMessage(t('sent'));
   }
  }catch(e){
   const msg=e instanceof Error?e.message:'';
   setError(/invalid login credentials/i.test(msg)?t('invalid'):t('error'));
  }finally{setBusy(false);}
 };
 const selector=<div className="language"><span>{t('language')}</span>{(['hu','en'] as Locale[]).map(l=>
  <button key={l} className={locale===l?'current':''} aria-pressed={locale===l} onClick={()=>chooseLocale(l)}>{l.toUpperCase()}</button>
 )}</div>;
 const sceneStyle:CSSProperties=assetOrigin?{'--space-image':'url('+assetOrigin+'/hatarvilag/backgrounds/login-scene.webp)'} as CSSProperties:{};
 return <div className="shell" style={sceneStyle}>
  <header className="topbar">
   <img className="sigil" alt="" src={assetOrigin+'/hatarvilag/branding/crest.svg'}/>
   <strong className="brand">{t('brand')}</strong>
   <span className="head-sub">{t('explore')} <em>//</em> {t('command')} <em>//</em> {t('survive')}</span>
   <div className="spacer"/>{selector}
  </header>
  <div className="scene">
   {page!=='editor'&&<aside className="sidebar">
    <section><h2>{t('status')}</h2><p><span className="dot"/> {t('ready')}</p></section>
    <section><h2>{t('notice')}</h2><p>{t('noticeBody')}</p><span className="signal">⌁　◈　⌁</span></section>
   </aside>}
   {loading?<div className="terminal"><p className="dim">{t('loading')}</p></div>
    :profileError?<div className="terminal"><p role="alert">{t('profileError')}</p><button className="action" onClick={()=>window.location.reload()}>{t('retry')}</button><button className="alternate" onClick={()=>void supabase.auth.signOut()}>{t('signout')}</button></div>
    :(!user||mode==='change')?<main className="terminal auth">
     <img className="large-sigil" alt="" src={assetOrigin+'/hatarvilag/branding/crest.svg'}/>
     <h1 className="auth-heading">{mode==='login'?t('subtitle'):mode==='register'?t('register'):mode==='recover'?t('recover'):t('change')}</h1>
     <p className="center-sub">{t('brand')} // {t('explore')} · {t('command')} · {t('survive')}</p>
     <form onSubmit={submit}>
      {mode==='register'&&<label>{t('name')}<input maxLength={60} required autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/></label>}
      {mode!=='change'&&<label>{t('email')}<input required type="email" autoComplete="email" placeholder="nev@pelda.hu" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      {mode!=='recover'&&<label>{t('password')}<span className="password-field"><input required minLength={mode==='register'?8:undefined} type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={t('password')}>◉</button></span></label>}
      {(mode==='register'||mode==='change')&&<label>{t('repeat')}<input required autoComplete="new-password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
      {error&&<div className="notice error" role="alert">{error}</div>}
      {message&&<div className="notice success" role="status">{message}</div>}
      <button className="action" type="submit" disabled={busy}>{busy?t('working'):mode==='login'?t('login'):mode==='register'?t('create'):mode==='change'?t('change'):t('send')}</button>
      {mode==='login'?<><button className="link" type="button" onClick={()=>resetMode('recover')}>{t('forgot')}</button><button type="button" className="alternate" onClick={()=>resetMode('register')}>{t('register')}　›</button></>
       :<button type="button" className="alternate" onClick={()=>resetMode('login')}>{t('back')}</button>}
     </form>
    </main>
    :page==='editor'&&(role==='editor'||role==='admin')?<Editor locale={locale} onBack={()=>setPage('dashboard')}/>
    :<main className="terminal in-game">
      <nav className="tabs">
       <button className={page==='dashboard'?'active':''} onClick={()=>setPage('dashboard')}>{t('dashboard')}</button>
       {(role==='editor'||role==='admin')&&<button className={page==='editor'?'active':''} onClick={()=>setPage('editor')}>{t('editor')}</button>}
       {role==='admin'&&<button className={page==='admin'?'active':''} onClick={()=>setPage('admin')}>{t('admin')}</button>}
       <button className="logout" onClick={()=>void supabase.auth.signOut()}>{t('signout')}</button>
      </nav>
      {page==='dashboard'&&<section className="content"><small>COMMAND / 01</small><h2>{t('welcome')}, {profile?.display_name||user.email?.split('@')[0]}.</h2><div className="stats"><div><span>{t('role')}</span><strong>{t(role)}</strong></div><div><span>{t('email')}</span><strong>{user.email}</strong></div></div><p className="dim">{t('description')}</p><div className="settings"><strong>{t('settings')}</strong>{selector}</div></section>}

      {page==='admin'&&role==='admin'&&<section className="content"><small>ACCESS / 03</small><h2>{t('users')}</h2><p className="dim">{t('adminText')}</p>{rosterError&&<p role="alert">{rosterError}</p>}{rows.length===0?<p>{t('noUsers')}</p>:rows.map(r=><div className="role-row" key={r.user_id}><code>{r.user_id.slice(0,12)}…</code><strong>{t(r.role)}</strong></div>)}</section>}
      {(page==='admin'&&role!=='admin'||page==='editor'&&role==='user')&&<p>{t('noAccess')}</p>}
     </main>}
  </div>
  <footer className="status"><span>▮▮▮▮▯</span>{t('footer')}</footer>
 </div>;
}
export default App;
