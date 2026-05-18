import { A, sanitizeColor } from '../lib/state.js'
import { toast, esc, fdFR, fd, getMon } from './boot.js'

const DEFAULT_AVAIL_HOURS = 96


export function calcEquity(){
  const me=A.me,pt=A.partner;if(!me||!pt)return null;
  // Seules les tâches validées comptent — c'est la validation qui crédite l'équité
  const shared=A.tasks.filter(t=>!t.is_personal);
  const avMe=A.avail[me.id]||DEFAULT_AVAIL_HOURS,avPt=A.avail[pt.id]||DEFAULT_AVAIL_HOURS;
  const totAv=avMe+avPt;
  const exp1=Math.round(avMe/totAv*100),exp2=100-exp1;

  // Durée créditée = uniquement les tâches marquées faites, attribuées à celui qui valide
  const durTMe=shared.filter(t=>t.is_done&&t.validated_by===me.id)
    .reduce((a,t)=>a+(t.duration_minutes||30),0);
  const durTPt=shared.filter(t=>t.is_done&&t.validated_by===pt.id)
    .reduce((a,t)=>a+(t.duration_minutes||30),0);

  // ✅ Heures agenda (événements de la semaine en cours)
  const weekStart=getMon(new Date(),0);const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  const wkS=fd(weekStart),wkE=fd(weekEnd);
  function calHours(userId){
    return(A.calEvents||[]).filter(ev=>ev.created_by===userId&&ev.event_date>=wkS&&ev.event_date<=wkE&&ev.event_time&&ev.end_time).reduce((acc,ev)=>{
      const[sh,sm]=ev.event_time.split(':').map(Number);
      const[eh,em]=ev.end_time.split(':').map(Number);
      const hrs=(eh*60+em-sh*60-sm)/60;
      return acc+(hrs>0?hrs:0);
    },0);
  }
  const agMe=calHours(me.id),agPt=calHours(pt.id);

  // Disponibilité réelle = heures dispo - heures agenda (occupation)
  const realAvMe=Math.max(avMe-agMe,0);
  const realAvPt=Math.max(avPt-agPt,0);
  const realTotAv=realAvMe+realAvPt;
  const adjExp1=realTotAv>0?Math.round(realAvMe/realTotAv*100):50;
  const adjExp2=100-adjExp1;

  const totD=durTMe+durTPt;
  const real1=totD?Math.round(durTMe/totD*100):50,real2=100-real1;
  const gap=Math.abs(real1-adjExp1);
  const tip=gap<=8?'✅ Répartition équilibrée !'
    :real1>adjExp1?esc(me?.username||'Vous')+' fait plus que sa part — bravo ! 💪'
    :esc(pt?.username||'Partenaire')+' fait plus que sa part — bravo ! 💪';

  // ✅ Snapshot historique journalier (localStorage)
  try{
    const today=fd(new Date());
    const histKey='ll-eq-hist-'+(A.couple?.id||'x');
    const hist=JSON.parse(localStorage.getItem(histKey)||'{}');
    hist[today]={
      d:today,me:me.id,pt:pt.id,
      exp1:adjExp1,real1,gap,
      durMe:durTMe,durPt:durTPt,
      agMe:Math.round(agMe*10)/10,agPt:Math.round(agPt*10)/10,
      ts:Date.now()
    };
    // Garder seulement 60 jours d'historique
    const dates=Object.keys(hist).sort();
    if(dates.length>60){
      const toDelete=dates.slice(0,dates.length-60);
      toDelete.forEach(d=>delete hist[d]);
    }
    localStorage.setItem(histKey,JSON.stringify(hist));
  }catch(e){/* localStorage indispo, pas grave */}

  return{exp1:adjExp1,exp2:adjExp2,real1,real2,gap,tip,
    agMe:Math.round(agMe*10)/10,agPt:Math.round(agPt*10)/10,
    durMe:durTMe,durPt:durTPt,
    avMe,avPt,realAvMe:Math.round(realAvMe*10)/10,realAvPt:Math.round(realAvPt*10)/10};
}
export function renderEquity(targetId){
  const el=document.getElementById(targetId||'p-equity');
  const me=A.me,pt=A.partner;if(!me){el.innerHTML='<div class="empty"><div class="ei">⚖️</div><p>Chargement…</p></div>';return;}
  const eq=calcEquity();
  const avMe=A.avail[me.id]||DEFAULT_AVAIL_HOURS,avPt=A.avail[pt?.id]||DEFAULT_AVAIL_HOURS;

  // Bloc info hebdo : agenda + dispo réelle
  const agInfo=eq?'<div style="font-size:11px;color:var(--muted);background:var(--bg);border-radius:11px;padding:10px 13px;margin-bottom:12px;line-height:1.6">'
    +'📅 <strong>Cette semaine</strong> · '
    +esc(me.username)+' : <strong>'+eq.agMe+'h</strong> d\'agenda → <strong>'+eq.realAvMe+'h</strong> dispo'
    +(pt?'<br>'+esc(pt.username)+' : <strong>'+eq.agPt+'h</strong> d\'agenda → <strong>'+eq.realAvPt+'h</strong> dispo':'')
    +'<br><small>Les événements de l\'agenda (heure de début/fin) réduisent automatiquement la disponibilité pour les tâches partagées.</small></div>':'';

  el.innerHTML='<div class="eq-wr">'
    +'<div class="eq-cd"><div class="eq-ct">Disponibilité hebdomadaire</div>'
    +agInfo
    +'<p style="font-size:12px;color:var(--muted);margin-bottom:12px">Indiquez votre temps disponible chaque semaine pour les tâches du foyer (hors travail, agenda, sommeil). Référence : 96h = semaine complète éveillée.</p>'
    +'<div class="eq-ag">'
      +'<div class="eq-ab"><div class="eq-an" style="color:'+sanitizeColor(me.avatar_color)+'">'+esc(me.username)+'</div><input class="eq-ai" type="number" id="av-me" min="1" max="120" value="'+avMe+'" aria-label="Heures disponibles par semaine pour '+esc(me.username)+'"><div class="eq-al">heures / semaine</div></div>'
      +(pt?'<div class="eq-ab"><div class="eq-an" style="color:'+sanitizeColor(pt.avatar_color)+'">'+esc(pt.username)+'</div><input class="eq-ai" type="number" id="av-pt" min="1" max="120" value="'+avPt+'" aria-label="Heures disponibles par semaine pour '+esc(pt.username)+'"><div class="eq-al">heures / semaine</div></div>':'<div class="eq-ab" style="opacity:.4"><div class="eq-an">Partenaire</div><div style="font-size:12px;color:var(--muted)">En attente</div></div>')
    +'</div><button class="btn-rc" onclick="saveAvail()">Recalculer l\'équité</button></div>'
    +(eq?'<div class="eq-cd"><div class="eq-ct">Répartition attendue vs réelle</div>'
      +'<p style="font-size:12px;color:var(--muted);margin-bottom:14px">Basé sur la disponibilité réelle (dispo − agenda) et la durée des tâches.</p>'
      +buildEqPerson(me,eq.exp1,eq.real1,eq.gap)
      +(pt?buildEqPerson(pt,eq.exp2,eq.real2,eq.gap):'')
      +'<div style="background:var(--bg);border-radius:11px;padding:12px 14px;font-size:12px;color:var(--muted);margin-top:8px;line-height:1.6">'+eq.tip+'</div>'
      +'<details style="margin-top:12px"><summary style="font-size:12px;color:var(--muted);cursor:pointer;font-weight:700">📐 Détail du calcul</summary>'
        +'<div style="font-size:11px;color:var(--muted);background:var(--bg);border-radius:9px;padding:10px;margin-top:8px;line-height:1.7">'
          +'<strong>'+esc(me.username)+'</strong> : '+avMe+'h dispo − '+eq.agMe+'h agenda = <strong>'+eq.realAvMe+'h</strong> · '+Math.round(eq.durMe/60*10)/10+'h de tâches faites<br>'
          +(pt?'<strong>'+esc(pt.username)+'</strong> : '+avPt+'h dispo − '+eq.agPt+'h agenda = <strong>'+eq.realAvPt+'h</strong> · '+Math.round(eq.durPt/60*10)/10+'h de tâches faites':'')
        +'</div>'
      +'</details>'
      +'<button onclick="showEquityHistory()" style="margin-top:12px;width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:11px;padding:11px 14px;font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">📊 Voir l\'historique d\'équité</button>'
      +'</div>'
    :'<div class="empty"><div class="ei">📊</div><p>Ajoutez des tâches partagées avec une durée estimée pour calculer l\'équité.</p></div>')
    +'</div>';
}
export function buildEqPerson(p,exp,real,gap){
  const col=sanitizeColor(p.avatar_color);
  return'<div class="eq-pr"><div class="eq-av" style="background:'+col+'22;color:'+col+'">'+p.username[0].toUpperCase()+'</div>'
    +'<div class="eq-pi"><div class="eq-pn" style="color:'+col+'">'+esc(p.username)+'</div>'
    +'<div class="eq-brs"><div class="eq-br"><span class="eq-bl">Attendu</span><div class="eq-bt"><div class="eq-bf" style="width:'+exp+'%;background:'+col+'66"></div></div><span class="eq-bp">'+exp+'%</span></div>'
    +'<div class="eq-br"><span class="eq-bl">Réel</span><div class="eq-bt"><div class="eq-bf" style="width:'+real+'%;background:'+col+'"></div></div><span class="eq-bp">'+real+'%</span></div></div>'
    +'<div class="'+(gap<=8?'eq-gok':'eq-gof')+'">'+(gap<=8?'✅ Dans la cible':Math.abs(real-exp)+'% d\'écart')+'</div></div></div>';
}
export function saveAvail(){
  const me=A.me,pt=A.partner;
  if(me){const v=parseInt(document.getElementById('av-me')?.value,10)||DEFAULT_AVAIL_HOURS;A.avail[me.id]=v;}
  if(pt){const v=parseInt(document.getElementById('av-pt')?.value,10)||DEFAULT_AVAIL_HOURS;A.avail[pt.id]=v;}
  localStorage.setItem('ll-av',JSON.stringify(A.avail));
  toast('Équité recalculée !','success');renderEquity();
}

