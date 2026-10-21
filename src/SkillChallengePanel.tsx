import {useCallback,useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {SkillArt} from './components/GameArt';
import {toDice} from './lib/d6';
import './skill-challenge.css';

type Step={name_hu:string;name_en:string;description_hu:string;description_en:string;skill_ids:string[];base_tn:number;energy_cost:number};
type Challenge={id:string;slug:string;location_id:string;name_hu:string;name_en:string;description_hu:string;description_en:string;steps:Step[];
 xp_full:number;xp_partial:number;xp_failure:number;repeatable:boolean;cooldown_hours:number;is_published:boolean};
type Run={id:string;challenge_id:string;definition:{steps:Step[];location_id:string};difficulty:string;level_at_start:number;
 step_index:number;successes:number;status:string;xp_awarded:number;reward_qty:number;finished_at:string|null;started_at:string};
type Roll={id:number;step_index:number;skill_id:string;dice:number[];pip_bonus:number;roll_total:number;target_number:number;succeeded:boolean};
type Skill={id:string;slug:string;attribute:string;icon_path:string|null;game_skills_i18n:{locale:string;name:string}[]};
const difficulties=[{id:'easy',hu:'Könnyű',en:'Easy',tn:-2,xp:'0,75×'},
 {id:'normal',hu:'Normál',en:'Normal',tn:0,xp:'1×'},
 {id:'hard',hu:'Nehéz',en:'Hard',tn:3,xp:'1,5×'},
 {id:'extreme',hu:'Extrém',en:'Extreme',tn:6,xp:'2×'}] as const;
export default function SkillChallengePanel({locale,characterId,locationId,energy,skills,attributePips,skillBonusPips,upgrades,onProgress}:{
 locale:string;characterId:string;locationId:string;energy:number;skills:Skill[];
 attributePips:Record<string,number>;skillBonusPips:Record<string,number>;
 upgrades:{skill_id:string;bonus_pips:number}[];onProgress:()=>void|Promise<void>;
}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const name=(x:{name_hu:string;name_en:string})=>en?x.name_en:x.name_hu;
 const skillName=(s:Skill)=>s.game_skills_i18n.find(x=>x.locale===locale)?.name||
  s.game_skills_i18n.find(x=>x.locale==='hu')?.name||s.slug;
 const [challenges,setChallenges]=useState<Challenge[]>([]),[runs,setRuns]=useState<Run[]>([]);
 const [logs,setLogs]=useState<Roll[]>([]);
 const [chosen,setChosen]=useState<string|null>(null),[difficulty,setDifficulty]=useState('normal');
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [last,setLast]=useState<{dice:number[];pip_bonus:number;roll_total:number;target_number:number;succeeded:boolean}|null>(null);
 const refresh=useCallback(async()=>{
  const [c,r]=await Promise.all([
   supabase.from('game_skill_challenges').select('*').eq('is_published',true).order('sort_order'),
   supabase.from('character_skill_challenge_runs').select('*').eq('character_id',characterId).order('started_at',{ascending:false}).limit(50)
  ]);
  if(c.error||r.error){notify((c.error||r.error)!.message,'error');return;}
  const ch=(c.data||[]) as Challenge[],history=(r.data||[]) as Run[];
  setChallenges(ch);setRuns(history);
  const mission=ch.find(x=>x.id===chosen);
  const current=history.find(x=>x.challenge_id===mission?.id&&x.status==='active')||
    history.find(x=>x.challenge_id===mission?.id);
  if(current){
   const result=await supabase.from('character_skill_challenge_rolls').select('*').eq('run_id',current.id).order('step_index');
   if(!result.error)setLogs((result.data||[]) as Roll[]);
  }else setLogs([]);
  setLoaded(true);
 },[characterId,chosen]);
 useEffect(()=>{void refresh();},[refresh]);
 const active=runs.find(x=>x.status==='active');
 const available=challenges.filter(x=>x.location_id===locationId);
 const selected=challenges.find(x=>x.id===chosen);
 const run=selected&&(runs.find(x=>x.challenge_id===selected.id&&x.status==='active')||
  runs.find(x=>x.challenge_id===selected.id));
 const steps=run?.definition.steps||selected?.steps||[];
 const step=run?.status==='active'?steps[run.step_index]:null;
 const completed=run&&run.status!=='active';
 const finished=selected&&runs.find(x=>x.challenge_id===selected.id&&x.status!=='active');
 const cooldown=!!finished&&!!selected?.repeatable&&!!finished.finished_at&&
  Date.now()<Date.parse(finished.finished_at)+selected.cooldown_hours*3600000;
 const locked=!!finished&&!selected?.repeatable||cooldown;
 const tn=(s:Step)=>Math.max(4,s.base_tn+Math.floor(((run?.level_at_start||1)-1)/5)+
  (difficulties.find(d=>d.id===run?.difficulty)?.tn||0));
 const pool=(s:Skill)=>(attributePips[s.attribute]||3)+(skillBonusPips[s.id]||0)+
  (upgrades.find(x=>x.skill_id===s.id)?.bonus_pips||0);
 const enter=(id:string)=>{setChosen(id);setDifficulty('normal');setLast(null);};
 const start=async()=>{
  if(!selected||busy)return;setBusy(true);
  try{
   const result=await supabase.rpc('start_skill_challenge',{p_slug:selected.slug,p_difficulty:difficulty});
   if(result.error)throw result.error;
   await refresh();
  }catch(error){notify(error instanceof Error?error.message:String(error),'error');}
  finally{setBusy(false);}
 };
 const roll=async(skill:string)=>{
  if(!run||!step||busy)return;setBusy(true);
  try{
   const result=await supabase.rpc('roll_skill_challenge',{p_run:run.id,p_step_index:run.step_index,p_skill:skill});
   if(result.error)throw result.error;
   setLast(result.data);await refresh();await onProgress();
   if(result.data?.status!=='active')notify(tr('Kihívás befejezve.','Challenge completed.'),'success');
  }catch(error){notify(error instanceof Error?error.message:String(error),'error');}
  finally{setBusy(false);}
 };
 const close=()=>{if(!busy){setChosen(null);setLast(null);}};
 return <>
  {loaded&&(available.length>0||active)&&<section className="sc-bridge">
   <div className="sc-bridge-head"><strong>✧ {tr('SKILL CHALLENGE-EK','SKILL CHALLENGES')}</strong>
    <small>{tr('Többlépcsős kihívások','Multi-step challenges')}</small></div>
   <div className="sc-bridge-list">{available.map(c=>{
    const underway=active?.challenge_id===c.id;
    const previous=runs.find(x=>x.challenge_id===c.id&&x.status!=='active');
    const unavailable=!!active&&!underway||
       !!previous&&!c.repeatable||
       !!previous&&c.repeatable&&!!previous.finished_at&&Date.now()<Date.parse(previous.finished_at)+c.cooldown_hours*3600000;
    return <article key={c.id}><div><strong>{name(c)}</strong><small>{c.steps.length} {tr('lépés','steps')} · ⚡ {c.steps.reduce((s,x)=>s+x.energy_cost,0)} · {c.xp_full} XP</small></div>
      <button type="button" disabled={busy||unavailable} onClick={()=>enter(c.id)}>
       {underway?tr('Folytatás','Resume'):previous&&!c.repeatable?tr('Teljesítve','Completed'):tr('Indítás','Start')} →</button></article>;
   })}
   {active&&!available.some(x=>x.id===active.challenge_id)&&<p>{tr('Aktív kihívásod egy másik helyszínen vár.','Your active challenge awaits at another location.')}</p>}
   </div>
  </section>}
  {selected&&<div className="sc-play-overlay"><section role="dialog" aria-modal="true" aria-label={tr('Skill Challenge','Skill Challenge')} className="sc-play">
   <header><div><small>HATÁRVILÁG / SKILL CHALLENGE</small><h2>{name(selected)}</h2></div>
    <button type="button" aria-label={tr('Bezárás','Close')} onClick={close} disabled={busy}>×</button></header>
   <div className="sc-play-grid">
    <section className="sc-play-story">
     <p>{en?selected.description_en:selected.description_hu}</p>
     <div className="sc-timeline">{steps.map((s,i)=><div key={i}
      className={(run&&i<run.step_index?'done ':'')+(run?.status==='active'&&i===run.step_index?'current':'')}>
      <b>{i+1}</b><span>{name(s)}</span></div>)}</div>
     {run&&<div className="sc-summary"><span>{tr('Sikerek','Successes')}: <b>{run.successes}/{Math.ceil(steps.length*.75)}</b></span>
      <span>{tr('Szint','Level')}: <b>{run.level_at_start}</b></span></div>}
     {logs.length>0&&<div className="sc-history"><strong>{tr('Korábbi dobások','Previous rolls')}</strong>
      {logs.map(log=><p key={log.id}>{log.step_index+1}. {skillName(skills.find(x=>x.id===log.skill_id)??skills[0])}
       <span>{log.dice.join('+')}{log.pip_bonus?'+'+log.pip_bonus:''} = {log.roll_total}/{log.target_number} {log.succeeded?'✓':'×'}</span></p>)}</div>}
    </section>
    <section className="sc-play-action">
     {!run&&<><h3>{tr('Nehézségi fokozat','Difficulty')}</h3>
      <div className="sc-difficulties">{difficulties.map(d=><button type="button" key={d.id}
       className={difficulty===d.id?'active':''} aria-pressed={difficulty===d.id} onClick={()=>setDifficulty(d.id)}>
       <strong>{en?d.en:d.hu}</strong><small>TN {d.tn>0?'+':''}{d.tn} · XP {d.xp}</small></button>)}</div>
      <p>{tr('A küldetés befejezésekor jár XP. A lépések energiát fogyasztanak.',
        'XP is awarded at completion. Each test consumes energy.')}</p>
      <button type="button" className="sc-primary" disabled={busy||locked||!!active} onClick={()=>void start()}>
       {tr('Kihívás indítása','Start challenge')}</button>
     </>}
     {run?.status==='active'&&step&&<><small>{tr('AKTUÁLIS LÉPÉS','CURRENT STEP')} {run.step_index+1}/{steps.length}</small>
      <h3>{name(step)}</h3><p>{en?step.description_en:step.description_hu}</p>
      <div className="sc-check-info"><span>TN {tn(step)}</span><span>⚡ {step.energy_cost}</span>
       <span>{difficulties.find(x=>x.id===run.difficulty)?.[en?'en':'hu']}</span></div>
      <strong>{tr('Válassz skillt','Choose skill')}</strong>
      <div className="sc-skill-choices">{step.skill_ids.map(id=>{const s=skills.find(x=>x.id===id);
       return s&&<button type="button" key={id} disabled={busy||energy<step.energy_cost||locationId!==run.definition.location_id}
         onClick={()=>void roll(id)}><SkillArt slug={s.slug} path={s.icon_path}/>
         <span><b>{skillName(s)}</b><small>{toDice(pool(s))}</small></span><strong>→</strong></button>;
      })}</div>
      {energy<step.energy_cost&&<p>{tr('Nincs elég energia; később folytathatod.','Not enough energy; resume later.')}</p>}
      {locationId!==run.definition.location_id&&<p>{tr('Térj vissza a kihívás helyszínére.','Return to the challenge location.')}</p>}
     </>}
     {completed&&<><h3>{run.status==='success'?tr('TELJES SIKER','FULL SUCCESS'):run.status==='partial'?tr('RÉSZLEGES SIKER','PARTIAL SUCCESS'):tr('KUDARC','FAILURE')}</h3>
      <div className="sc-reward">+{run.xp_awarded} XP {run.reward_qty>0?'+ '+run.reward_qty+' '+tr('tárgy','items'):''}</div>
      <button className="sc-primary" type="button" onClick={close}>{tr('Vissza a hídra','Back to bridge')}</button></>}
     {last&&<div className="sc-last"><strong>{last.succeeded?tr('SIKER','SUCCESS'):tr('KUDARC','FAILURE')}</strong>
      <span>{last.dice.join(' + ')}{last.pip_bonus?' + '+last.pip_bonus:''} = {last.roll_total} / TN {last.target_number}</span></div>}
    </section>
   </div>
   <footer><span>{tr('A kihívás előrehaladása mentődik.','Challenge progress is saved.')}</span>
    <button type="button" onClick={close} disabled={busy}>{tr('Bezárás / később folytatom','Close / resume later')}</button></footer>
  </section></div>}
 </>;
}
