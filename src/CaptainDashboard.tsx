import {useCallback,useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {SkillArt,AttributeArt,ShipArt} from './components/GameArt';
import {LucidePlus} from './components/LucideSigns';
import {attributes,toDice} from './lib/d6';
import SectorMap,{type SectorLocation,type SectorRoute,type SectorDiscovery} from './SectorMap';
import './captain-dashboard.css';

type I18n={locale:string;name:string;description?:string;success_message?:string;failure_message?:string};
type Portrait={id:string;slug:string;image_path:string|null;game_species_i18n?:I18n[];game_classes_i18n?:I18n[]};
type Ship={id:string;slug:string;hull:number;cargo:number;speed:number;game_starter_ships_i18n:I18n[]};
type Skill={id:string;slug:string;attribute:string;icon_path:string|null;game_skills_i18n:I18n[]};
type Action={id:string;slug:string;energy_cost:number;target_number:number;skill_id:string;game_actions_i18n:I18n[]};
type Progress={level:number;xp_total:number;energy:number;energy_at:string;upgrade_points:number};
type Rules={energy_max:number;energy_regen_seconds:number;xp_level_base:number;skill_points_per_level:number};
type Log={id:number;action_id:string;performed_at:string;roll_total:number;target_number:number;succeeded:boolean;xp_awarded:number};
type TravelLog={id:number;origin_id:string;destination_id:string;energy_spent:number;traveled_at:string};
type Result={action_id:string;dice:number[];roll_total:number;target_number:number;succeeded:boolean;xp_awarded:number;level_up:boolean;pip_bonus:number};
export type GameCaptain={id:string;captain_name:string;species_id:string;class_id:string;starter_ship_id:string;attribute_pips:Record<string,number>;skill_bonus_pips:Record<string,number>};
const attributeNames={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
export default function CaptainDashboard({captain,species,classes,ships,skills,crew,locale,isEditor,onReset}:{
 captain:GameCaptain;species:Portrait[];classes:Portrait[];ships:Ship[];skills:Skill[];crew:{position:string;name:string}[];locale:string;isEditor:boolean;onReset:()=>void
}){
 const en=locale==='en',lang=en?'en':'hu',tr=(hu:string,eng:string)=>en?eng:hu;
 const local=(x:I18n[]|undefined)=>x?.find(y=>y.locale===lang)||x?.find(y=>y.locale==='hu');
 const [progress,setProgress]=useState<Progress|null>(null),[rules,setRules]=useState<Rules|null>(null);
 const [actions,setActions]=useState<Action[]>([]),[logs,setLogs]=useState<Log[]>([]),[travelLogs,setTravelLogs]=useState<TravelLog[]>([]);
 const [locations,setLocations]=useState<SectorLocation[]>([]),[routes,setRoutes]=useState<SectorRoute[]>([]);
 const [position,setPosition]=useState(''),[discoveries,setDiscoveries]=useState<SectorDiscovery[]>([]);
 const [placements,setPlacements]=useState<{location_id:string;action_id:string}[]>([]);
 const [travelNotice,setTravelNotice]=useState('');
 const [upgrades,setUpgrades]=useState<{skill_id:string;bonus_pips:number}[]>([]);
 const [tab,setTab]=useState<'bridge'|'map'|'character'|'ship'|'log'>('bridge'),[group,setGroup]=useState('body');
 const [error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false);
 const [time,setTime]=useState(Date.now()),[confirmReset,setConfirmReset]=useState(false),[resetWord,setResetWord]=useState('');
 const refresh=useCallback(async()=>{
  const [p,r,a,l,u,pos,dis,loc,rou,placement,travelHistory]=await Promise.all([
    supabase.from('character_progress').select('level,xp_total,energy,energy_at,upgrade_points').eq('character_id',captain.id).single(),
    supabase.from('gameplay_rules').select('energy_max,energy_regen_seconds,xp_level_base,skill_points_per_level').eq('id',1).single(),
    supabase.from('game_actions').select('id,slug,energy_cost,target_number,skill_id,game_actions_i18n(locale,name,description,success_message,failure_message)').eq('is_published',true).order('sort_order'),
    supabase.from('character_action_log').select('id,action_id,performed_at,roll_total,target_number,succeeded,xp_awarded').eq('character_id',captain.id).order('id',{ascending:false}).limit(10),
    supabase.from('character_skill_upgrades').select('skill_id,bonus_pips').eq('character_id',captain.id),
    supabase.from('character_positions').select('location_id').eq('character_id',captain.id).single(),
    supabase.from('character_location_discoveries').select('location_id,discovered_at').eq('character_id',captain.id),
    supabase.from('game_locations').select('id,slug,kind,x,y,is_published,game_locations_i18n(locale,name,description)').eq('is_published',true),
    supabase.from('game_routes').select('id,origin_id,destination_id,energy_cost,is_published').eq('is_published',true),
    supabase.from('game_location_actions').select('location_id,action_id'),
    supabase.from('character_travel_log').select('id,origin_id,destination_id,energy_spent,traveled_at').eq('character_id',captain.id).order('id',{ascending:false}).limit(8)
  ]);
  const problem=p.error||r.error||a.error||l.error||u.error||pos.error||dis.error||loc.error||rou.error||placement.error||travelHistory.error;
  if(problem){setError(problem.message);return;}
  setProgress(p.data as Progress);setRules(r.data as Rules);setActions(a.data as Action[]);setLogs(l.data as Log[]);setUpgrades(u.data||[]);
  setPosition(pos.data?.location_id||'');setDiscoveries((dis.data||[]) as SectorDiscovery[]);
  setLocations((loc.data||[]) as unknown as SectorLocation[]);setRoutes((rou.data||[]) as SectorRoute[]);
  setPlacements(placement.data||[]);setTravelLogs((travelHistory.data||[]) as TravelLog[]);
 },[captain.id]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{const interval=setInterval(()=>setTime(Date.now()),10000);return()=>clearInterval(interval);},[]);
 const energy=progress&&rules?Math.min(rules.energy_max,progress.energy+Math.max(0,Math.floor((time-Date.parse(progress.energy_at))/(rules.energy_regen_seconds*1000)))):0;
 const elapsed=progress?Math.max(0,Math.floor((time-Date.parse(progress.energy_at))/1000)):0;
 const nextEnergy=rules?rules.energy_regen_seconds-elapsed%rules.energy_regen_seconds:0;
 const level=progress?.level||1, xpThreshold=rules?rules.xp_level_base*level*(level+1)/2:100;
 const prevXp=rules?rules.xp_level_base*(level-1)*level/2:0;
 const xpPct=progress?Math.min(100,Math.max(0,(progress.xp_total-prevXp)/(xpThreshold-prevXp)*100)):0;
 const race=species.find(x=>x.id===captain.species_id),klass=classes.find(x=>x.id===captain.class_id),ship=ships.find(x=>x.id===captain.starter_ship_id);
 const doAction=async(a:Action)=>{
  if(busy||!progress||energy<a.energy_cost)return;setBusy(true);setError('');setResult(null);
  const r=await supabase.rpc('perform_game_action',{p_slug:a.slug});
  if(r.error)setError(r.error.message);else {setResult(r.data as Result);await refresh();setTime(Date.now());}
  setBusy(false);
 };
 const upgrade=async(id:string)=>{
  if(busy||!progress?.upgrade_points)return;setBusy(true);setError('');
  const r=await supabase.rpc('upgrade_captain_skill',{p_skill:id});
  if(r.error)setError(r.error.message);else await refresh();
  setBusy(false);
 };
 const reset=async()=>{
  if(resetWord!=='RESET'||!isEditor||busy)return;setBusy(true);setError('');
  const r=await supabase.rpc('reset_test_captain',{p_confirmation:'RESET'});
  if(r.error){setError(r.error.message);setBusy(false);}else onReset();
 };
 const here=locations.find(x=>x.id===position);
 const hereName=here?.game_locations_i18n.find(x=>x.locale===lang)?.name||here?.game_locations_i18n.find(x=>x.locale==='hu')?.name||'—';
 const localActions=actions.filter(a=>placements.some(x=>x.location_id===position&&x.action_id===a.id));
 const travel=async(destination:string)=>{
  if(busy||!position)return;setBusy(true);setError('');setTravelNotice('');setResult(null);
  const res=await supabase.rpc('travel_to_location',{p_target:destination});
  if(res.error)setError(res.error.message);
  else{await refresh();setTime(Date.now());setTravelNotice(tr('Megérkeztél a célpontra.','Arrived at destination.'));}
  setBusy(false);
 };
 const siteName=(id:string)=>{const l=locations.find(x=>x.id===id);return l?.game_locations_i18n.find(x=>x.locale===lang)?.name||l?.game_locations_i18n.find(x=>x.locale==='hu')?.name||'—';};
 const timeline=[
  ...logs.map(x=>({key:'act'+x.id,at:x.performed_at,title:local(actions.find(a=>a.id===x.action_id)?.game_actions_i18n)?.name||'—',detail:(x.succeeded?tr('Siker','Success'):tr('Sikertelen','Failed'))+' · '+x.roll_total+'/'+x.target_number+' · +'+x.xp_awarded+' XP'})),
  ...travelLogs.map(x=>({key:'travel'+x.id,at:x.traveled_at,title:tr('Utazás','Travel')+' → '+siteName(x.destination_id),detail:siteName(x.origin_id)+' · ⚡ '+x.energy_spent}))
 ].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,9);
 const pool=(s:Skill)=>((captain.attribute_pips[s.attribute]||3)+(captain.skill_bonus_pips[s.id]||0)+(upgrades.find(u=>u.skill_id===s.id)?.bonus_pips||0));
 return <section className="cmd-shell">
  <header className="cmd-head"><div><small>{tr('HATÁRVILÁG // PARANCSNOKI TERMINÁL','HATÁRVILÁG // COMMAND TERMINAL')}</small><strong>{captain.captain_name}</strong></div>
   <nav>{(['bridge','map','character','ship','log'] as const).map(k=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{({bridge:tr('Híd','Bridge'),map:tr('Szektortérkép','Sector Map'),character:tr('Karakter','Character'),ship:tr('Hajó','Ship'),log:tr('Napló','Log')})[k]}</button>)}</nav>
  </header>
  <div className="cmd-summary">
   <div className="cmd-identity"><img alt="" src={race?.image_path?'https://assets.voidnoir.net/'+race.image_path:undefined}/><span><strong>{captain.captain_name}</strong><small>{local(klass?.game_classes_i18n)?.name} · {local(race?.game_species_i18n)?.name}</small><b>{tr('Szint','Level')} {level}</b></span></div>
   <div className="cmd-energy"><div><small>⚡ {tr('Energia','Energy')}</small><strong>{energy} / {rules?.energy_max||100}</strong></div><div className="cmd-meter"><span style={{width:(100*energy/(rules?.energy_max||100))+'%'}}/></div><small>{energy===(rules?.energy_max||100)?tr('Feltöltve','Fully charged'):tr('Következő +1','Next +1')+' '+Math.floor(nextEnergy/60)+':'+String(nextEnergy%60).padStart(2,'0')}</small></div>
   <div className="cmd-energy"><div><small>XP</small><strong>{progress?.xp_total||0} / {xpThreshold}</strong></div><div className="cmd-meter"><span style={{width:xpPct+'%'}}/></div><small>{tr('Fejlesztési pont','Upgrade points')}: {progress?.upgrade_points||0}</small></div>
   <div className="cmd-summary-ship"><ShipArt slug={ship?.slug||'vagabond'}/><span>{local(ship?.game_starter_ships_i18n)?.name||'—'}</span></div>
  </div>
  <main className="cmd-body">
   {tab==='bridge'&&<><div className="cmd-title"><h2>{tr('ELÉRHETŐ TEVÉKENYSÉGEK','AVAILABLE ACTIVITIES')}</h2><small>{hereName}</small></div>
    <div className="cmd-actions location-scoped">{localActions.map(a=>{const s=skills.find(x=>x.id===a.skill_id);return <article key={a.id} className="cmd-action">
     <div className="cmd-action-art">{s&&<SkillArt slug={s.slug} path={s.icon_path}/>}</div>
     <h3>{local(a.game_actions_i18n)?.name||a.slug}</h3><p>{local(a.game_actions_i18n)?.description}</p>
     <footer><small>⚡{a.energy_cost} · TN {a.target_number}</small><button disabled={busy||!progress||energy<a.energy_cost} onClick={()=>void doAction(a)}>{tr('Végrehajtás','Perform')} →</button></footer>
    </article>})}</div>
    {localActions.length===0&&<p className="cmd-empty">{tr('Itt nincs elérhető akció. Nyisd meg a szektortérképet és indulj tovább!','No actions available here. Open the sector map and travel onward!')}</p>}
    <div className="cmd-result" role="status">{result?<><strong>{result.succeeded?tr('SIKER','SUCCESS'):tr('SIKERTELEN','FAILED')}</strong><span>{local(actions.find(a=>a.id===result.action_id)?.game_actions_i18n)?.[result.succeeded?'success_message':'failure_message']} · {tr('Dobás','Roll')}: {result.dice.join(' + ')}{result.pip_bonus?' + '+result.pip_bonus:''} = {result.roll_total} / TN {result.target_number} · +{result.xp_awarded} XP {result.level_up?' · '+tr('SZINTLÉPÉS!','LEVEL UP!'):''}</span></>:<span>{tr('Az energia a szerveren, kijelentkezés alatt is regenerálódik.','Energy regenerates on the server, even while offline.')}</span>}</div>
   </>}
   {tab==='map'&&<><div className="cmd-title"><h2>{tr('SZAKASZTÉRKÉP // SX-001','SECTOR MAP // SX-001')}</h2><small>{hereName}</small></div>
    <SectorMap locale={locale} locations={locations} routes={routes} discovered={discoveries} currentId={position} energy={energy} busy={busy} onTravel={destination=>void travel(destination)}/>
    {(travelNotice||error)&&<div className={'cmd-map-notice '+(error?'cmd-error':'')} role="status">{error||travelNotice}</div>}
   </>}
   {tab==='character'&&<><div className="cmd-title"><h2>{tr('KARAKTERFEJLŐDÉS','CHARACTER PROGRESSION')}</h2><small>{tr('Szabad pontok','Free points')}: {progress?.upgrade_points||0}</small></div>
    <div className="cmd-attributes">{attributes.map(a=><div key={a}><AttributeArt attribute={a}/><b>{attributeNames[lang][a]}</b><span>{toDice(captain.attribute_pips[a]||3)}</span></div>)}</div>
    <div className="cmd-group-tabs">{attributes.map(a=><button className={group===a?'active':''} key={a} onClick={()=>setGroup(a)}>{attributeNames[lang][a]}</button>)}</div>
    <div className="cmd-skills">{skills.filter(s=>s.attribute===group).map(s=><div key={s.id}><SkillArt slug={s.slug} path={s.icon_path}/><span>{local(s.game_skills_i18n)?.name}</span><strong>{toDice(pool(s))}</strong><button title={tr('Skill fejlesztése','Upgrade skill')} disabled={busy||!progress?.upgrade_points||(upgrades.find(u=>u.skill_id===s.id)?.bonus_pips||0)>=12} onClick={()=>void upgrade(s.id)}><LucidePlus/></button></div>)}</div>
   </>}
   {tab==='ship'&&<><div className="cmd-title"><h2>{tr('HAJÓ ÉS LEGÉNYSÉG','SHIP AND CREW')}</h2></div><div className="cmd-ship"><ShipArt slug={ship?.slug||'vagabond'}/><div><h2>{local(ship?.game_starter_ships_i18n)?.name}</h2><p>{local(ship?.game_starter_ships_i18n)?.description}</p><p>HP {ship?.hull} · {tr('Raktér','Cargo')} {ship?.cargo} · {tr('Sebesség','Speed')} {ship?.speed}</p><h3>{tr('Legénység','Crew')}</h3>{crew.map(c=><p key={c.position}>{c.position==='pilot'?tr('Pilóta','Pilot'):tr('Navigátor','Navigator')}: {c.name}</p>)}</div></div></>}
   {tab==='log'&&<><div className="cmd-title"><h2>{tr('ESEMÉNYNAPLÓ','ACTIVITY LOG')}</h2></div><div className="cmd-log">{timeline.length?timeline.map(x=><div key={x.key}><small>{new Date(x.at).toLocaleString(en?'en-GB':'hu-HU')}</small><strong>{x.title}</strong><span>{x.detail}</span></div>):<p>{tr('Még nincs végrehajtott akció vagy utazás.','No actions or travel yet.')}</p>}</div></>}
   {error&&<p className="cmd-error" role="alert">{error}</p>}
  </main>
  <footer className="cmd-footer"><span>SPACE D6 FREE · {tr('SZERVEROLDALI JÁTÉKMOTOR','SERVER-AUTHORITATIVE GAME ENGINE')}</span>
    {isEditor&&<button onClick={()=>setConfirmReset(true)}>{tr('Tesztkarakter törlése','Reset test captain')}</button>}
    <span>M2 / M3</span>
  </footer>
  {confirmReset&&<div className="cmd-modal-bg"><div className="cmd-modal" role="dialog" aria-modal="true"><h3>{tr('Tesztkarakter törlése','Reset test captain')}</h3><p>{tr('Ez csak a saját karakteredet törli! Írd be: RESET','Deletes only your own captain! Type RESET.')}</p><input autoFocus value={resetWord} onChange={e=>setResetWord(e.target.value)} placeholder="RESET"/><div><button onClick={()=>setConfirmReset(false)}>{tr('Mégse','Cancel')}</button><button disabled={busy||resetWord!=='RESET'} onClick={()=>void reset()}>{tr('Törlés','Delete')}</button></div></div></div>}
 </section>;
}