export function showEquityHistory(){
  const me=A.me,pt=A.partner;
  if(!me)return;
  const histKey='ll-eq-hist-'+(A.couple?.id||'x');
  let hist={};
  try{hist=JSON.parse(localStorage.getItem(histKey)||'{}');}catch{}
  const dates=Object.keys(hist).sort().slice(-30); // 30 derniers jours
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Historique d\'équité');

  let body='';
  if(!dates.length){
    body='<div style="text-align:center;padding:30px 20px;color:var(--muted)">'
      +'<div style="font-size:42px;margin-bottom:10px">📊</div>'
      +'<p style="font-size:14px;line-height:1.6">Pas encore d\'historique disponible.<br><small>L\'historique se construit automatiquement au fil des jours, à mesure que vous utilisez l\'app.</small></p>'
      +'</div>';
  } else {
    // Sparkline visuel : barres pour real1 (% de moi)
    const meCol=sanitizeColor(me.avatar_color);
    const ptCol=sanitizeColor(pt?.avatar_color)||'#999';
    const days=dates.map(d=>hist[d]);
    const maxBar=60;
    let bars='<div style="display:flex;align-items:flex-end;gap:2px;height:'+maxBar+'px;margin:14px 0;padding:8px;background:var(--bg);border-radius:11px;overflow-x:auto">';
    days.forEach(d=>{
      const h1=Math.max(2,(d.real1||50)*maxBar/100);
      const h2=maxBar-h1;
      bars+='<div title="'+d.d+' · '+d.real1+'% / '+(100-d.real1)+'%" style="flex:1;min-width:8px;display:flex;flex-direction:column;justify-content:flex-end;height:'+maxBar+'px">'
        +'<div style="height:'+h2+'px;background:'+ptCol+';border-radius:2px 2px 0 0"></div>'
        +'<div style="height:'+h1+'px;background:'+meCol+';border-radius:0 0 2px 2px"></div>'
        +'</div>';
    });
    bars+='</div>';

    // Stats moyennes
    const avgReal1=Math.round(days.reduce((a,d)=>a+(d.real1||50),0)/days.length);
    const avgGap=Math.round(days.reduce((a,d)=>a+(d.gap||0),0)/days.length);

    body='<div style="background:var(--bg);border-radius:14px;padding:14px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:8px">'
        +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">'+esc(me.username)+'</div><div style="font-family:Lora,serif;font-size:22px;font-weight:700;color:'+meCol+'">'+avgReal1+'%</div></div>'
        +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">Écart moyen</div><div style="font-family:Lora,serif;font-size:22px;font-weight:700;color:'+(avgGap<=8?'var(--green)':'var(--orange)')+'">'+avgGap+'%</div></div>'
        +'<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">'+esc(pt?.username||'Partenaire')+'</div><div style="font-family:Lora,serif;font-size:22px;font-weight:700;color:'+ptCol+'">'+(100-avgReal1)+'%</div></div>'
      +'</div>'
      +'<div style="font-size:10px;color:var(--muted);text-align:center">Moyenne sur '+days.length+' jour'+(days.length>1?'s':'')+'</div>'
    +'</div>'
    +'<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Évolution quotidienne</div>'
    +bars
    +'<div style="display:flex;gap:14px;font-size:11px;color:var(--muted);margin-bottom:14px">'
      +'<span><span style="display:inline-block;width:10px;height:10px;background:'+meCol+';border-radius:2px;vertical-align:middle;margin-right:4px"></span>'+esc(me.username)+'</span>'
      +(pt?'<span><span style="display:inline-block;width:10px;height:10px;background:'+ptCol+';border-radius:2px;vertical-align:middle;margin-right:4px"></span>'+esc(pt.username)+'</span>':'')
    +'</div>'
    // Liste détaillée des 7 derniers jours
    +'<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Détail des 7 derniers jours</div>';
    days.slice(-7).reverse().forEach(d=>{
      const tip=d.gap<=8?'✅':'⚠️';
      body+='<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">'
        +'<div><strong>'+fdFR(d.d)+'</strong><div style="font-size:10px;color:var(--muted)">'+Math.round((d.durMe||0)/60*10)/10+'h / '+Math.round((d.durPt||0)/60*10)/10+'h</div></div>'
        +'<div style="text-align:right"><strong>'+d.real1+'% / '+(100-d.real1)+'%</strong> '+tip+'<div style="font-size:10px;color:var(--muted)">écart '+d.gap+'%</div></div>'
        +'</div>';
    });
  }

  overlay.innerHTML='<div style="background:var(--surface);border-radius:24px;padding:22px 18px;max-width:480px;width:100%;box-shadow:var(--sh-lg);max-height:90vh;overflow-y:auto">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">'
      +'<div style="width:36px;height:36px;background:var(--p1b);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px" aria-hidden="true">📊</div>'
      +'<div>'
        +'<div style="font-family:Georgia,serif;font-size:17px;font-weight:700">Historique d\'équité</div>'
        +'<div style="font-size:11px;color:var(--muted)">Évolution de la répartition des tâches</div>'
      +'</div>'
    +'</div>'
    +body
    +'<button onclick="this.closest(\'[role=dialog]\').remove()" style="margin-top:14px;width:100%;background:var(--ink);border:none;color:#fff;font-family:Outfit,sans-serif;font-size:13px;font-weight:700;padding:12px;border-radius:12px;cursor:pointer">Fermer</button>'
    +'</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}


