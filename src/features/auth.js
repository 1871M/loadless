// src/features/auth.js
import { A } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'
import { E2E } from '../lib/crypto.js'

// Note: authTab, sm, doLogin, doRegister, doForgot are called from HTML onclick
// launchApp, setupKeys, loadPartner, _initCryptoAsync are called within auth — they will
// be resolved via window.* in main.js (they're in boot.js/couple.js modules)
// For now, call them directly (they're still globals from the inline script)

function authTab(tab){
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active',(i===0&&tab==='login')||(i===1&&tab==='register')));
  document.getElementById('fl').style.display=tab==='login'?'flex':'none';
  document.getElementById('fr').style.display=tab==='register'?'flex':'none';
  document.getElementById('ff').style.display=tab==='forgot'?'flex':'none';
}
function sm(id,msg,cls){const e=document.getElementById(id);e.textContent=msg;e.className='amsg '+cls;}

async function doLogin(){
  const em=document.getElementById('li-e').value.trim(),pw=document.getElementById('li-p').value;
  if(!em||!pw){sm('li-m','Remplissez tous les champs.','err');return;}
  const btn=document.getElementById('btn-li');btn.disabled=true;btn.textContent='Connexion…';
  try{
    const{data,error}=await sb.auth.signInWithPassword({email:em,password:pw});
    if(error)throw error;
    if(!data.user.email_confirmed_at){
      LL.log('warn','auth','login_unconfirmed_email');
      await sb.auth.signOut();
      sm('li-m','Confirmez d\'abord votre e-mail.','err');return;
    }
    LL.log('info','auth','login_success');
    LL.auditLog?.('login',{uid:data.user.id?.slice(0,8)});
    // onAuth déclenché par onAuthStateChange SIGNED_IN (évite le double appel concurrent)
  }catch(e){
    LL.log('warn','auth','login_failed',{message:e.message});
    sm('li-m',e.message==='Invalid login credentials'?'Email ou mot de passe incorrect.':e.message,'err');
    // ✅ Délai anti-timing attack (évite l'énumération d'utilisateurs)
    await new Promise(r=>setTimeout(r,300+Math.random()*200));
  }finally{
    btn.disabled=false;btn.textContent='Se connecter';
  }
}

async function doRegister(){
  const u=document.getElementById('rg-u').value.trim(),em=document.getElementById('rg-e').value.trim(),pw=document.getElementById('rg-p').value;
  if(!u||!em||!pw){sm('rg-m','Remplissez tous les champs.','err');return;}
  if(pw.length<8){sm('rg-m','Mot de passe trop court (8 car. min.).','err');return;}
  if(!/^[a-zA-ZÀ-ÿ0-9_-]{2,20}$/.test(u)){sm('rg-m','Pseudo invalide (2-20 car., lettres/chiffres).','err');return;}
  // ✅ Validation format email basique côté client
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){sm('rg-m','Adresse email invalide.','err');return;}
  const btn=document.getElementById('btn-rg');btn.disabled=true;btn.textContent='Création…';
  try{
    const{error}=await sb.auth.signUp({email:em,password:pw,options:{data:{username:u}}});
    if(error)throw error;
    sm('rg-m','✅ Compte créé ! Vérifiez votre email pour confirmer.','ok');btn.textContent='Email envoyé !';
  }catch(e){sm('rg-m',e.message,'err');btn.disabled=false;btn.textContent='Créer mon compte';}
}

async function doForgot(){
  const em=document.getElementById('fg-e').value.trim();if(!em){sm('fg-m','Entrez votre email.','err');return;}
  const btn=document.getElementById('btn-fg');btn.disabled=true;btn.textContent='Envoi…';
  try{
    const{error}=await sb.auth.resetPasswordForEmail(em);if(error)throw error;
    sm('fg-m','✅ Lien envoyé ! Vérifiez votre boîte mail.','ok');btn.textContent='Lien envoyé !';
    // Anti-spam : réactiver après 60s
    setTimeout(()=>{btn.disabled=false;btn.textContent='Renvoyer le lien';},60000);
  }catch(e){sm('fg-m',e.message,'err');btn.disabled=false;btn.textContent='Envoyer le lien';}
}

// Timeout wrapper — évite les hangs réseau sur Android (cold start)
function withTO(p,ms=7000){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);}

