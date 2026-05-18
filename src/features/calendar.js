import { A, sanitizeColor } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { esc, fd, fdFR, openM, closeM, toast } from './boot.js'
import { LL } from '../lib/logger.js'

let _calColor = '#7C3AED'
let _editCalId = null
let _calMonth = new Date()


export function editCalEvent(id){
  const ev=A.calEvents.find(x=>x.id===id);if(!ev)return;
  _editCalId=id;
  document.getElementById('mo-cal-t').textContent='Modifier l\'événement';
  document.getElementById('mo-cal-sub').textContent=fdFR(ev.event_date);
  document.getElementById('cal-title').value=ev.title||'';
  document.getElementById('cal-date').value=ev.event_date||fd(new Date());
  document.getElementById('cal-time').value=ev.event_time?.slice(0,5)||'';
  document.getElementById('cal-end').value=ev.end_time?.slice(0,5)||'';
  document.getElementById('cal-note').value=ev.note||'';
  selectCalColor(ev.color||'#7C3AED',document.querySelector('[data-color="'+(ev.color||'#7C3AED')+'"]'));
  openM('mo-cal');
  setTimeout(()=>document.getElementById('cal-title').focus(),150);
}

export function selectCalColor(color,el){
  _calColor=sanitizeColor(color);
  document.querySelectorAll('.cal-color-opt').forEach(d=>{
    d.style.boxShadow=d.dataset.color===color?'0 0 0 2px white,0 0 0 4px '+color:'none';
  });
}

export function openCalModal(dateStr){
  _editCalId=null;
  document.getElementById('cal-title').value='';
  document.getElementById('cal-note').value='';
  document.getElementById('cal-time').value='';
  document.getElementById('cal-end').value='';
  document.getElementById('cal-date').value=dateStr||fd(new Date());
  document.getElementById('mo-cal-t').textContent='Nouvel événement';
  document.getElementById('mo-cal-sub').textContent=dateStr?fdFR(dateStr):'';
  selectCalColor('#7C3AED',document.querySelector('[data-color="#7C3AED"]'));
  openM('mo-cal');
  setTimeout(()=>document.getElementById('cal-title').focus(),150);
}

export async function saveCalEvent(){
  const title=document.getElementById('cal-title').value.trim();
  const date=document.getElementById('cal-date').value;
  if(!title||!date){toast('Titre et date obligatoires.','error');return;}
  // ✅ Sanitize couleur côté client (la DB a aussi une contrainte regex)
  const safeColor=sanitizeColor(_calColor);
  // sanitizeColor peut retourner 'var(--p1)' si invalide — la DB veut un hex.
  // On force un fallback hex valide dans ce cas.
  const dbColor=/^#[0-9A-Fa-f]{6}$/.test(safeColor)?safeColor:'#7C3AED';
  const payload={
    couple_id:A.couple.id,title,event_date:date,
    event_time:document.getElementById('cal-time').value||null,
    end_time:document.getElementById('cal-end').value||null,
    color:dbColor,
    note:document.getElementById('cal-note').value.trim()||null,
    created_by:A.user.id
  };
  if(_editCalId){
    // Modifier
    const{error}=await sb.from('calendar_events').update(payload).eq('id',_editCalId);
    if(error){toast('Erreur: '+error.message,'error');return;}
    closeM('mo-cal');toast('Événement modifié ! 📅','success');
    _editCalId=null;
  } else {
    // Créer
    const{error}=await sb.from('calendar_events').insert(payload);
    if(error){toast('Erreur: '+error.message,'error');return;}
    closeM('mo-cal');toast('Événement ajouté ! 📅','success');
  }
  document.getElementById('mo-cal-t').textContent='Nouvel événement';
}

export async function delCalEvent(id){
  if(!confirm('Supprimer cet événement ?'))return;
  await sb.from('calendar_events').delete().eq('id',id);
}

