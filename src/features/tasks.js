// src/features/tasks.js
import { A, CATS, FREQ } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'

// Module-level variable (was global)
// _editTaskId tracked via A.eTid in state

/* ═══ TASKS ═══ */
function renderTasks(){
  const el=document.getElementById('p-tasks');
  const me=A.me,pt=A.partner;
  const shared=A.tasks.filter(t=>!t.is_personal);
  const perso=A.tasks.filter(t=>t.is_personal&&t.personal_owner===me?.id);
  // Balance : tâches validées (équité réelle) + tâches en cours (participation)
  const validated=shared.filter(t=>t.is_done&&t.validated_by);
  const v1=validated.filter(t=>t.validated_by===me?.id).length;
  const v2=validated.filter(t=>t.validated_by===pt?.id).length;
  const vtot=v1+v2;const p1=vtot===0?50:Math.round(v1/vtot*100);
  // Tâches en cours avec participants
  const inProgress=shared.filter(t=>!t.is_done&&(t.assignee_id||t.helper_id));
  const c1=inProgress.filter(t=>t.assignee_id===me?.id||t.helper_id===me?.id).length;
  const c2=inProgress.filter(t=>t.assignee_id===pt?.id||t.helper_id===pt?.id).length;
  const diff=Math.abs(p1-50);
  const tip=vtot===0?'Validez vos premières tâches pour voir l\'équité 🙌':diff<=8?'Répartition équilibrée ✅':'Écart de '+diff+'% — à rééquilibrer';
  const all=shared.length,todo=shared.filter(t=>!t.is_done).length,done=shared.filter(t=>t.is_done).length;
  const mine=inProgress.filter(t=>t.assignee_id===me?.id||t.helper_id===me?.id).length;
  const free=shared.filter(t=>!t.is_done&&!t.assignee_id&&!t.helper_id).length;

  el.innerHTML=`
    <div class="bal-wrap"><div class="bal-card">
      <div class="bal-top"><span class="bal-tl">Équité partagée</span><span class="bal-sc">${p1} / ${100-p1}</span></div>
      <div class="bal-ps">
        <div class="bal-p"><div class="bal-pn" style="color:${sanitizeColor(me?.avatar_color)}">${esc(me?.username||'Moi')}</div><div class="bal-pp" style="color:${sanitizeColor(me?.avatar_color)}">${p1}%</div><div class="bal-pc">${c1} tâche${c1>1?'s':''}</div></div>
        <div class="bal-bw" style="flex:1;margin:12px 12px 0"><div class="bal-bf" style="width:${p1}%;background:linear-gradient(90deg,${sanitizeColor(me?.avatar_color)},${sanitizeColor(pt?.avatar_color)})"></div></div>
        <div class="bal-p" style="text-align:right"><div class="bal-pn" style="color:${sanitizeColor(pt?.avatar_color)}">${esc(pt?.username||'Partenaire')}</div><div class="bal-pp" style="color:${sanitizeColor(pt?.avatar_color)}">${100-p1}%</div><div class="bal-pc">${c2} tâche${c2>1?'s':''}</div></div>
      </div>
      <div class="bal-bw"><div class="bal-bf" style="width:${p1}%;background:linear-gradient(90deg,${sanitizeColor(me?.avatar_color)},${sanitizeColor(pt?.avatar_color)})"></div></div>
      <div class="bal-tp">${tip}</div>
    </div></div>
    <div class="tabs-row">
      <button class="tab ${A.filt==='todo'?'active':''}" onclick="setF('todo',this)">À faire <span class="tab-n">${todo}</span></button>
      <button class="tab ${A.filt==='mine'?'active':''}" onclick="setF('mine',this)">Miennes <span class="tab-n">${mine}</span></button>
      <button class="tab ${A.filt==='done'?'active':''}" onclick="setF('done',this)">Terminées <span class="tab-n">${done}</span></button>
      <button class="tab ${A.filt==='free'?'active':''}" onclick="setF('free',this)">Libres <span class="tab-n">${free}</span></button>
      <button class="tab ${A.filt==='all'?'active':''}" onclick="setF('all',this)">Toutes <span class="tab-n">${all}</span></button>
      <button class="tab ${A.filt==='perso'?'active':''}" onclick="setF('perso',this)">🔒 Perso <span class="tab-n">${perso.length}</span></button>
    </div>
    <div class="tl-wrap" id="tl-wrap"></div>`;
  renderTL();
}