async function onAuth(user){
  A.user=user;

  // ── Cache localStorage (données non-sensibles : profil + foyer) ──────────
  // Clés privées/sharedKey jamais dans localStorage — IDB uniquement
  const _cacheMe=localStorage.getItem('ll-cache-me-'+user.id);
  const _cacheCouple=localStorage.getItem('ll-cache-couple-'+user.id);
  const cachedMe=_cacheMe?JSON.parse(_cacheMe):null;
  const cachedCouple=_cacheCouple?JSON.parse(_cacheCouple):null;

  if(cachedMe&&cachedCouple){
    // ✅ Cache valide : lancer immédiatement, rafraîchir en arrière-plan
    A.me=cachedMe;
    A.couple=cachedCouple;
    launchApp().catch(e=>{
      LL.log('error','auth','launch_app_crashed',{msg:e?.message||String(e)});
      if(typeof hideL==='function')hideL();
      if(typeof showSc==='function')showSc('s-auth');
    });
    (async()=>{
      try{await setupKeys();}catch(e){LL.log('error','crypto','setup_keys_failed',{msg:e?.message});}
      try{await loadPartner();}catch(e){LL.log('warn','auth','load_partner_failed',{msg:e?.message});}
      _initCryptoAsync();
      // Rafraîchir profil + foyer en arrière-plan
      _refreshProfileAndCouple(user).catch(()=>{});
    })();
    return;
  }

  // ── Première connexion sur cet appareil — chargement réseau obligatoire ──
  loadStep('Profil…');
  // ✅ Détection nouvelle session (appareil différent)
  const sessionKey='ll-last-ua-'+user.id;
  const lastUA=localStorage.getItem(sessionKey);
  const currentUA=navigator.userAgent.slice(0,80);
  if(lastUA&&lastUA!==currentUA){
    LL.log('warn','security','new_device_detected',{});
    toast('⚠️ Nouvelle connexion détectée depuis un appareil différent.','error',6000);
  }
  localStorage.setItem(sessionKey,currentUA);

  let me;
  try{
    const{data}=await withTO(sb.from('profiles').select('*').eq('id',user.id).single());
    me=data;
  }catch(e){
    LL.log('error','auth','profile_load_failed',{msg:e.message});
    toast('Chargement profil échoué. Réessayez.','error',6000);
    showSc('s-auth');hideL();return;
  }

  if(!me){
    const un=user.user_metadata?.username||user.email.split('@')[0];
    const cols=['#8B5CF6','#0D9488','#D97706','#DC2626','#2563EB'];
    try{
      const{data:n}=await withTO(sb.from('profiles')
        .insert({id:user.id,username:un,display_name:un,avatar_color:cols[Math.floor(Math.random()*cols.length)]})
        .select().single());
      if(!n)throw new Error('no data');
      me=n;
    }catch(e){
      LL.log('error','auth','profile_insert_failed',{msg:e.message});
      toast('Erreur de création du profil. Réessayez.','error',6000);
      await sb.auth.signOut();
      showSc('s-auth');hideL();return;
    }
  }

  A.me=me;
  localStorage.setItem('ll-cache-me-'+user.id,JSON.stringify(me));

  let couple;
  try{
    const{data}=await withTO(sb.from('couples').select('*').or('partner1_id.eq.'+user.id+',partner2_id.eq.'+user.id).maybeSingle());
    couple=data;
  }catch(e){
    LL.log('error','auth','couple_load_failed',{msg:e.message});
    toast('Chargement foyer échoué. Réessayez.','error',6000);
    showSc('s-auth');hideL();return;
  }

  if(couple){
    A.couple=couple;
    localStorage.setItem('ll-cache-couple-'+user.id,JSON.stringify(couple));
    launchApp().catch(e=>{
      LL.log('error','auth','launch_app_crashed',{msg:e?.message||String(e)});
      if(typeof hideL==='function')hideL();
      if(typeof showSc==='function')showSc('s-auth');
    });
    (async()=>{
      try{await setupKeys();}catch(e){LL.log('error','crypto','setup_keys_failed',{msg:e?.message});}
      try{await loadPartner();}catch(e){LL.log('warn','auth','load_partner_failed',{msg:e?.message});}
      _initCryptoAsync();
    })();
  }
  else{showSc('s-couple');hideL();}
}

// Rafraîchit profil + foyer depuis le réseau et met le cache à jour
async function _refreshProfileAndCouple(user){
  try{
    const{data:me}=await withTO(sb.from('profiles').select('*').eq('id',user.id).single()).catch(()=>({data:null}));
    if(me){A.me=me;localStorage.setItem('ll-cache-me-'+user.id,JSON.stringify(me));}
  }catch{}
  try{
    const{data:couple}=await withTO(sb.from('couples').select('*').or('partner1_id.eq.'+user.id+',partner2_id.eq.'+user.id).maybeSingle()).catch(()=>({data:null}));
    if(couple){
      A.couple=couple;localStorage.setItem('ll-cache-couple-'+user.id,JSON.stringify(couple));
    }else if(A.couple){
      // Couple supprimé — invalider cache et rediriger vers écran foyer
      A.couple=null;localStorage.removeItem('ll-cache-couple-'+user.id);
      showSc('s-couple');
    }
  }catch{}
}

export { authTab, sm, doLogin, doRegister, doForgot, withTO, onAuth, _refreshProfileAndCouple }