export function renderCalendar(){
  const el=document.getElementById('p-calendar');
  if(!el)return;
  const today=new Date();
  const year=_calMonth.getFullYear();
  const month=_calMonth.getMonth();
  const monthName=MON[month]+' '+year;

  // Premier jour du mois
  const firstDay=new Date(year,month,1);
  const lastDay=new Date(year,month+1,0);
  // Jour de la semaine du 1er (lundi=0)
  let startDow=(firstDay.getDay()+6)%7;

  // Récupérer les events du mois depuis A.calEvents
  const events=A.calEvents||[];
  const byDate={};
  events.forEach(ev=>{
    if(!byDate[ev.event_date])byDate[ev.event_date]=[];
    byDate[ev.event_date].push(ev);
  });

  // Selected date
  const selDate=A.calSelected||fd(today);

  let grid='';
  // Jours de la semaine
  ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(d=>{
    grid+='<div class="cal-dow">'+d+'</div>';
  });

  // Cellules vides avant le 1er
  for(let i=0;i<startDow;i++)grid+='<div></div>';

  // Jours du mois
  for(let d=1;d<=lastDay.getDate();d++){
    const dateStr=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday=dateStr===fd(today);
    const isSel=dateStr===selDate;
    const hasEv=(byDate[dateStr]||[]).length>0;
    grid+='<div class="cal-day'+(isToday?' today':'')+(hasEv?' has-events':'')+'" onclick="calSelectDate(\''+dateStr+'\')" style="'+(isSel&&!isToday?'border-color:var(--p1);background:var(--p1b);':'')+'">'
      +d+'</div>';
  }

  // Events du jour sélectionné
  const dayEvents=byDate[selDate]||[];
  let evHtml='';
  if(dayEvents.length){
    dayEvents.forEach(ev=>{
      const col=sanitizeColor(ev.color)||'var(--p1)';
      const calCreator=ev.created_by===A.user?.id?'Vous':(A.partner?.username||'Partenaire');
      evHtml+='<div class="cal-event-item">'
        +'<div class="cal-ev-dot" style="background:'+col+'"></div>'
        +'<div class="cal-ev-info"><div class="cal-ev-title">'+esc(ev.title)+'</div>'
        +'<div class="cal-ev-meta">'+(ev.event_time?ev.event_time.slice(0,5)+(ev.end_time?' → '+ev.end_time.slice(0,5):''):'Toute la journée')+(ev.note?' · '+esc(ev.note):'')+'</div>'
        +'<div style="font-size:10px;color:var(--faint);margin-top:2px">Ajouté·e par '+esc(calCreator)+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:4px">'
        +'<button class="cal-ev-del" onclick="editCalEvent(\''+ev.id+'\')" title="Modifier"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        +'<button class="cal-ev-del" onclick="delCalEvent(\''+ev.id+'\')" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
        +'</div>'
        +'</div>';
    });
  } else {
    evHtml='<div class="cal-empty">Aucun événement ce jour</div>';
  }

  el.innerHTML='<div class="cal-wrap">'
    +'<div class="cal-nav">'
    +'<button class="cal-btn" onclick="calNav(-1)">‹</button>'
    +'<div class="cal-title">'+monthName+'</div>'
    +'<button class="cal-btn" onclick="calNav(1)">›</button>'
    +'</div>'
    +'<div class="cal-grid">'+grid+'</div>'
    +'<div class="cal-events">'
    +'<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 13px 6px">'+fdFR(selDate)+'</div>'
    +evHtml
    +'<button class="cal-add-btn" onclick="openCalModal(\''+selDate+'\')">＋ Ajouter un événement</button>'
    +'</div>'
    +'</div>';
}

export function calSelectDate(dateStr){
  A.calSelected=dateStr;
  renderCalendar();
}

export async function calNav(dir){
  _calMonth=new Date(_calMonth.getFullYear(),_calMonth.getMonth()+dir,1);
  await loadCalEvents();
  renderCalendar();
}

export async function loadCalEvents(){
  if(!A.couple)return;
  const year=_calMonth.getFullYear();
  const month=_calMonth.getMonth();
  const from=year+'-'+String(month+1).padStart(2,'0')+'-01';
  const to=year+'-'+String(month+1).padStart(2,'0')+'-'+new Date(year,month+1,0).getDate();
  const{data,error}=await sb.from('calendar_events').select('*')
    .eq('couple_id',A.couple.id)
    .gte('event_date',from)
    .lte('event_date',to)
    .order('event_time',{ascending:true,nullsFirst:true});
  if(error){LL.log('error','rpc','load_cal_failed',{message:error.message});return;}
  // ✅ Fusion par id : on garde les events de la semaine courante en mémoire
  // même si l'utilisateur a navigué vers un autre mois (utile pour calcEquity)
  const map=new Map();
  (A.calEvents||[]).forEach(ev=>map.set(ev.id,ev));
  (data||[]).forEach(ev=>map.set(ev.id,ev));
  A.calEvents=[...map.values()].sort((a,b)=>(a.event_date||'').localeCompare(b.event_date||'')||(a.event_time||'').localeCompare(b.event_time||''));
}