function renderTL(){
  const wrap=document.getElementById('tl-wrap');if(!wrap)return;
  const me=A.me,pt=A.partner;
  let tasks;
  if(A.filt==='perso'){
    tasks=A.tasks.filter(t=>t.is_personal&&t.personal_owner===me?.id);
  } else if(A.filt==='all'){
    // ✅ Toutes = tâches partagées + tâches perso de l'utilisateur
    tasks=A.tasks.filter(t=>!t.is_personal||(t.is_personal&&t.personal_owner===me?.id));
  } else {
    tasks=A.tasks.filter(t=>!t.is_personal);
    if(A.filt==='todo')tasks=tasks.filter(t=>!t.is_done);
    else if(A.filt==='done')tasks=tasks.filter(t=>t.is_done);
    else if(A.filt==='mine')tasks=tasks.filter(t=>t.assignee_id===me?.id);
    else if(A.filt==='free')tasks=tasks.filter(t=>!t.assignee_id&&!t.is_done);
  }
  if(!tasks.length){wrap.innerHTML='<div class="empty"><div class="ei">✨</div><p>Aucune tâche ici.<br>Appuyez sur <strong>+ Ajouter</strong>.</p></div>';return;}
  const grps={};tasks.forEach(t=>{if(!grps[t.category])grps[t.category]=[];grps[t.category].push(t);});
  wrap.innerHTML='';
  Object.entries(grps).forEach(([cat,list])=>{
    const c=CATS[cat]||CATS.autre;
    const g=document.createElement('div');g.className='cat-g';
    g.innerHTML='<div class="cat-hd"><div class="cat-ic" style="background:'+c.bg+';border:1.5px solid '+c.bd+'">'+c.i+'</div><span class="cat-lb">'+c.l+'</span><button class="cat-ab" onclick="openTaskModal(\''+cat+'\')">+ Ajouter</button></div>';
    list.forEach(t=>g.appendChild(buildTC(t)));
    wrap.appendChild(g);
  });
}

function buildTC(t){
  const div=document.createElement('div');
  div.className='tc'+(t.is_done?' done':'')+(t.is_personal?' perso':'');
  const me=A.me,pt=A.partner;
  const pr={low:['#D1FAE5','#059669'],med:['#FFF7ED','#C2410C'],hgh:['#FEF2F2','#DC2626']};
  const[pb,pc]=pr[t.priority]||pr.low;
  const pl={low:'Faible',med:'Moyenne',hgh:'Urgente'}[t.priority]||'';
  let dueH='';
  if(t.due_date){const today=fd(new Date());const late=t.due_date<today&&!t.is_done;const d=new Date(t.due_date+'T12:00:00');dueH='<span class="tc-du'+(late?' late':'')+'">📅'+d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+'</span>';}
  // ── Participants : assignee_id + helper_id = les deux personnes sur la tâche
  const meId=me?.id, ptId=pt?.id;
  const parts=[t.assignee_id,t.helper_id].filter(Boolean);
  const meOn=parts.includes(meId);

  function avChip(uid){
    const isMe=uid===meId;
    const u=isMe?me:pt;
    const col=sanitizeColor(u?.avatar_color);
    const init=(u?.username||'?')[0].toUpperCase();
    const removeFn=uid===t.assignee_id?'release':'leaveTask';
    const clickable=isMe&&!t.is_done;
    const content=u?.avatar_url
      ?'<img src="'+u.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      :init;
    return '<div onclick="'+(clickable?removeFn+'(\''+t.id+'\')':'')+'" title="'+(clickable?'Me retirer':esc(u?.username||''))+'" style="width:28px;height:28px;border-radius:50%;background:'+col+'22;color:'+col+';font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid '+col+';overflow:hidden;flex-shrink:0;'+(clickable?'cursor:pointer;box-shadow:0 2px 6px '+col+'44':'')+'>'+content+'</div>';
  }

  let pChips=parts.map(uid=>avChip(uid)).join('');

  let joinBtn='';
  if(!t.is_personal&&!t.is_done&&!meOn){
    const fn=!t.assignee_id?'claim':'joinTask';
    joinBtn='<button class="tk-btn free" onclick="'+fn+'(\''+t.id+'\')" style="font-size:10px;margin-top:4px">+ Me positionner</button>';
  }

  // Avatars row above edit/delete buttons
  const rightH='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">'
    +(pChips?'<div style="display:flex;gap:3px">'+pChips+'</div>':'')
    +'<div class="tc-ax">'
      +'<button class="tc-a" onclick="editTask(\''+t.id+'\')" aria-label="Modifier" title="Modifier"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      +'<button class="tc-a" onclick="delT(\''+t.id+'\')" aria-label="Supprimer" title="Supprimer"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
    +'</div>'
    +joinBtn
    +'</div>';

  div.innerHTML='<div class="tc-ck'+(t.is_done?' chk':'')+'" onclick="togT(\''+t.id+'\')" role="button" aria-label="'+(t.is_done?'Marquer non terminée':'Marquer terminée')+'">'+(t.is_done?'✓':'')+'</div>'
    +'<div class="tc-bd"><div class="tc-tt">'+esc(t.title)+'</div>'
    +'<div class="tc-mt"><span class="tc-tg" style="background:'+pb+';color:'+pc+'">'+pl+'</span>'
    +(t.duration_minutes?'<span class="tc-fr">⏱'+t.duration_minutes+'min</span>':'')
    +'<span class="tc-fr">'+(FREQ[t.frequency]||'')+'</span>'
    +(t.is_personal?'<span class="tc-pb">🔒 Personnel</span>':'')
    +dueH+'</div>'
    +(t.note?'<div style="font-size:10px;color:var(--muted);margin-top:4px">'+esc(t.note)+'</div>':'')
    +(t.is_done&&t.validated_by?'<div style="font-size:10px;color:var(--green);margin-top:3px">✓ Validé·e par '+(t.validated_by===meId?'vous':esc(pt?.username||'partenaire'))+'</div>':'')
    +'</div><div class="tc-rt">'+rightH+'</div>';
  return div;
}

