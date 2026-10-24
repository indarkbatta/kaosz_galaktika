import GamePanelFrame from './components/GamePanelFrame';
import {createPortal} from 'react-dom';
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {SkillArt,AttributeArt} from './components/GameArt';
import {LucidePlus,LucideZap} from './components/LucideSigns';
import {attributes,toDice} from './lib/d6';
import SectorMap,{type SectorLocation,type SectorRoute,type SectorDiscovery,type WorldGalaxy,type WorldQuadrant,type WorldSector} from './SectorMap';
import Cantina,{type CrewMember} from './Cantina';
import SkillChallengePanel from './SkillChallengePanel';
import CraftingPanel from './CraftingPanel';
import ShipLoadout from './ShipLoadout';
import GameEdgeTabs,{type GameTab} from './components/GameEdgeTabs';
import './captain-dashboard.css';
import {BridgeEncounterCard} from './components/BridgeEncounterCard';
import {DiceRollPanel,type DiceResult} from './components/DiceRollPanel';

const ExpeditionRecruitment=lazy(()=>import('./ExpeditionRecruitment'));
const ExpeditionLoadout=lazy(()=>import('./ExpeditionLoadout'));
const CombatPanel=lazy(()=>import('./CombatPanel'));
type I18n={locale:string;name:string;description?:string;success_message?:string;failure_message?:string};
type Portrait={id:string;slug:string;image_path:string|null;game_species_i18n?:I18n[];game_classes_i18n?:I18n[]};
type Ship={id:string;slug:string;image_path:string|null;hull:number;cargo:number;speed:number;game_starter_ships_i18n:I18n[]};
type Skill={id:string;slug:string;attribute:string;icon_path:string|null;game_skills_i18n:I18n[]};
type Action={image_path:string|null;xp_success:number;xp_failure:number;id:string;slug:string;energy_cost:number;target_number:number;skill_id:string;game_actions_i18n:I18n[]};
type Progress={level:number;xp_total:number;energy:number;energy_at:string;upgrade_points:number};
type Rules={energy_per_tick:number;energy_max:number;energy_regen_seconds:number;xp_level_base:number;skill_points_per_level:number};
type Log=DiceResult & {id:number;action_id:string;performed_at:string;roll_total:number;target_number:number;succeeded:boolean;xp_awarded:number};
type TravelLog={id:number;origin_id:string;destination_id:string;energy_spent:number;traveled_at:string};
type InventoryRow={item_id:string;quantity:number;game_items:{slug:string;rarity:string;category:string;game_items_i18n:I18n[]}};
type LootRow={item_id:string;quantity:number;game_items:{game_items_i18n:I18n[]}};
type Result=DiceResult & {action_id:string;dice:number[];roll_total:number;target_number:number;succeeded:boolean;xp_awarded:number;level_up:boolean;pip_bonus:number};
export type GameCaptain={id:string;captain_name:string;species_id:string;class_id:string;starter_ship_id:string;attribute_pips:Record<string,number>;skill_bonus_pips:Record<string,number>};
const attributeNames={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
export default function CaptainDashboard({captain,species,classes,ships,skills,crew,locale,isEditor,onReset}:{
 captain:GameCaptain;species:Portrait[];classes:Portrait[];ships:Ship[];skills:Skill[];crew:CrewMember[];locale:string;isEditor:boolean;onReset:()=>void
}){
 const en=locale==='en',lang=en?'en':'hu',tr=(hu:string,eng:string)=>en?eng:hu;
 const local=(x:I18n[]|undefined)=>x?.find(y=>y.locale===lang)||x?.find(y=>y.locale==='hu');
 const [headerHost,setHeaderHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{setHeaderHost(document.getElementById('captain-header-status'));},[]);
 const [progress,setProgress]=useState<Progress|null>(null),[rules,setRules]=useState<Rules|null>(null);
 const [actions,setActions]=useState<Action[]>([]),[logs,setLogs]=useState<Log[]>([]),[travelLogs,setTravelLogs]=useState<TravelLog[]>([]);
 const [locations,setLocations]=useState<SectorLocation[]>([]),[routes,setRoutes]=useState<SectorRoute[]>([]);
 const [galaxies,setGalaxies]=useState<WorldGalaxy[]>([]),[quadrants,setQuadrants]=useState<WorldQuadrant[]>([]),[sectors,setSectors]=useState<WorldSector[]>([]);
 const [position,setPosition]=useState(''),[discoveries,setDiscoveries]=useState<SectorDiscovery[]>([]);
 const [placements,setPlacements]=useState<{location_id:string;action_id:string}[]>([]);
 const [inventory,setInventory]=useState<InventoryRow[]>([]);
 const [activeCrew,setActiveCrew]=useState<CrewMember[]>(crew);
 const [shipStatus,setShipStatus]=useState<{ready:boolean;base_speed:number;speed:number}|null>(null);
 const [upgrades,setUpgrades]=useState<{skill_id:string;bonus_pips:number}[]>([]);
 const [tab,setTab]=useState<GameTab>('bridge'),[group,setGroup]=useState('body');
 const [cantinaTab,setCantinaTab]=useState<'expedition'|'service'>('expedition');
 const [busy,setBusy]=useState(false);
 const actionGate=useRef(false);
 const actionRequest=useRef<{slug:string;id:string}|null>(null);
 const [actionRoll,setActionRoll]=useState<{title:string;result:Result|null;message?:string}|null>(null);
 const [diceDone,setDiceDone]=useState(false);
 const revealDice=useCallback(()=>setDiceDone(true),[]);
 const [time,setTime]=useState(Date.now()),[confirmReset,setConfirmReset]=useState(false),[resetWord,setResetWord]=useState('');
 const refresh=useCallback(async()=>{
  const [p,r,a,l,u,pos,dis,loc,rou,placement,travelHistory,inv,crewData,loadout,gals,quads,sys]=await Promise.all([
    supabase.from('character_progress').select('level,xp_total,energy,energy_at,upgrade_points').eq('character_id',captain.id).single(),
    supabase.from('gameplay_rules').select('energy_per_tick,energy_max,energy_regen_seconds,xp_level_base,skill_points_per_level').eq('id',1).single(),
    supabase.from('game_actions').select('id,slug,image_path,xp_success,xp_failure,energy_cost,target_number,skill_id,game_actions_i18n(locale,name,description,success_message,failure_message)').eq('is_published',true).order('sort_order'),
    supabase.from('character_action_log').select('id,action_id,performed_at,dice,pip_bonus,wild_dice,wild_penalty,wild_cancelled_index,wild_rule,roll_total,target_number,succeeded,xp_awarded').eq('character_id',captain.id).order('id',{ascending:false}).limit(10),
    supabase.from('character_skill_upgrades').select('skill_id,bonus_pips').eq('character_id',captain.id),
    supabase.from('character_positions').select('location_id').eq('character_id',captain.id).single(),
    supabase.from('character_location_discoveries').select('location_id,discovered_at').eq('character_id',captain.id),
    supabase.from('game_locations').select('id,slug,kind,sector_id,x,y,image_path,is_published,game_locations_i18n(locale,name,description)').eq('is_published',true),
    supabase.from('game_routes').select('id,origin_id,destination_id,energy_cost,is_published').eq('is_published',true),
    supabase.from('game_location_actions').select('location_id,action_id'),
    supabase.from('character_travel_log').select('id,origin_id,destination_id,energy_spent,traveled_at').eq('character_id',captain.id).order('id',{ascending:false}).limit(8),
    supabase.from('character_inventory').select('item_id,quantity,game_items(slug,rarity,category,game_items_i18n(locale,name,description))').eq('character_id',captain.id),
    supabase.from('character_crew').select('id,position,name,specialty,aptitude,species_slug,portrait_path,rarity,class_id').eq('character_id',captain.id),
    supabase.rpc('get_ship_loadout'),
    supabase.from('game_galaxies').select('id,slug,name_hu,name_en,image_path').eq('is_published',true),
    supabase.from('game_quadrants').select('id,galaxy_id,slug,name_hu,name_en,x,y,image_path').eq('is_published',true),
    supabase.from('game_sectors').select('id,quadrant_id,slug,name_hu,name_en,x,y,image_path').eq('is_published',true)
  ]);
  const problem=p.error||r.error||a.error||l.error||u.error||pos.error||dis.error||loc.error||rou.error||placement.error||travelHistory.error||inv.error||crewData.error||loadout.error||gals.error||quads.error||sys.error;
  if(problem){notify(problem.message,'error');return;}
  setProgress(p.data as Progress);setRules(r.data as Rules);setActions(a.data as Action[]);setLogs(l.data as Log[]);setUpgrades(u.data||[]);
  setPosition(pos.data?.location_id||'');setDiscoveries((dis.data||[]) as SectorDiscovery[]);
  setLocations((loc.data||[]) as unknown as SectorLocation[]);setRoutes((rou.data||[]) as SectorRoute[]);
  setGalaxies((gals.data||[]) as WorldGalaxy[]);setQuadrants((quads.data||[]) as WorldQuadrant[]);setSectors((sys.data||[]) as WorldSector[]);
  setPlacements(placement.data||[]);setTravelLogs((travelHistory.data||[]) as TravelLog[]);setInventory((inv.data||[]) as unknown as InventoryRow[]);setActiveCrew((crewData.data||[]) as CrewMember[]);setShipStatus(loadout.data?.stats||null);
 },[captain.id]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{const interval=setInterval(()=>setTime(Date.now()),10000);return()=>clearInterval(interval);},[]);
 const energy=progress&&rules?Math.min(rules.energy_max,progress.energy+Math.max(0,Math.floor((time-Date.parse(progress.energy_at))/(rules.energy_regen_seconds*1000)))*(rules.energy_per_tick||1)):0;
 const elapsed=progress?Math.max(0,Math.floor((time-Date.parse(progress.energy_at))/1000)):0;
 const nextEnergy=rules?rules.energy_regen_seconds-elapsed%rules.energy_regen_seconds:0;
 const level=progress?.level||1, xpThreshold=rules?rules.xp_level_base*level*(level+1)/2:100;
 const race=species.find(x=>x.id===captain.species_id),klass=classes.find(x=>x.id===captain.class_id),ship=ships.find(x=>x.id===captain.starter_ship_id);
 const doAction=async(a:Action)=>{
  if(actionGate.current||actionRoll||busy||!progress||energy<a.energy_cost)return;
  actionGate.current=true;setBusy(true);setDiceDone(false);
  setActionRoll({title:local(a.game_actions_i18n)?.name||a.slug,result:null});
  if(actionRequest.current?.slug!==a.slug)actionRequest.current={slug:a.slug,id:crypto.randomUUID()};
  try{
  const r=await supabase.rpc('perform_game_action',{p_slug:a.slug,p_request_id:actionRequest.current.id});
  if(r.error){setActionRoll(null);notify(r.error.message,'error');}
  else {
   const data=r.data as Result & {log_id:number};
   actionRequest.current=null;
   const msg=local(a.game_actions_i18n)?.[data.succeeded?'success_message':'failure_message']||tr('A művelet lezárult.','Action resolved.');
   let reward='';
   if(data.succeeded&&data.log_id){
    const loot=await supabase.from('character_loot_events')
     .select('item_id,quantity,game_items(game_items_i18n(locale,name))').eq('action_log_id',data.log_id).eq('character_id',captain.id);
    if(loot.error)notify(loot.error.message,'warning');
    else reward=((loot.data||[]) as unknown as LootRow[]).map(x=>
     '+'+x.quantity+' '+(local(x.game_items?.game_items_i18n)?.name||tr('tárgy','item'))).join(', ');
   }
   setActionRoll({title:local(a.game_actions_i18n)?.name||a.slug,result:data,
    message:msg+' · +'+data.xp_awarded+' XP'+(reward?' · '+reward:'')+(data.level_up?' · '+tr('SZINTLÉPÉS!','LEVEL UP!'):'')});
   await refresh();setTime(Date.now());
  }
  }catch(e){setActionRoll(null);notify(e instanceof Error?e.message:String(e),'error');}
  finally{actionGate.current=false;setBusy(false);}
 };
 const refill=async()=>{
  if(busy||!isEditor)return;setBusy(true);
  const r=await supabase.rpc('debug_refill_energy');
  if(r.error)notify(r.error.message,'error');else{await refresh();setTime(Date.now());notify(tr('Energia azonnal feltöltve (teszt).','Energy instantly refilled (test).'),'success');}
  setBusy(false);
 };
 const upgrade=async(id:string)=>{
  if(busy||!progress?.upgrade_points)return;setBusy(true);
  const r=await supabase.rpc('upgrade_captain_skill',{p_skill:id});
  if(r.error)notify(r.error.message,'error');
  else{await refresh();notify(tr('Skill fejlődött: +1 pip','Skill upgraded: +1 pip'),'success');}
  setBusy(false);
 };
 const reset=async()=>{
  if(resetWord!=='RESET'||!isEditor||busy)return;setBusy(true);
  const r=await supabase.rpc('reset_test_captain',{p_confirmation:'RESET'});
  if(r.error){notify(r.error.message,'error');setBusy(false);}
  else{notify(tr('Tesztkarakter törölve.','Test captain reset.'),'success');onReset();}
 };
 const here=locations.find(x=>x.id===position);
 const hereName=here?.game_locations_i18n.find(x=>x.locale===lang)?.name||here?.game_locations_i18n.find(x=>x.locale==='hu')?.name||'—';
 const localActions=actions.filter(a=>placements.some(x=>x.location_id===position&&x.action_id===a.id));
 const travel=async(destination:string)=>{
  if(busy||!position)return;setBusy(true);
  const res=await supabase.rpc('travel_to_location',{p_target:destination});
  if(res.error)notify(res.error.message,'error');
  else{await refresh();setTime(Date.now());notify(tr('Megérkeztél a célpontra.','Arrived at destination.'),'success');}
  setBusy(false);
 };
 const siteName=(id:string)=>{const l=locations.find(x=>x.id===id);return l?.game_locations_i18n.find(x=>x.locale===lang)?.name||l?.game_locations_i18n.find(x=>x.locale==='hu')?.name||'—';};
 const timeline=[
  ...logs.map(x=>({key:'act'+x.id,at:x.performed_at,title:local(actions.find(a=>a.id===x.action_id)?.game_actions_i18n)?.name||'—',detail:(x.succeeded?tr('Siker','Success'):tr('Sikertelen','Failed'))+' · '+x.roll_total+' / '+tr('Célszám (TN)','Target Number (TN)')+' '+x.target_number+' · +'+x.xp_awarded+' XP'})),
  ...travelLogs.map(x=>({key:'travel'+x.id,at:x.traveled_at,title:tr('Utazás','Travel')+' → '+siteName(x.destination_id),detail:siteName(x.origin_id)+' · ⚡ '+x.energy_spent}))
 ].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,9);
 const pool=(s:Skill)=>((captain.attribute_pips[s.attribute]||3)+(captain.skill_bonus_pips[s.id]||0)+(upgrades.find(u=>u.skill_id===s.id)?.bonus_pips||0));
 return <GamePanelFrame compact>
  <GameEdgeTabs locale={locale} active={tab} onChange={setTab}/>
  <section className="cmd-shell">
  {headerHost&&createPortal(<div className="captain-global-status" aria-label={tr('Kapitány állapota','Captain status')}>
   <span className="captain-global-identity"><strong>{captain.captain_name}</strong><span>{local(race?.game_species_i18n)?.name} · {local(klass?.game_classes_i18n)?.name} · <b>{tr('Szint','Level')} {level}</b></span></span>
   <span><small>{tr('ENERGIA','ENERGY')}</small><b>{energy}/{rules?.energy_max||16}</b><small>{energy===(rules?.energy_max||16)?tr('Feltöltve','Full'):'+'+(rules?.energy_per_tick||1)+' '+Math.floor(nextEnergy/60)+':'+String(nextEnergy%60).padStart(2,'0')}</small>{isEditor&&<button type="button" className="cmd-debug-refill" disabled={busy} title={tr('Teszt: energia maximumra töltése','Test: refill energy to maximum')} aria-label={tr('Energia feltöltése teszthez','Test energy refill')} onClick={()=>void refill()}><LucideZap width={15} height={15}/></button>}</span>
   <span><small>XP</small><b>{progress?.xp_total||0}/{xpThreshold}</b><small>{tr('Fejl. pont','Points')} {progress?.upgrade_points||0}</small></span>
   <span><small>{tr('HAJÓ','SHIP')}</small><b>{local(ship?.game_starter_ships_i18n)?.name||'—'}</b></span>
  </div>,headerHost)}
  <main className="cmd-body" id="cmd-tab-panel" role="tabpanel" aria-labelledby={'cmd-tab-'+tab}>
   {tab==='bridge'&&<><div className="cmd-title"><h2>{tr('ELÉRHETŐ TEVÉKENYSÉGEK','AVAILABLE ACTIVITIES')}</h2><small>{hereName}</small></div>
    <SkillChallengePanel locale={locale} characterId={captain.id} locationId={position} energy={energy}
      skills={skills} attributePips={captain.attribute_pips} skillBonusPips={captain.skill_bonus_pips}
      upgrades={upgrades} onProgress={refresh}>
      {localActions.map(a=>{const sk=skills.find(x=>x.id===a.skill_id);return <BridgeEncounterCard key={a.id}
       kind={tr('Tevékenység','Activity')} title={local(a.game_actions_i18n)?.name||a.slug}
       description={local(a.game_actions_i18n)?.description} imagePath={a.image_path}
       meta={<><span>{local(sk?.game_skills_i18n)?.name}</span><span>{tr('Célszám (TN)','Target Number (TN)')}: {a.target_number}</span><span>⚡ {a.energy_cost}</span><span>{a.xp_failure}–{a.xp_success} XP</span></>}
       disabled={busy||!!actionRoll||!progress||energy<a.energy_cost} onAction={()=>void doAction(a)} action={tr('Végrehajtás','Perform')}/>;})}
    </SkillChallengePanel>
    {localActions.length===0&&<p className="cmd-empty">{tr('Itt nincs elérhető akció. Nyisd meg a szektortérképet és indulj tovább!','No actions available here. Open the sector map and travel onward!')}</p>}

   </>}
   {tab==='combat'&&<Suspense fallback={<p>{tr('Harc betöltése…','Loading combat…')}</p>}><CombatPanel locale={locale} locationId={position} onChanged={()=>void refresh()}/></Suspense>}
   {tab==='map'&&<><div className="cmd-title"><h2>{tr('SZAKASZTÉRKÉP // SX-001','SECTOR MAP // SX-001')}</h2><small>{hereName}</small></div>
    <SectorMap locale={locale} galaxies={galaxies} quadrants={quadrants} sectors={sectors} locations={locations} routes={routes.map(r=>({...r,energy_cost:Math.max(1,Math.ceil(r.energy_cost*(shipStatus?.base_speed||1)/(shipStatus?.speed||1)))}))} shipReady={shipStatus?.ready??false} discovered={discoveries} currentId={position} energy={energy} busy={busy} onTravel={destination=>void travel(destination)}/>
   </>}
   {tab==='character'&&<><div className="cmd-title"><h2>{tr('KARAKTERFEJLŐDÉS','CHARACTER PROGRESSION')}</h2><small>{tr('Szabad pontok','Free points')}: {progress?.upgrade_points||0}</small></div>
    <div className="cmd-attributes">{attributes.map(a=><div key={a}><AttributeArt attribute={a}/><b>{attributeNames[lang][a]}</b><span>{toDice(captain.attribute_pips[a]||3)}</span></div>)}</div>
    <div className="cmd-group-tabs">{attributes.map(a=><button className={group===a?'active':''} key={a} onClick={()=>setGroup(a)}>{attributeNames[lang][a]}</button>)}</div>
    <div className="cmd-skills">{skills.filter(s=>s.attribute===group).map(s=><div key={s.id}><SkillArt slug={s.slug} path={s.icon_path}/><span>{local(s.game_skills_i18n)?.name}</span><strong>{toDice(pool(s))}</strong><button title={tr('Skill fejlesztése','Upgrade skill')} disabled={busy||!progress?.upgrade_points||(upgrades.find(u=>u.skill_id===s.id)?.bonus_pips||0)>=12} onClick={()=>void upgrade(s.id)}><LucidePlus/></button></div>)}</div>
   </>}
   {tab==='ship'&&<ShipLoadout characterId={captain.id} shipSlug={ship?.slug||'vagabond'} shipImage={ship?.image_path} shipName={local(ship?.game_starter_ships_i18n)?.name||'—'} locale={locale} onChanged={refresh}/>}
   {tab==='cantina'&&<><div className="cmd-title"><h2>{tr('HATÁRVIDÉKI KANTIN // TOBORZÁS','FRONTIER CANTINA // RECRUITMENT')}</h2><small>⚡ {energy}</small></div><nav className="exp-local-tabs" aria-label={tr('Toborzás típusa','Recruitment type')}><button type="button" aria-pressed={cantinaTab==='expedition'} onClick={()=>setCantinaTab('expedition')}>{tr('Expedíciós társak','Expedition companions')}</button><button type="button" aria-pressed={cantinaTab==='service'} onClick={()=>setCantinaTab('service')}>{tr('Hajós személyzet','Ship service crew')}</button></nav>{cantinaTab==='expedition'?<Suspense fallback={<p>…</p>}><ExpeditionRecruitment locale={locale} atStation={here?.slug==='frontier_station'} energy={energy} skills={skills} onChanged={refresh}/></Suspense>:<Cantina locale={locale} atStation={here?.slug==='frontier_station'} crew={activeCrew} energy={energy} onChanged={refresh}/>}</>}
   {tab==='loadout'&&<Suspense fallback={<p>{tr('Loadout betöltése…','Loading loadout…')}</p>}><ExpeditionLoadout characterId={captain.id} captainName={captain.captain_name} locale={locale} crew={activeCrew} onChanged={refresh}/></Suspense>}
   {tab==='inventory'&&<><div className="cmd-title"><h2>{tr('RAKTÉR // GYÁRTÁS','CARGO // CRAFTING')}</h2></div><CraftingPanel locale={locale} inventory={inventory} onCrafted={refresh}/></>}
   {tab==='log'&&<><div className="cmd-title"><h2>{tr('ESEMÉNYNAPLÓ','ACTIVITY LOG')}</h2></div><div className="cmd-log">{timeline.length?timeline.map(x=><div key={x.key}><small>{new Date(x.at).toLocaleString(en?'en-GB':'hu-HU')}</small><strong>{x.title}</strong><span>{x.detail}</span>{x.key.startsWith('act')&&<details><summary>{tr('Kockaeredmények','Dice results')}</summary><DiceRollPanel locale={locale} result={logs.find(log=>'act'+log.id===x.key)!}/></details>}</div>):<p>{tr('Még nincs végrehajtott akció vagy utazás.','No actions or travel yet.')}</p>}</div></>}
  </main>
  <footer className="cmd-footer"><span>SPACE D6 FREE · {tr('SZERVEROLDALI JÁTÉKMOTOR','SERVER-AUTHORITATIVE GAME ENGINE')}</span>
    {isEditor&&<button onClick={()=>setConfirmReset(true)}>{tr('Tesztkarakter törlése','Reset test captain')}</button>}
    <span>M2 / M3</span>
  </footer>
  {actionRoll&&<div className="bridge-dice-overlay"><section role="dialog" aria-modal="true" aria-label={actionRoll.title} className="bridge-dice-dialog">
   <h2>{actionRoll.title}</h2><DiceRollPanel locale={locale} result={actionRoll.result} rolling={!actionRoll.result} onComplete={revealDice}/>
   {diceDone&&<p>{actionRoll.message}</p>}<button disabled={!diceDone||busy} onClick={()=>setActionRoll(null)}>{tr('Vissza a hídra','Back to bridge')}</button>
  </section></div>}
  {confirmReset&&<div className="cmd-modal-bg"><div className="cmd-modal" role="dialog" aria-modal="true"><h3>{tr('Tesztkarakter törlése','Reset test captain')}</h3><p>{tr('Ez csak a saját karakteredet törli! Írd be: RESET','Deletes only your own captain! Type RESET.')}</p><input autoFocus value={resetWord} onChange={e=>setResetWord(e.target.value)} placeholder="RESET"/><div><button onClick={()=>setConfirmReset(false)}>{tr('Mégse','Cancel')}</button><button disabled={busy||resetWord!=='RESET'} onClick={()=>void reset()}>{tr('Törlés','Delete')}</button></div></div></div>}
 </section>
 </GamePanelFrame>;
}
