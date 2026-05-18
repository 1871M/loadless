// src/features/home.js
import { A, CATS } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'

/* ═══ HOME / WIDGETS ═══ */
function renderHome(){
  const el=document.getElementById('p-home');
  const me=A.me,pt=A.partner,today=new Date();
  const _h=today.getHours();const greet=_h<12?'Bonjour':_h<18?'Bon après-midi':'Bonsoir';
  const dayN=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

  // Balance (shared tasks only — personal excluded)
  const shared=A.tasks.filter(t=>!t.is_personal&&!t.is_done&&t.assignee_id);
  const c1=shared.filter(t=>t.assignee_id===me?.id).length;
  const c2=shared.filter(t=>t.assignee_id===pt?.id).length;
  const tot=c1+c2;const pct1=tot===0?50:Math.round(c1/tot*100);

  const shopTodo=A.shop.filter(i=>!i.is_checked).length;
  const shopDone=A.shop.filter(i=>i.is_checked).length;
  const shopPct=A.shop.length?Math.round(shopDone/A.shop.length*100):0;
  const totalBal=A.accounts.reduce((a,ac)=>a+Number(ac.balance),0);
  const mStr=fd(today).slice(0,7);
  const mExp=A.txs.filter(t=>t.tx_date?.startsWith(mStr)&&t.type!=='income').reduce((a,t)=>a+Number(t.amount),0);
  const myT=A.tasks.filter(t=>t.assignee_id===me?.id&&!t.is_done&&!t.is_personal).length;
  const myP=A.tasks.filter(t=>t.personal_owner===me?.id&&!t.is_done).length;
  const free=A.tasks.filter(t=>!t.assignee_id&&!t.is_done&&!t.is_personal).length;
  const todayK=fd(today);
  const mB=A.meals[todayK+'-0'],mL=A.meals[todayK+'-1'],mD=A.meals[todayK+'-2'];
  const eq=calcEquity();const sugs=getSugs();

  // Update fixed header greeting
  const greetEl=document.getElementById('hdr-greet-title');
  if(greetEl)greetEl.innerHTML=`${greet}, ${esc(me?.username||'vous')} 👋`;
  const subEl=document.getElementById('hdr-greet-sub');
  if(subEl){const d=today.getDate(),m=MON[today.getMonth()];subEl.textContent=DAY[(today.getDay()+6)%7]+' '+d+' '+m;}

  const budgetPct=totalBal>0?Math.min(100,Math.round((totalBal/(totalBal+mExp))*100)):0;
  const gaugeR=52;const gaugeCirc=2*Math.PI*gaugeR;
  const gaugeDash=gaugeCirc*(budgetPct/100);
  const gaugeMsg=budgetPct>=70?'Super équipe !':budgetPct>=40?'On avance !':'À améliorer';
  const todayTasks=A.tasks.filter(t=>!t.is_done&&(t.due_date===todayK||!t.due_date)&&!t.is_personal).slice(0,4);
  const taskIcons={'🏠':'home','🛒':'cart','📞':'phone','🍽️':'food','📋':'task','👶':'baby','🐕':'pet'};
  const randomIcons=['🍳','🛒','📞','🎓','🐕','🌿','📝','🚗'];

  el.innerHTML=`<div class="dash">
    <div class="home-balance-card" onclick="showPage('budget',document.getElementById('n-bg'))">
      <div class="home-balance-label">Équilibre du jour</div>
      <div class="home-balance-body">
        <div class="home-gauge-lg">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="${gaugeR}" fill="none" stroke="var(--p1b)" stroke-width="10"/>
            <circle cx="65" cy="65" r="${gaugeR}" fill="none"
              stroke="url(#gaugeGrad)" stroke-width="10"
              stroke-dasharray="${gaugeDash.toFixed(1)} ${gaugeCirc.toFixed(1)}"
              stroke-linecap="round"
              transform="rotate(-90 65 65)"/>
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="var(--p1)"/>
                <stop offset="100%" stop-color="var(--p2)"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="home-gauge-inner">
            <div class="home-gauge-pct">${budgetPct}%</div>
            <div class="home-gauge-msg">${gaugeMsg}</div>
          </div>
        </div>
        <div class="home-balance-stats">
          <div class="home-stat"><div class="home-stat-val">${fmtE(totalBal)}</div><div class="home-stat-lb">Solde total</div></div>
          <div class="home-stat"><div class="home-stat-val" style="color:var(--p2m)">−${fmtE(mExp)}</div><div class="home-stat-lb">Dépenses mois</div></div>
          <div class="home-stat"><div class="home-stat-val" style="color:var(--p1)">${myT+myP}</div><div class="home-stat-lb">Mes tâches</div></div>
        </div>
      </div>
    </div>
    <div class="home-section-hd">
      <span class="home-section-title">À faire aujourd'hui</span>
      <button class="home-see-all" onclick="showPage('tasks',document.getElementById('n-tk'));closeMoreMenu()">Voir tout</button>
    </div>
    <div class="home-tasks-list">
      ${todayTasks.length?todayTasks.map(t=>{
        const assignee=t.assignee_id===me?.id?me:pt;
        const icon=randomIcons[Math.abs(t.title.charCodeAt(0))%randomIcons.length];
        return `<div class="home-task-row" onclick="showPage('tasks',document.getElementById('n-tk'))">
          <button class="home-task-cb" onclick="event.stopPropagation();togT('${t.id}')" aria-label="Terminer"></button>
          <div class="home-task-info">
            <div class="home-task-title">${esc(t.title)}</div>
            <div class="home-task-sub">${esc(assignee?.username||'Non assigné')}</div>
          </div>
          <div class="home-task-ic">${icon}</div>
        </div>`;
      }).join(''):'<div class="home-tasks-empty">Aucune tâche pour aujourd\'hui 🎉</div>'}
    </div>
    ${sugs.length?'<div class="home-section-hd" style="margin-top:8px"><span class="home-section-title">Suggestions</span></div><div style="display:flex;flex-direction:column;gap:8px;padding:0 16px 8px">'+sugs.slice(0,2).map(s=>'<div class="sug"><span class="sug-ic">'+s.icon+'</span><div class="sug-bd"><div class="sug-t">'+esc(s.title)+'</div><div class="sug-s">'+esc(s.sub)+'</div></div><button class="sug-btn" onclick="'+s.action+'">'+s.cta+'</button></div>').join('')+'</div>':''}
    <div class="home-section-hd"><span class="home-section-title">Raccourcis</span></div>
    <div class="widgets">
      <div class="w wp1" onclick="showPage('tasks',document.getElementById('n-tk'));closeMoreMenu()">
        <div class="w-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p1d)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
        <div class="w-lb">Tâches</div>
        <div class="w-vl">${myT}</div>
        <div class="w-sb">${free} libre${free>1?'s':''}</div>
      </div>
      <div class="w wp2" onclick="showPage('shop',document.getElementById('n-sh'));closeMoreMenu()">
        <div class="w-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p2m)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
        <div class="w-lb">Courses</div>
        <div class="w-vl">${shopTodo}</div>
        <div class="w-sb">${shopPct}% fait</div>
        <div class="w-bw"><div class="w-bf" style="width:${shopPct}%;background:linear-gradient(90deg,var(--p2),var(--p2m))"></div></div>
      </div>
      <div class="w wgo" onclick="showPage('budget',document.getElementById('n-bg'));closeMoreMenu()">
        <div class="w-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goldm)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
        <div class="w-lb">Budget</div>
        <div class="w-vl">${fmtE(totalBal)}</div>
        <div class="w-sb">−${fmtE(mExp)} ce mois</div>
      </div>
      <div class="w wp1" onclick="showPage('equity',document.getElementById('n-st'));closeMoreMenu()">
        <div class="w-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p1d)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="w-lb">Équité</div>
        <div class="w-vl">${pct1}%</div>
        <div class="w-sb">${eq&&eq.gap<=8?'Équilibré':'Déséquilibre'}</div>
      </div>
    </div>
  </div>`;
}

function getSugs(){
  const s=[];
  const free=A.tasks.filter(t=>!t.assignee_id&&!t.is_done&&!t.is_personal);
  if(free.length>=3)s.push({icon:'✋',title:free.length+' tâches sans preneur·se',sub:'Prenez-en une pour équilibrer.',cta:'Voir',action:"showPage('tasks',document.getElementById('n-tk'))"});
  const today=fd(new Date());
  if(!A.meals[today+'-2'])s.push({icon:'🍽️',title:'Dîner non planifié',sub:"Qu'est-ce qu'on mange ce soir ?",cta:'Planifier',action:"showPage('meals',document.getElementById('n-ml'));closeMoreMenu()"});
  const od=A.tasks.filter(t=>t.due_date&&t.due_date<today&&!t.is_done);
  if(od.length)s.push({icon:'⚠️',title:od.length+' tâche'+(od.length>1?'s':'')+' en retard',sub:'Des tâches dépassent leur échéance.',cta:'Voir',action:"showPage('tasks',document.getElementById('n-tk'))"});
  return s;
}

export { renderHome, getSugs }
