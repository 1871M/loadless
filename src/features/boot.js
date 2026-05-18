// src/features/boot.js
import { A, sanitizeColor } from '../lib/state.js'
import { sb, OSID } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'
import { E2E, b64e } from '../lib/crypto.js'
import { t, applyLang } from '../lib/i18n.js'

/* ═══ TOAST ═══ */
function toast(msg,type='info',dur=3000){
  const w=document.getElementById('toast-wrap');
  const t=document.createElement('div');t.className='toast '+type;
  const ic=document.createElement('span');ic.textContent=(type==='success'?'✓':type==='error'?'✕':'ℹ');
  const tx=document.createElement('span');tx.textContent=msg;
  t.appendChild(ic);t.appendChild(tx);
  w.appendChild(t);
  if(dur>0){setTimeout(()=>t.style.opacity='0',Math.max(0,dur-300));setTimeout(()=>t.remove(),dur);}
  else{t.style.cursor='pointer';t.title='Appuyez pour fermer';t.onclick=()=>t.remove();}
}

/* ═══ HELPERS ═══ */
function updatePill(){
  const me=A.me;if(!me)return;
  const pill=document.getElementById('upill'),av=document.getElementById('pav'),nm=document.getElementById('pnm');
  // ✅ sanitizeColor empêche toute injection CSS via avatar_color
  const col=sanitizeColor(me.avatar_color);
  pill.style.background=col+'22';pill.style.borderColor=col+'55';
  av.textContent=me.username[0].toUpperCase();av.style.background=col+'33';av.style.color=col;
  nm.textContent=me.username;nm.style.color=col;
}
function trapFocus(el){
  const sel='button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const nodes=()=>[...el.querySelectorAll(sel)];
  el._trapH=e=>{
    const focusable=nodes();if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.key==='Tab'){
      if(e.shiftKey){if(document.activeElement===first){e.preventDefault();last.focus();}}
      else{if(document.activeElement===last){e.preventDefault();first.focus();}}
    }
    if(e.key==='Escape'){closeM(el.id);}
  };
  el.addEventListener('keydown',el._trapH);
  const focusable=nodes();if(focusable.length)focusable[0].focus();
}
function openM(id){
  const el=document.getElementById(id);
  el.classList.add('open');
  el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  el._prevFocus=document.activeElement;
  trapFocus(el);
}
function closeM(id){
  const el=document.getElementById(id);
  el.classList.remove('open');
  if(el._trapH){el.removeEventListener('keydown',el._trapH);el._trapH=null;}
  if(el._prevFocus){el._prevFocus.focus();el._prevFocus=null;}
}
function cMO(e,id){if(e.target===document.getElementById(id))closeM(id);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fdFR(s){try{const d=new Date(s+'T12:00:00');return d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'});}catch{return s||'';}}
function fmtE(n){return(Math.round((n||0)*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function getMon(date,off=0){const d=new Date(date);const day=d.getDay();const diff=d.getDate()-day+(day===0?-6:1);d.setDate(diff+off*7);d.setHours(0,0,0,0);return d;}
function showSc(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');}
function hideL(){const l=document.getElementById('loader');if(l)l.style.display='none';}
async function copyCode(code){try{await navigator.clipboard.writeText(code);toast('Code copié !','success');}catch{toast(code,'info',5000);}}
function loadStep(s){const el=document.getElementById('loader-step');if(el)el.textContent=s;}

/* ═══ PAGE ROUTING ═══ */
function isP(n){return document.getElementById('p-'+n)?.classList.contains('active');}
function _skCards(n){return Array.from({length:n},()=>'<div class="sk-card skeleton"></div>').join('')+'<div class="sk-line skeleton"></div><div class="sk-line-sm skeleton"></div>';}
function initSkeletons(){
  const pages={home:'p-home',tasks:'p-tasks',shop:'p-shop',budget:'p-budget',chat:'p-chat'};
  for(const id of Object.values(pages)){
    const el=document.getElementById(id);
    if(el&&!el.children.length){el.innerHTML='<div class="sk-wrap">'+_skCards(3)+'</div>';}
  }
}
function showPage(name,btn,_noPush){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-it').forEach(b=>b.classList.remove('active'));
  document.getElementById('p-'+name)?.classList.add('active');
  // Drawer active state
  const ndMap={home:'nd-ho',calendar:'nd-cal',chat:'nd-ch',tasks:'nd-tk',budget:'nd-bg',shop:'nd-sh',meals:'nd-ml',settings:'nd-st'};
  document.querySelectorAll('.nd-it').forEach(b=>b.classList.remove('active'));
  if(ndMap[name])document.getElementById(ndMap[name])?.classList.add('active');
  // Bottom nav: all pages have direct tab
  const navId={home:'n-ho',calendar:'n-cal',chat:'n-ch',tasks:'n-tk',budget:'n-bg',shop:'n-sh',meals:'n-ml',settings:'n-st'}[name];
  const activeTab=navId?document.getElementById(navId):null;
  if(activeTab){
    activeTab.classList.add('active');
    // No auto-scroll — tabs stay at fixed position, only style changes
  }
  closeDrawer();
  const map={home:renderHome,tasks:renderTasks,shop:renderShop,budget:renderBudget,meals:renderMeals,calendar:async()=>{await loadCalEvents();renderCalendar();},equity:renderEquity,settings:renderSettings};
  if(name==='chat'){A.unread=0;updBadge();renderMsgs();}
  else if(map[name]){try{map[name]();}catch(e){LL.log('error','render',name+'_failed',{msg:e.message});}}
  const fab=document.getElementById('fab-btn');
  if(fab)fab.style.display=(name==='home'||name==='chat'||name==='settings')?'none':'flex';
  document.getElementById('p-'+name)?.scrollTo({top:0});
  if(!_noPush&&history.state?.page!==name){
    history.pushState({page:name},'','?page='+name);
  }
}
window.addEventListener('popstate',e=>{
  const pg=e.state?.page||'home';
  if(A.user&&A.couple)showPage(pg,null,true);
});
function quickAdd(){
  const a=document.querySelector('.page.active')?.id;
  if(a==='p-shop'){
    // ✅ Ouvrir modal ajout article
    openShopModal();
  }
  else if(a==='p-budget')openTx('expense');
  else if(a==='p-meals')openMealM(fd(new Date()),2);
  else if(a==='p-calendar')openCalModal();
  else if(a==='p-chat')return; // ✅ Pas de FAB sur chat
  else openTaskModal();
}

/* ═══ SIDE DRAWER ═══ */
function openDrawer(){
  document.getElementById('nav-drawer').classList.add('open');
  document.getElementById('nav-overlay').classList.add('open');
  document.getElementById('n-st')?.setAttribute('aria-expanded','true');
}
function closeDrawer(){
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('open');
  document.getElementById('n-st')?.setAttribute('aria-expanded','false');
}
function toggleDrawer(e){
  if(e)e.stopPropagation();
  document.getElementById('nav-drawer').classList.contains('open')?closeDrawer():openDrawer();
}
function closeMoreMenu(){closeDrawer();}

/* ═══ LAUNCH & DATA LOADING ═══ */
async function launchApp(){
  if(!A.couple){showSc('s-couple');hideL();return;}
  try{A.avail=JSON.parse(localStorage.getItem('ll-av')||'{}');}catch{}
  showSc('s-app');updatePill();

  loadStep('Données…');
  const t0=performance.now();
  try{
    const _timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),20000));
    await Promise.race([loadAll(),_timeout]);
    LL.log('info','app','data_loaded',{ms:Math.round(performance.now()-t0)});
  }catch(e){
    LL.log('error','app','load_failed',{message:e.message});
    toast('Chargement partiel — vérifiez votre connexion.','error',5000);
  }

  setupRT();
  _registerPushToken().catch(()=>{});

  // ✅ Ouvrir l'onglet demandé par le raccourci PWA
  const _pendingTab=sessionStorage.getItem('ll-open-tab');
  if(_pendingTab){
    sessionStorage.removeItem('ll-open-tab');
    const allTabs=['home','calendar','chat','tasks','budget','shop','meals','settings'];
    if(allTabs.includes(_pendingTab)){
      showPage(_pendingTab);
    } else {
      showPage('home');
    }
  } else {
    showPage('home');
  }
  hideL();
  try{await sb.rpc('delete_expired_messages');}catch{};
}

async function loadAll(){
  const cid=A.couple.id;
  // ✅ Charger en parallèle : tasks, shop, accounts, ET événements du mois courant
  // (sans ça, le widget « Prochains événements » sur l'accueil et le calcul d'équité
  //  sont vides tant que l'agenda n'a pas été ouvert)
  const today=new Date();
  const monStart=fd(new Date(today.getFullYear(),today.getMonth(),1));
  const monEnd=fd(new Date(today.getFullYear(),today.getMonth()+2,0)); // mois courant + suivant
  const[r1,r2,r3,r4]=await Promise.all([
    sb.from('tasks').select('*').eq('couple_id',cid).order('created_at'),
    sb.from('shopping_items').select('*').eq('couple_id',cid).order('created_at'),
    sb.from('accounts').select('*').eq('couple_id',cid).order('created_at'),
    sb.from('calendar_events').select('*').eq('couple_id',cid).gte('event_date',monStart).lte('event_date',monEnd).order('event_date',{ascending:true})
  ]);
  A.tasks=r1.data||[];A.shop=r2.data||[];A.accounts=r3.data||[];
  A.calEvents=r4.data||[];
  if(!A.selAc&&A.accounts.length)A.selAc=A.accounts[0].id;

  // Transactions — requête directe en priorité, RPC paginé en fallback
  A.txs=[];A.txCursor=null;A.txHasMore=true;
  const{data:txData,error:txErr}=await sb.from('transactions')
    .select('*').eq('couple_id',cid)
    .order('tx_date',{ascending:false}).order('created_at',{ascending:false}).limit(200);
  if(!txErr&&txData){A.txs=txData;A.txHasMore=txData.length>=200;}
  else await loadMoreTx(); // fallback RPC si la table n'est pas accessible directement

  // ✅ Messages paginés — 50 les plus récents
  A.raw=[];A.msgs=[];A.msgCursor=null;A.msgHasMore=true;
  await loadMoreMsgs();

  // Préférences notifications
  if(A.user){
    const{data:np}=await sb.from('notification_prefs').select('*').eq('user_id',A.user.id).single();
    A.notifPrefs=np||null;
  }

  await loadMeals();
}

async function loadMeals(){
  const mon=getMon(new Date(),A.wkOff);const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  const{data}=await sb.from('meals').select('*').eq('couple_id',A.couple.id).gte('meal_date',fd(mon)).lte('meal_date',fd(sun));
  A.meals={};(data||[]).forEach(m=>{A.meals[m.meal_date+'-'+m.slot]=m;});
}

// ✅ Pagination messages — charge 50 par page via RPC sécurisée
async function loadMoreMsgs(){
  if(!A.msgHasMore||!A.couple)return;
  const before=A.msgCursor||new Date().toISOString();
  const{data,error}=await sb.rpc('get_messages_page',{
    p_couple_id:A.couple.id,
    p_before:before,
    p_limit:50
  });
  if(error){LL.log('error','rpc','load_messages_failed',{message:error.message});return;}
  const rows=(data||[]).reverse(); // remettre dans l'ordre chronologique
  if(rows.length<50)A.msgHasMore=false;
  if(rows.length>0)A.msgCursor=rows[0].created_at;
  A.raw=[...rows,...A.raw];
  await decryptMsgs();
}

async function loadMoreTx(){
  if(!A.txHasMore||!A.couple)return;
  // Essai RPC paginé
  const params={p_couple_id:A.couple.id,p_account_id:null,p_limit:50};
  if(A.txCursor){
    params.p_cursor_date=A.txCursor.date;
    params.p_cursor_ts=A.txCursor.ts;
    params.p_cursor_id=A.txCursor.id;
  }
  const{data,error}=await sb.rpc('get_transactions_page',params);
  if(!error){
    const rows=data||[];
    if(rows.length<50)A.txHasMore=false;
    if(rows.length>0){const last=rows[rows.length-1];A.txCursor={date:last.tx_date,ts:last.created_at,id:last.id};}
    A.txs=[...A.txs,...rows];
    return;
  }
  // Fallback direct si le RPC n'existe pas
  LL.log('warn','rpc','get_transactions_page_missing_fallback',{message:error.message});
  const{data:d2,error:e2}=await sb.from('transactions')
    .select('*').eq('couple_id',A.couple.id)
    .order('tx_date',{ascending:false}).order('created_at',{ascending:false}).limit(200);
  if(!e2&&d2){A.txs=[...A.txs,...d2];A.txHasMore=false;}
}

// Déchiffre un message unique — gère v≤2 (identity key) et v=3 (PFS)
async function _decryptOneMsg(m){
  // v≤2 media : ciphertext = placeholder, fileIv = msg.iv
  if(m.ciphertext==='[MEDIA_ENCRYPTED]')return{...m,txt:null};
  if(!m.ciphertext||!m.iv)return{...m,txt:'🔒 Message chiffré'};
  const key=m.version===3?(A.pfsKey||null):A.sharedKey;
  if(!key)return{...m,txt:'🔒 Message chiffré'};
  const d=await E2E.dec({ct:m.ciphertext,iv:m.iv},key);
  if(!d){
    if(m.version===3)return{...m,txt:null,_pfs_expired:true};
    return{...m,txt:'🔒 Message chiffré'};
  }
  // v=3 peut contenir des métadonnées média chiffrées
  if(m.version===3){
    try{
      const data=JSON.parse(d);
      if(data._m===1){
        return{...m,txt:null,media_type:data.t,media_name:data.n,
               media_size:data.s,media_duration:data.d||0,_fileIv:data.fiv};
      }
    }catch{}
  }
  return{...m,txt:d};
}

async function decryptMsgs(){
  A.msgs=await Promise.all((A.raw||[]).map(m=>_decryptOneMsg(m)));
}

/* ═══ REALTIME ═══ */
async function _registerPushToken(){
  if(typeof Capacitor==='undefined'||!Capacitor.isNativePlatform())return;
  try{
    const PushNotifications=Capacitor.Plugins.PushNotifications;
    if(!PushNotifications)return;
    const perm=await PushNotifications.requestPermissions();
    if(perm.receive!=='granted')return;
    await PushNotifications.register();
    PushNotifications.addListener('registration',async({value:fcmToken})=>{
      try{
        if(!OSID){LL.log('warn','push','onesignal_app_id_missing',{});return;}
        const r=await fetch('https://onesignal.com/api/v1/players',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({app_id:OSID,device_type:1,identifier:fcmToken})
        });
        const json=await r.json();
        if(!r.ok||json.errors){LL.log('warn','push','onesignal_api_error',{status:r.status,errors:json.errors});return;}
        const playerId=json.id;
        if(playerId){
          await sb.rpc('upsert_device_token',{p_token:playerId,p_platform:Capacitor.getPlatform()||'android'});
          LL.log('info','push','device_registered',{platform:Capacitor.getPlatform()});
        }
      }catch(e2){LL.log('warn','push','onesignal_register_failed',{msg:e2.message});}
    });
  }catch(e){
    LL.log('warn','push','register_failed',{msg:e.message});
  }
}

function setupRT(){
  const cid=A.couple.id;
  if(A._rtChannel){sb.removeChannel(A._rtChannel);}

  // ✅ REALTIME OPTIMISÉ — applique les changements localement
  // sans refaire de SELECT complet à chaque événement
  A._rtChannel=sb.channel('ll-'+cid)

    // TASKS — apply INSERT/UPDATE/DELETE localement
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'tasks',filter:'couple_id=eq.'+cid},p=>{
      if(!A.tasks.find(x=>x.id===p.new.id))A.tasks.push(p.new);
      if(isP('tasks'))renderTasks();if(isP('home'))renderHome();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'tasks',filter:'couple_id=eq.'+cid},p=>{
      const i=A.tasks.findIndex(x=>x.id===p.new.id);
      if(i!==-1)A.tasks[i]=p.new;else A.tasks.push(p.new);
      if(isP('tasks'))renderTasks();if(isP('home'))renderHome();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'tasks',filter:'couple_id=eq.'+cid},p=>{
      A.tasks=A.tasks.filter(x=>x.id!==p.old.id);
      if(isP('tasks'))renderTasks();if(isP('home'))renderHome();
    })

    // SHOPPING — apply INSERT/UPDATE/DELETE localement
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'shopping_items',filter:'couple_id=eq.'+cid},p=>{
      if(!A.shop.find(x=>x.id===p.new.id))A.shop.push(p.new);
      if(isP('shop'))renderShop();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'shopping_items',filter:'couple_id=eq.'+cid},p=>{
      const i=A.shop.findIndex(x=>x.id===p.new.id);
      if(i!==-1)A.shop[i]=p.new;else A.shop.push(p.new);
      if(isP('shop'))renderShop();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'shopping_items',filter:'couple_id=eq.'+cid},p=>{
      A.shop=A.shop.filter(x=>x.id!==p.old.id);
      if(isP('shop'))renderShop();
    })

    // MESSAGES — INSERT uniquement, jamais de SELECT complet
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'couple_id=eq.'+cid},async p=>{
      if(A.msgs.find(x=>x.id===p.new.id))return;
      const msg=await _decryptOneMsg(p.new);
      A.msgs.push(msg);
      if(p.new.sender_id!==A.user.id&&!isP('chat')){A.unread++;updBadge();}
      if(isP('chat'))renderMsgs();
    })

    // ACCOUNTS — apply localement (balance mise à jour par RPC côté serveur)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'accounts',filter:'couple_id=eq.'+cid},p=>{
      if(!A.accounts.find(x=>x.id===p.new.id))A.accounts.push(p.new);
      if(!A.selAc)A.selAc=p.new.id;
      if(isP('budget'))renderBudget();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'accounts',filter:'couple_id=eq.'+cid},p=>{
      const i=A.accounts.findIndex(x=>x.id===p.new.id);
      if(i!==-1)A.accounts[i]=p.new;else A.accounts.push(p.new);
      if(isP('budget'))renderBudget();if(isP('home'))renderHome();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'accounts',filter:'couple_id=eq.'+cid},p=>{
      A.accounts=A.accounts.filter(x=>x.id!==p.old.id);
      if(A.selAc===p.old.id)A.selAc=A.accounts[0]?.id||null;
      if(isP('budget'))renderBudget();
    })

    // TRANSACTIONS — apply localement sans rechargement complet
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:'couple_id=eq.'+cid},p=>{
      if(!A.txs.find(x=>x.id===p.new.id))A.txs.unshift(p.new); // plus récent en premier
      if(isP('budget'))renderBudget();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'transactions',filter:'couple_id=eq.'+cid},p=>{
      const i=A.txs.findIndex(x=>x.id===p.new.id);
      if(i!==-1)A.txs[i]=p.new;else A.txs.unshift(p.new);
      if(isP('budget'))renderBudget();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'transactions',filter:'couple_id=eq.'+cid},p=>{
      A.txs=A.txs.filter(x=>x.id!==p.old.id);
      if(isP('budget'))renderBudget();
    })

    // MEALS — apply localement
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'meals',filter:'couple_id=eq.'+cid},p=>{
      A.meals[p.new.meal_date+'-'+p.new.slot]=p.new;
      if(isP('meals'))renderMeals();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'meals',filter:'couple_id=eq.'+cid},p=>{
      A.meals[p.new.meal_date+'-'+p.new.slot]=p.new;
      if(isP('meals'))renderMeals();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'meals',filter:'couple_id=eq.'+cid},p=>{
      // ✅ Avec REPLICA IDENTITY FULL: p.old a tous les champs
      // Fallback: chercher par id si meal_date/slot absents
      if(p.old.meal_date&&p.old.slot!==undefined){
        delete A.meals[p.old.meal_date+'-'+p.old.slot];
      } else {
        // Chercher la clé par id dans le state local
        const key=Object.keys(A.meals).find(k=>A.meals[k].id===p.old.id);
        if(key)delete A.meals[key];
      }
      if(isP('meals'))renderMeals();
    })

    .on('postgres_changes',{event:'INSERT',schema:'public',table:'calendar_events',filter:'couple_id=eq.'+cid},p=>{
      A.calEvents.push(p.new);A.calEvents.sort((a,b)=>a.event_time?.localeCompare(b.event_time||'')||0);
      if(isP('calendar'))renderCalendar();if(isP('home'))renderHome();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'calendar_events',filter:'couple_id=eq.'+cid},p=>{
      const i=A.calEvents.findIndex(x=>x.id===p.new.id);
      if(i!==-1)A.calEvents[i]=p.new;else A.calEvents.push(p.new);
      if(isP('calendar'))renderCalendar();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'calendar_events',filter:'couple_id=eq.'+cid},p=>{
      A.calEvents=A.calEvents.filter(x=>x.id!==p.old.id);
      if(isP('calendar'))renderCalendar();if(isP('home'))renderHome();
    })
    .subscribe(status=>{
      if(status==='SUBSCRIBED')LL.log('info','realtime','connected',{couple_id:cid});
      if(status==='CHANNEL_ERROR')LL.log('error','realtime','channel_error',{couple_id:cid});
    });

  // PFS — écouter les changements de clé de session du partenaire
  if(A._pfsChannel){try{sb.removeChannel(A._pfsChannel);}catch{}}
  A._pfsChannel=sb.channel('pfs-'+cid)
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_sessions',filter:'couple_id=eq.'+cid},async p=>{
      if(p.new?.user_id===A.user.id||p.old?.user_id===A.user.id)return;
      LL.log('info','crypto','partner_session_key_updated');
      await refreshPFSKey();
    }).subscribe();
}