function setF(f,btn){
  A.filt=f;
  // ✅ Lazy render — si la page est déjà construite, ne re-rendre que la liste
  if(document.getElementById('tl-wrap')){
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    if(btn)btn.classList.add('active');
    renderTL();
    // Mettre à jour les compteurs des onglets sans reconstruire toute la page
    const shared=A.tasks.filter(t=>!t.is_personal);
    const me=A.me;
    const counts={
      all:shared.length,
      todo:shared.filter(t=>!t.is_done).length,
      done:shared.filter(t=>t.is_done).length,
      mine:shared.filter(t=>t.assignee_id===me?.id).length,
      free:shared.filter(t=>!t.assignee_id&&!t.is_done).length,
      perso:A.tasks.filter(t=>t.is_personal&&t.personal_owner===me?.id).length
    };
    ['all','todo','done','mine','free','perso'].forEach(k=>{
      const spans=document.querySelectorAll('.tab-n');
      const tabs=document.querySelectorAll('.tab');
      // Matcher par position plutôt que texte (plus robuste)
      const idx=['all','todo','done','mine','free','perso'].indexOf(k);
      if(spans[idx])spans[idx].textContent=counts[k];
    });
  } else {
    renderTasks();
  }
}
function _patchTask(id,patch){
  const t=A.tasks.find(x=>x.id===id);
  if(t)Object.assign(t,patch);
  if(isP('tasks'))renderTasks();
  if(isP('home'))renderHome();
}
async function claim(id){
  const{error}=await sb.from('tasks').update({assignee_id:A.user.id}).eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  _patchTask(id,{assignee_id:A.user.id});
}
async function release(id){
  const{error}=await sb.from('tasks').update({assignee_id:null}).eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  _patchTask(id,{assignee_id:null});
}
async function delT(id){
  if(!confirm('Supprimer ?'))return;
  const{error}=await sb.from('tasks').delete().eq('id',id);
  if(!error){A.tasks=A.tasks.filter(x=>x.id!==id);if(isP('tasks'))renderTasks();if(isP('home'))renderHome();}
}