/* ═══ BOOT ═══ */
function bootApp(){
  // ═══ VERROUILLAGE D'INACTIVITÉ (5 min) ═══
  (function(){
    const TIMEOUT=5*60*1000;
    let _timer;
    function _lock(){sb.auth.signOut().finally(()=>{showSc('s-auth');toast('Session verrouillée (inactivité).','info');});}
    function _reset(){clearTimeout(_timer);_timer=setTimeout(_lock,TIMEOUT);}
    ['mousemove','keydown','touchstart','click','scroll'].forEach(ev=>document.addEventListener(ev,_reset,{passive:true}));
    _reset();
  })();

  // ═══ REPRISE AU PREMIER PLAN ═══
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    if(!A.user||!A.couple)return;
    // Re-render la page active au retour au premier plan
    const active=document.querySelector('.page.active');
    const name=active?.id?.replace('p-','');
    if(name){const map={home:renderHome,tasks:renderTasks,shop:renderShop,budget:renderBudget,meals:renderMeals,settings:renderSettings};try{if(map[name])map[name]();}catch{}}
  });

  // ═══ SWIPE NAVIGATION ═══
  (function(){
    const NAV_ORDER=['home','calendar','chat','tasks','budget','shop','meals','settings'];
    let _sx=0,_sy=0,_sTime=0;
    document.getElementById('s-app').addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      _sx=e.touches[0].clientX;_sy=e.touches[0].clientY;_sTime=Date.now();
    },{passive:true});
    document.getElementById('s-app').addEventListener('touchend',e=>{
      if(Date.now()-_sTime>500)return;
      const dx=e.changedTouches[0].clientX-_sx;
      const dy=e.changedTouches[0].clientY-_sy;
      if(Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx)*0.6)return;
      if(_sx<60)return; // left-edge reserved for drawer
      if(document.getElementById('nav-drawer').classList.contains('open'))return;
      // Don't swipe inside scrollable chat or modals
      const target=e.target;
      if(target.closest('.mo-ov,.modal,.nav-drawer,.ch-ms'))return;
      const cur=document.querySelector('.page.active')?.id?.replace('p-','');
      const idx=NAV_ORDER.indexOf(cur);
      if(idx===-1)return;
      if(dx<0&&idx<NAV_ORDER.length-1){
        showPage(NAV_ORDER[idx+1]);
      } else if(dx>0&&idx>0){
        showPage(NAV_ORDER[idx-1]);
      }
    },{passive:true});
  })();
}

export {
  toast, showSc, hideL, loadStep, showPage, isP, openM, closeM, cMO,
  launchApp, loadAll, loadMeals, loadMoreMsgs, loadMoreTx, decryptMsgs,
  setupRT, openDrawer, closeDrawer, toggleDrawer,
  esc, fd, fdFR, fmtE, cap, getMon, copyCode, updatePill, trapFocus,
  quickAdd, initSkeletons, bootApp
}