function openTaskModal(cat){
  A.eTid=null;A.prio='low';
  document.getElementById('mt-t').textContent='Nouvelle tâche';
  ['ft-ti','ft-no'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('ft-du').value='';
  document.getElementById('ft-ca').value=cat||'menage';
  document.getElementById('ft-fr').value='once';
  document.getElementById('ft-de').value='';
  document.getElementById('ft-ps').checked=false;
  document.getElementById('ft-pn').style.display='none';
  updPU();openM('mo-tk');setTimeout(()=>document.getElementById('ft-ti').focus(),120);
}
function editTask(id){
  const t=A.tasks.find(x=>x.id===id);if(!t)return;
  A.eTid=id;A.prio=t.priority||'low';
  document.getElementById('mt-t').textContent='Modifier la tâche';
  document.getElementById('ft-ti').value=t.title||'';
  document.getElementById('ft-ca').value=t.category||'menage';
  document.getElementById('ft-fr').value=t.frequency||'once';
  document.getElementById('ft-de').value=t.due_date||'';
  document.getElementById('ft-no').value=t.note||'';
  document.getElementById('ft-du').value=t.duration_minutes||'';
  document.getElementById('ft-ps').checked=t.is_personal||false;
  document.getElementById('ft-pn').style.display=t.is_personal?'block':'none';
  updPU();openM('mo-tk');
}
async function saveTask(){
  const title=document.getElementById('ft-ti').value.trim();if(!title)return;
  const isPers=document.getElementById('ft-ps').checked;
  const payload={title,category:document.getElementById('ft-ca').value,priority:A.prio,frequency:document.getElementById('ft-fr').value,due_date:document.getElementById('ft-de').value||null,note:document.getElementById('ft-no').value.trim(),duration_minutes:parseInt(document.getElementById('ft-du').value)||null,is_personal:isPers,personal_owner:isPers?A.user.id:null,couple_id:A.couple.id,created_by:A.user.id};
  if(A.eTid){
    const{error}=await sb.from('tasks').update(payload).eq('id',A.eTid);
    if(error){toast('Erreur: '+error.message,'error');return;}
    const i=A.tasks.findIndex(x=>x.id===A.eTid);
    if(i!==-1)A.tasks[i]={...A.tasks[i],...payload};
  } else {
    const{data,error}=await sb.from('tasks').insert(payload).select().single();
    if(error){toast('Erreur: '+error.message,'error');return;}
    if(data&&!A.tasks.find(x=>x.id===data.id))A.tasks.push(data);
  }
  closeM('mo-tk');toast('Tâche enregistrée !','success');
  renderTasks();if(isP('home'))renderHome();
}
function onPsTg(){document.getElementById('ft-pn').style.display=document.getElementById('ft-ps').checked?'block':'none';}
function setPrio(p){A.prio=p;updPU();}
function updPU(){document.querySelectorAll('.pr-op').forEach(o=>o.classList.toggle('sel',o.classList.contains(A.prio)));}

async function joinTask(id){
  const{error}=await sb.from('tasks').update({helper_id:A.user.id}).eq('id',id);
  if(error){toast('Erreur','error');return;}
  _patchTask(id,{helper_id:A.user.id});
  toast('Tu aides sur cette tâche ! 🤝','success');
}
async function leaveTask(id){
  const{error}=await sb.from('tasks').update({helper_id:null}).eq('id',id);
  if(error){toast('Erreur','error');return;}
  _patchTask(id,{helper_id:null});
}
async function claimTogether(id){
  if(!A.partner){toast('Invitez d\'abord votre partenaire.','error');return;}
  const{error}=await sb.from('tasks').update({assignee_id:A.user.id,helper_id:A.partner.id}).eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  _patchTask(id,{assignee_id:A.user.id,helper_id:A.partner.id});
  toast('Vous vous en chargez ensemble 🤝','success');
}
async function inviteHelper(id){
  if(!A.partner){toast('Pas de partenaire lié.','error');return;}
  const{error}=await sb.from('tasks').update({helper_id:A.partner.id}).eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  _patchTask(id,{helper_id:A.partner.id});
  toast(esc(A.partner.username||'Partenaire')+' ajouté comme aide 🤝','success');
}

async function togT(id){
  const t=A.tasks.find(x=>x.id===id);
  if(!t)return;
  const isDone=!t.is_done;
  const{error}=await sb.from('tasks').update({is_done:isDone}).eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  // Mise à jour locale immédiate — sans attendre le realtime
  t.is_done=isDone;
  if(isDone){t.validated_by=A.user?.id;t.validated_at=new Date().toISOString();}
  else{t.validated_by=null;t.validated_at=null;}
  if(isP('tasks'))renderTasks();
  if(isP('home'))renderHome();
  // Tracking optionnel en fire-and-forget
  const tr=isDone?{validated_by:A.user?.id,validated_at:new Date().toISOString()}:{validated_by:null,validated_at:null};
  sb.from('tasks').update(tr).eq('id',id).catch(()=>{});
}


export { renderTasks, renderTL, buildTC, setF, _patchTask, claim, release, delT, openTaskModal, editTask, saveTask, onPsTg, setPrio, updPU, joinTask, leaveTask, claimTogether, inviteHelper, togT }
