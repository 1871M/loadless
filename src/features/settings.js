import { A, sanitizeColor } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'
import { E2E } from '../lib/crypto.js'
import { t, applyLang, TRANS } from '../lib/i18n.js'
import { toast, esc, openM, closeM, showSc, isP } from './boot.js'
import { computeFingerprint, loadPartner, buildKey, _activeKey } from './couple.js'
import { authTab } from './auth.js'

export async function showFingerprint(){
  let myFp='Non disponible';
  if(A._myPubKey) myFp=await computeFingerprint(A._myPubKey);
  const ptFp=A._partnerFingerprint||'Non disponible';
  const ptName=A.partner?.username||'Partenaire';

  // Générer un QR code SVG simple à partir du fingerprint
  function makeQR(text){
    try{
      const qr=qrcode(0,'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag(3,1).replace('<svg ','<svg style="width:80px;height:80px;border-radius:4px" ');
    }catch(e){
      return '<div style="width:80px;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted)">QR</div>';
    }
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)';
  overlay.innerHTML=`
    <div style="background:var(--surface);border-radius:24px;padding:24px 20px;max-width:400px;width:100%;box-shadow:var(--sh-lg);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <div style="width:36px;height:36px;background:var(--p1b);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">🔑</div>
        <div>
          <div style="font-family:Georgia,serif;font-size:17px;font-weight:700">Vérification des clés</div>
          <div style="font-size:11px;color:var(--muted)">Comparez en direct avec votre partenaire</div>
        </div>
      </div>

      <div style="background:var(--greenb);border:1px solid #86EFAC;border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--green);margin-bottom:10px">Votre clé</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${makeQR(myFp)}
          <div>
            <div style="font-family:monospace;font-size:16px;font-weight:800;color:var(--green);letter-spacing:.1em;word-break:break-all">${esc(myFp)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">Montrez ce code à votre partenaire</div>
          </div>
        </div>
      </div>

      <div style="background:var(--p1b);border:1px solid var(--p1m);border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--p1);margin-bottom:10px">Clé de ${esc(ptName)}</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${ptFp!=='Non disponible'?makeQR(ptFp):'<div style="width:80px;height:80px;border:2px dashed var(--p1m);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);text-align:center">En<br>attente</div>'}
          <div>
            <div style="font-family:monospace;font-size:16px;font-weight:800;color:var(--p1);letter-spacing:.1em;word-break:break-all">${esc(ptFp)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">Votre partenaire doit vous montrer ce code</div>
          </div>
        </div>
      </div>

      <div style="background:var(--goldb);border:1px solid var(--goldm);border-radius:11px;padding:12px 14px;font-size:12px;color:var(--muted);margin-bottom:18px;line-height:1.6">
        📞 <strong>Comment vérifier :</strong><br>
        Appelez-vous et lisez vos codes à voix haute. S'ils correspondent, votre chat est sécurisé. S'ils diffèrent, quelqu'un intercepte peut-être vos messages — changez vos clés immédiatement.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button onclick="regenerateMyKey()" style="background:var(--redb);border:1.5px solid var(--redm);color:var(--red);font-family:Outfit,sans-serif;font-size:13px;font-weight:700;padding:11px;border-radius:12px;cursor:pointer">🔄 Régénérer ma clé</button>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:var(--ink);border:none;color:#fff;font-family:Outfit,sans-serif;font-size:13px;font-weight:700;padding:11px;border-radius:12px;cursor:pointer">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

export async function regenerateMyKey(){
  if(!confirm('Régénérer votre clé ? Votre partenaire devra revalider. Les anciens messages ne seront plus déchiffrables.'))return;
  const uid=A.user.id;
  const kp=await E2E.gen();
  await E2E.saveK(uid,kp.priv);
  const{error}=await sb.from('profiles').update({public_key:kp.pub}).eq('id',uid);
  if(error){toast('Erreur','error');return;}
  A._pk=kp.priv;
  A._myPubKey=kp.pub;
  await E2E.markRotated(uid);
  // Effacer fingerprint connu
  if(A.partner?.id)localStorage.removeItem('ll-fp-'+uid+'-'+A.partner.id);
  A.sharedKey=null;
  document.querySelector('[style*=fixed]')?.remove();
  toast('Nouvelle clé générée. Partagez votre nouveau fingerprint avec votre partenaire.','success',6000);
  // Recharger le partenaire et reconstruire la clé
  await loadPartner();
  await buildKey();
}


export function renderSettings(){
  const el=document.getElementById('p-settings');
  const me=A.me,couple=A.couple;

  // Calculer l'expiration du code
  let expireInfo='';
  if(couple?.invite_expires_at){
    const exp=new Date(couple.invite_expires_at);
    const now=new Date();
    const isExpired=exp<now;
    const diffDays=Math.ceil((exp-now)/(1000*60*60*24));
    if(isExpired){
      expireInfo='<div style="font-size:11px;color:var(--red);margin-top:5px">⚠️ Code expiré — régénérez-en un nouveau</div>';
    } else {
      expireInfo='<div style="font-size:11px;color:var(--muted);margin-top:5px">⏱ Expire dans '+diffDays+' jour'+(diffDays>1?'s':'')+'</div>';
    }
  }

  const isCreator=couple?.partner1_id===A.user?.id;
  const rotateBtn=isCreator
    ?'<button onclick="rotateInviteCode()" style="margin-top:10px;background:none;border:1.5px solid var(--border);border-radius:9px;padding:7px 14px;font-size:11px;font-weight:700;color:var(--muted);cursor:pointer;font-family:Outfit,sans-serif">🔄 Régénérer le code</button>'
    :'';

  // ── ÉTAT SÉCURITÉ ──
  const keyVerified=!!A._partnerFingerprint && !A._keyChangeAlert;
  const keyState=A._keyChangeAlert?'⚠️ Clé du partenaire modifiée — re-vérifiez !':(keyVerified?'✅ Clé vérifiée':'⚠️ Clé non vérifiée');
  const keyColor=A._keyChangeAlert?'var(--red)':(keyVerified?'var(--green)':'var(--gold)');

  // ── PRÉFÉRENCES (lues depuis localStorage) ──
  const prefs=(()=>{try{return JSON.parse(localStorage.getItem('ll-prefs')||'{}');}catch{return{};}})();
  const hapt=prefs.haptics!==false;
  const curLang=prefs.lang||'fr';
  const curEphDur=prefs.ephDur||'off';
  const ephOptions=[
    {v:'off',l:'Off (désactivé)'},
    {v:'3600000',l:'1h'},
    {v:'86400000',l:'24h'},
    {v:'604800000',l:'7j'},
    {v:'2592000000',l:'30j'},
    {v:'custom',l:'Personnalisé'},
  ];
  const ephSel=ephOptions.map(o=>`<option value="${o.v}"${o.v===curEphDur?' selected':''}>${o.l}</option>`).join('');
  const ephCustomVisible=curEphDur!=='off'&&!ephOptions.slice(0,-1).find(o=>o.v===curEphDur);
  const langs=[
    {v:'fr',l:'🇫🇷 Français'},
    {v:'en',l:'🇬🇧 English'},
    {v:'es',l:'🇪🇸 Español'},
    {v:'de',l:'🇩🇪 Deutsch'},
    {v:'it',l:'🇮🇹 Italiano'},
    {v:'pt',l:'🇧🇷 Português'},
    {v:'ar',l:'🇸🇦 العربية'},
    {v:'ru',l:'🇷🇺 Русский'},
    {v:'zh',l:'🇨🇳 中文'},
    {v:'ja',l:'🇯🇵 日本語'},
    {v:'ko',l:'🇰🇷 한국어'},
    {v:'tr',l:'🇹🇷 Türkçe'},
    {v:'pl',l:'🇵🇱 Polski'},
    {v:'nl',l:'🇳🇱 Nederlands'},
    {v:'hi',l:'🇮🇳 हिन्दी'},
  ];

  const avatarSrc=me?.avatar_url?`<img src="${me.avatar_url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid ${sanitizeColor(me?.avatar_color)}44">`
    :`<div style="width:72px;height:72px;border-radius:50%;background:${sanitizeColor(me?.avatar_color)}22;color:${sanitizeColor(me?.avatar_color)};font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;border:3px solid ${sanitizeColor(me?.avatar_color)}33">${(me?.username||'?')[0].toUpperCase()}</div>`;

  el.innerHTML='<div class="st-wr">'
    // ── PROFIL ──
    +'<div class="st-sc"><div class="st-st">👤 Profil</div>'
      +'<div style="display:flex;align-items:center;gap:16px;padding:12px 16px 8px">'
        +'<div style="position:relative;cursor:pointer" onclick="pickProfilePhoto()">'
          +avatarSrc
          +'<div style="position:absolute;bottom:0;right:0;width:22px;height:22px;background:var(--p1d);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--surface)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>'
        +'</div>'
        +'<div style="flex:1">'
          +'<div style="font-family:\'Fraunces\',\'Display\',Georgia,serif;font-size:18px;font-weight:700">'+esc(me?.username||'')+'</div>'
          +'<div style="font-size:12px;color:var(--muted);margin-top:2px">'+esc(A.user?.email||'')+'</div>'
          +'<button onclick="openProfileEdit()" style="margin-top:8px;background:var(--p1b);border:1.5px solid var(--p1m);border-radius:9px;padding:5px 12px;font-size:11px;font-weight:700;color:var(--p1d);cursor:pointer">Modifier</button>'
        +'</div>'
      +'</div>'
      +(couple?'<div style="padding:0 16px 12px">'
        +'<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Code d\'invitation partenaire</div>'
        +'<div class="inv-cr"><span class="inv-co" id="inv-code-display">'+(couple.invite_code||'——')+'</span><button class="btn-cp2" onclick="copyCode(document.getElementById(\'inv-code-display\').textContent)">Copier</button></div>'
        +expireInfo+rotateBtn
        +(A.partner?'<div style="display:flex;align-items:center;gap:8px;margin-top:10px;background:var(--greenb);border:1px solid #86EFAC;border-radius:10px;padding:10px 12px"><div style="width:28px;height:28px;border-radius:50%;background:'+sanitizeColor(A.partner.avatar_color)+'22;color:'+sanitizeColor(A.partner.avatar_color)+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800">'+A.partner.username[0].toUpperCase()+'</div><div><div style="font-size:13px;font-weight:600">'+esc(A.partner.username)+'</div><div style="font-size:11px;color:var(--green)">✓ Partenaire connecté·e</div></div></div>'
        :'<div style="font-size:12px;color:var(--muted);margin-top:10px;background:var(--goldb);border:1px solid var(--goldm);border-radius:9px;padding:9px 12px">⏳ En attente de votre partenaire…</div>')
      +'</div>':'')
    +'</div>'

    // ── APPARENCE ──
    +'<div class="st-sc"><div class="st-st">🎨 '+t('settings_appearance')+'</div>'
      +'<label class="st-tg-rw"><span class="st-ri">🌙</span><div class="st-rf"><div class="st-rt">Mode sombre</div><div class="st-rs">Thème foncé pour la nuit</div></div><input type="checkbox" '+(prefs.darkMode?'checked':'')+' onchange="setPref(\'darkMode\',this.checked)"></label>'
    +'</div>'

    // ── LANGUE ──
    +'<div class="st-sc"><div class="st-st">🌐 '+t('settings_lang')+'</div>'
      +'<div style="padding:10px 16px 14px">'
        +'<select onchange="setPref(\'lang\',this.value)" style="width:100%;background:var(--bg);border:1.5px solid var(--border2);border-radius:11px;padding:10px 14px;font-size:14px;font-family:\'Inter\',\'UI\',sans-serif;color:var(--ink);outline:none;cursor:pointer">'
          +langs.map(l=>'<option value="'+l.v+'"'+(l.v===curLang?' selected':'')+'>'+l.l+'</option>').join('')
        +'</select>'
      +'</div>'
    +'</div>'

    // ── NOTIFICATIONS ──
    +(()=>{
      const np=A.notifPrefs||{};
      const cats=[
        {k:'chat',l:'Messages chat',i:'💬'},
        {k:'tasks',l:'Tâches',i:'✅'},
        {k:'budget',l:'Budget',i:'💰'},
        {k:'shopping',l:'Courses',i:'🛒'},
        {k:'meals',l:'Repas',i:'🍽️'},
        {k:'calendar',l:'Calendrier',i:'📅'},
      ];
      const rows=cats.map(c=>{
        const checked=np['notif_'+c.k]!==false;
        return '<label class="st-tg-rw"><span class="st-ri">'+c.i+'</span><div class="st-rf"><div class="st-rt">'+c.l+'</div></div><input type="checkbox" '+(checked?'checked':'')+' onchange="saveNotifPref(\''+c.k+'\',this.checked)"></label>';
      }).join('');
      return '<div class="st-sc"><div class="st-st">🔔 Notifications push</div>'
        +'<label class="st-tg-rw"><span class="st-ri">📳</span><div class="st-rf"><div class="st-rt">Vibrations</div><div class="st-rs">Retour haptique</div></div><input type="checkbox" '+(hapt?'checked':'')+' onchange="setPref(\'haptics\',this.checked)"></label>'
        +'<div style="border-top:1px solid var(--border2);padding:6px 0 2px"><div style="font-size:11px;color:var(--muted);padding:6px 16px 4px">Recevoir les notifications par catégorie</div>'
        +rows+'</div></div>';
    })()

    // ── SÉCURITÉ ──
    +'<div class="st-sc"><div class="st-st">🔒 Sécurité</div>'
      +'<div class="st-rw" onclick="showFingerprint()" role="button" tabindex="0"><span class="st-ri">🔑</span><div class="st-rf"><div class="st-rt">Clés de sécurité E2E</div><div class="st-rs" style="color:'+keyColor+';font-weight:600">'+keyState+'</div></div><span class="st-ra">›</span></div>'
      +'<div class="st-rw" onclick="BackupManager.exportBackup()" role="button" tabindex="0"><span class="st-ri">📤</span><div class="st-rf"><div class="st-rt">Exporter la sauvegarde</div><div class="st-rs">Fichier chiffré AES-256</div></div><span class="st-ra">›</span></div>'
      +'<div style="border-top:1px solid var(--border2)">'
        +'<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:44px">'
          +'<span class="st-ri">⏱</span>'
          +'<div class="st-rf" style="flex:1"><div class="st-rt">Messages éphémères</div><div class="st-rs">Suppression automatique après envoi</div></div>'
          +'<select id="st-eph-dur" onchange="setEphSetting(this.value)" style="background:var(--bg);border:1.5px solid var(--border2);border-radius:11px;padding:7px 10px;font-size:13px;font-family:\'Inter\',\'UI\',sans-serif;color:var(--ink);outline:none;cursor:pointer">'+ephSel+'</select>'
        +'</div>'
        +'<div id="st-eph-custom" style="display:'+(ephCustomVisible?'block':'none')+';padding:0 16px 14px 48px">'
          +'<input id="st-eph-custom-val" type="number" min="1" placeholder="Durée en heures…" '
            +'style="width:100%;background:var(--bg);border:1.5px solid var(--border2);border-radius:11px;padding:10px 14px;font-size:14px;font-family:\'Inter\',\'UI\',sans-serif;color:var(--ink);outline:none;transition:border-color .2s" '
            +'onchange="applyEphCustom(this.value)">'
          +'<div style="font-size:11px;color:var(--muted);margin-top:6px">Durée en heures avant suppression</div>'
        +'</div>'
      +'</div>'
      +'<div style="padding:8px 16px 12px;font-size:11px;color:var(--muted);line-height:1.6">💡 Vos messages sont chiffrés sur votre appareil avant d\'être envoyés.</div>'
    +'</div>'

    // ── COMPTE ──
    +'<div class="st-sc"><div class="st-st">👤 Compte</div>'
      +(couple&&A.partner
        ?'<div class="st-rw" style="cursor:default"><span class="st-ri">🔗</span><div class="st-rf"><div class="st-rt">Partenaire lié</div><div class="st-rs" style="color:var(--green);font-weight:600">✓ '+esc(A.partner.username)+'</div></div></div>'
        :'')
      +(couple&&isCreator
        ?'<div class="st-rw" onclick="rotateInviteCode()" role="button" tabindex="0"><span class="st-ri">🔄</span><div class="st-rf"><div class="st-rt">Régénérer mon code d\'invitation</div><div class="st-rs">L\'ancien code deviendra invalide</div></div><span class="st-ra">›</span></div>'
        :'')
      +'<div class="st-rw" onclick="doSignOut()" role="button" tabindex="0"><span class="st-ri">🚪</span><div class="st-rf"><div class="st-rt">Se déconnecter</div><div class="st-rs">'+esc(A.user?.email||'')+'</div></div><span class="st-ra">›</span></div>'
      +'<div class="st-rw" onclick="delAccount()" role="button" tabindex="0" style="color:var(--red)"><span class="st-ri">🗑️</span><div class="st-rf"><div class="st-rt">Supprimer mon compte</div><div class="st-rs">Action irréversible</div></div><span class="st-ra">›</span></div>'
    +'</div>'

    // ── AIDE ──
    +'<div class="st-sc"><div class="st-st">❓ Aide</div>'
      +'<div class="st-rw" onclick="window.open(\'https://github.com/1871M/loadless/issues\',\'_blank\')" role="button" tabindex="0"><span class="st-ri">🐛</span><div class="st-rf"><div class="st-rt">Signaler un problème</div><div class="st-rs">GitHub Issues</div></div><span class="st-ra">›</span></div>'
      +'<div class="st-rw" onclick="showHelpModal()" role="button" tabindex="0"><span class="st-ri">📖</span><div class="st-rf"><div class="st-rt">Guide d\'utilisation</div><div class="st-rs">Comment utiliser Loadless</div></div><span class="st-ra">›</span></div>'
      +'<div class="st-rw" role="button" tabindex="0"><span class="st-ri">💬</span><div class="st-rf"><div class="st-rt">À propos</div><div class="st-rs">Loadless v5.0.0 · Chiffrement E2E · Open Source</div></div><span class="st-ra">›</span></div>'
    +'</div>'

    // ── ÉQUITÉ ──
    +'<div class="st-sc"><div class="st-st">⚖️ Équité & disponibilité</div>'
      +'<div id="st-equity-section" style="padding:4px 0 8px"></div>'
    +'</div>'

    +'<div style="text-align:center;padding:12px 16px 28px"><a href="https://github.com/1871M/loadless/releases/latest" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--p1b);border:1.5px solid var(--p1m);border-radius:12px;font-size:13px;font-weight:700;color:var(--p1d);text-decoration:none">📱 Télécharger l\'APK</a></div>'
    +'<div style="text-align:center;padding:0 16px 32px;font-size:10px;color:var(--faint)">🔒 E2E · Supabase RLS · Build '+new Date().toISOString().slice(0,10)+'</div>'
    +'</div>';

  // Appliquer les préférences au DOM (au cas où)
  applyPrefs();
  // Render equity inline
  renderEquity('st-equity-section');
}

export async function saveNotifPref(category,enabled){
  if(!A.user||!A.couple)return;
  const col='notif_'+category;
  const update={[col]:enabled,updated_at:new Date().toISOString()};
  if(!A.notifPrefs){
    const{data}=await sb.from('notification_prefs').upsert(
      {user_id:A.user.id,couple_id:A.couple.id,...update},
      {onConflict:'user_id'}
    ).select().single();
    A.notifPrefs=data||{...update,user_id:A.user.id,couple_id:A.couple.id};
  }else{
    await sb.from('notification_prefs').update(update).eq('user_id',A.user.id);
    A.notifPrefs={...A.notifPrefs,...update};
  }
  toast(enabled?'Activé ✓':'Désactivé','success',1200);
}

export function setPref(k,v){
  let prefs={};try{prefs=JSON.parse(localStorage.getItem('ll-prefs')||'{}');}catch{}
  prefs[k]=v;
  localStorage.setItem('ll-prefs',JSON.stringify(prefs));
  if(k==='lang'){location.reload();return;}
  applyPrefs();
  toast(v?'Activé ✓':'Désactivé','success',1500);
}

export function applyPrefs(){
  let prefs={};try{prefs=JSON.parse(localStorage.getItem('ll-prefs')||'{}');}catch{}
  document.documentElement.classList.toggle('reduce-motion',prefs.reduceMotion===true);
  document.documentElement.classList.add('high-contrast'); // toujours activé
  document.documentElement.classList.toggle('large-text',prefs.largeText===true);
  document.documentElement.classList.toggle('dark',prefs.darkMode===true);
  // Restore ephemeral setting
  if(prefs.ephDur&&prefs.ephDur!=='off'){
    _eph=true;A.eph=true;
    _ephDur=parseInt(prefs.ephDur)||86400000;
  }
}

export function openProfileEdit(){
  const me=A.me;if(!me)return;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Modifier le profil');

  const colors=['#7C3AED','#0F766E','#B91C1C','#B45309','#1D4ED8','#BE185D','#059669','#DC2626'];

  overlay.innerHTML='<div style="background:var(--surface);border-radius:24px;padding:22px 18px;max-width:420px;width:100%;box-shadow:var(--sh-lg);max-height:90vh;overflow-y:auto">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">'
      +'<div style="width:36px;height:36px;background:var(--p1b);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px" aria-hidden="true">👤</div>'
      +'<div>'
        +'<div style="font-family:Georgia,serif;font-size:17px;font-weight:700">Modifier mon profil</div>'
        +'<div style="font-size:11px;color:var(--muted)">Pseudo et couleur visibles par votre partenaire</div>'
      +'</div>'
    +'</div>'
    +'<div class="fc">'
      +'<div class="fd"><label for="pe-un">Pseudo</label><input id="pe-un" type="text" value="'+esc(me.username||'')+'" maxlength="32" autocomplete="off"></div>'
      +'<div class="fd"><label>Couleur d\'accent</label>'
        +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px" id="pe-cp">'
          +colors.map(c=>'<button class="pe-co" data-color="'+c+'" onclick="document.querySelectorAll(\'#pe-cp .pe-co\').forEach(b=>b.style.boxShadow=\'none\');this.style.boxShadow=\'0 0 0 2px white,0 0 0 4px \'+\''+c+'\'" style="width:34px;height:34px;border-radius:50%;background:'+c+';border:none;cursor:pointer;'+(c===me.avatar_color?'box-shadow:0 0 0 2px white,0 0 0 4px '+c:'')+'" aria-label="Couleur '+c+'"></button>').join('')
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="mo-bts" style="margin-top:18px"><button class="btn-cc" onclick="this.closest(\'[role=dialog]\').remove()">Annuler</button><button class="btn-sv" onclick="saveProfile()">Enregistrer</button></div>'
  +'</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

export function pickProfilePhoto(){
  const inp=document.getElementById('pp-fi-photo');
  if(!inp)return;
  inp.value='';
  inp.click();
}
export async function handleProfilePhotoPick(inp){
  const file=inp.files?.[0];if(!file)return;
  if(file.size>20*1024*1024){toast('Image trop grande (max 20 Mo)','error');return;}
  try{
    const b64=await _resizeImg(file,256);
    const{error}=await sb.from('profiles').update({avatar_url:b64}).eq('id',A.user.id);
    if(error)throw error;
    A.me.avatar_url=b64;toast('Photo mise à jour !','success');renderSettings();
  }catch(err){toast('Erreur: '+err.message,'error');}
}
export function _resizeImg(file,maxPx){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const sc=Math.min(maxPx/img.width,maxPx/img.height,1);
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL('image/jpeg',0.82));
    };
    img.onerror=reject;
    img.src=url;
  });
}

export function showHelpModal(){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)';
  ov.innerHTML=`<div style="background:var(--surface);border-radius:24px 24px 0 0;padding:22px 20px 40px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto">
    <div style="font-family:'Fraunces','Display',Georgia,serif;font-size:20px;font-weight:700;margin-bottom:16px">Guide d'utilisation</div>
    <div style="display:flex;flex-direction:column;gap:12px;font-size:14px;line-height:1.6">
      <div><strong>🏠 Accueil</strong> — Vue d'ensemble de votre foyer, équilibre budget et tâches du jour.</div>
      <div><strong>📅 Agenda</strong> — Gérez les événements familiaux et planifiez votre semaine.</div>
      <div><strong>💬 Chat</strong> — Messagerie chiffrée de bout en bout, inspirée de Signal. Appui long sur ✉ pour activer les messages éphémères.</div>
      <div><strong>✅ Tâches</strong> — Répartissez les tâches du foyer. Assignez-les à vous ou votre partenaire.</div>
      <div><strong>💳 Budget</strong> — Suivez vos dépenses par compte. Ajoutez revenus, dépenses et abonnements.</div>
      <div><strong>🛒 Courses</strong> — Liste de courses partagée en temps réel.</div>
      <div><strong>⚖️ Équité</strong> — Visualisez la répartition des tâches entre les deux partenaires.</div>
    </div>
    <button onclick="this.closest('[style*=position]').remove()" style="margin-top:20px;width:100%;padding:14px;background:var(--p1d);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer">Fermer</button>
  </div>`;
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
}

export async function saveProfile(){
  const overlay=document.querySelector('[role=dialog][aria-label="Modifier le profil"]');
  const un=document.getElementById('pe-un')?.value.trim();
  if(!un||un.length<2){toast('Pseudo trop court (min 2 caractères)','error');return;}
  // Couleur sélectionnée = celle avec un box-shadow
  const sel=document.querySelector('#pe-cp .pe-co[style*="0 0 0 2px white"]');
  const color=sel?.dataset.color||A.me.avatar_color;
  const{error}=await sb.from('profiles').update({username:un,avatar_color:color}).eq('id',A.user.id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  A.me.username=un;A.me.avatar_color=color;
  if(overlay)overlay.remove();
  toast('Profil mis à jour ! ✏️','success');
  renderSettings();
  // Mettre à jour le pill en haut
  const pnm=document.getElementById('pnm');if(pnm)pnm.textContent=un;
  const pav=document.getElementById('pav');if(pav){pav.style.background=sanitizeColor(color)+'22';pav.style.color=sanitizeColor(color);pav.textContent=un[0].toUpperCase();}
}

// ✅ Rotation du code d'invitation via RPC sécurisée
export async function rotateInviteCode(){
  if(!A.couple){toast('Aucun foyer trouvé.','error');return;}
  const warnPartner=A.partner?'\n\n⚠️ Votre partenaire devra utiliser le nouveau code pour se reconnecter si nécessaire.':'';
  if(!confirm('Régénérer le code d\'invitation ?'+warnPartner+'\n\nL\'ancien code deviendra invalide immédiatement.'))return;
  const{data,error}=await sb.rpc('rotate_invite_code',{p_couple_id:A.couple.id});
  if(error){toast('Erreur: '+error.message,'error');return;}
  if(data?.error){toast(data.message||'Erreur','error');return;}
  A.couple.invite_code=data.invite_code;
  A.couple.invite_expires_at=data.expires_at;
  toast('Nouveau code généré !','success');
  renderSettings();
}
export async function doSignOut(){
  // ✅ Fermer le canal realtime avant de se déconnecter
  if(A._rtChannel){
    try{await sb.removeChannel(A._rtChannel);}catch{}
  }
  await sb.auth.signOut();
  // ✅ Effacer TOUTES les données sensibles en mémoire
  Object.assign(A,{
    user:null,me:null,couple:null,partner:null,
    sharedKey:null,
    _pk:null,
    _sessionKey:null,
    _myPubKey:null,
    _partnerPubKeyCached:null,
    _partnerFingerprint:null,
    _keyChangeAlert:false,
    _keyPendingConfirmation:null,
    _rtChannel:null,
    pfsKey:null,_sessionPrivKey:null,_sessionPubKey:null,_pfsReady:false,_pfsChannel:null,
    notifPrefs:null,
    tasks:[],shop:[],accounts:[],txs:[],meals:{},msgs:[],raw:[],
    wkOff:0,selAc:null,filt:'all',prio:'low',eTid:null,
    eph:false,unread:0,avail:{},
    msgCursor:null,msgHasMore:true,txCursor:null,txHasMore:true
  });
  LL.log('info','auth','logout');
  LL.auditLog?.('logout');
  showSc('s-auth');authTab('login');toast('Déconnecté·e','info');
}
export async function delAccount(){
  if(!confirm('⚠️ Supprimer définitivement votre compte et toutes vos données ?'))return;
  if(!confirm('Dernière confirmation ?'))return;
  // ✅ Fermer le canal realtime avant suppression (évite événements orphelins)
  if(A._rtChannel){try{await sb.removeChannel(A._rtChannel);}catch{}}
  try{
    // ✅ Tentative 1 : RPC dédiée qui efface profil + auth.users (RGPD complet)
    const{data,error}=await sb.rpc('delete_my_account');
    if(!error && data && !data.error){
      await sb.auth.signOut();
      showSc('s-auth');
      toast('Compte définitivement supprimé.','info',5000);
      return;
    }
    // ✅ Tentative 2 (fallback) : suppression du profil seul si la RPC n'existe pas
    // Le compte auth.users restera, mais les données utilisateur seront effacées (cascade).
    await sb.from('profiles').delete().eq('id',A.user.id);
    await sb.auth.signOut();
    showSc('s-auth');
    toast('Profil supprimé. Pour effacer le compte auth, contactez le support.','info',7000);
  }catch(e){
    LL.log('error','auth','delete_account_failed',{message:e?.message});
    toast('Erreur. Contactez le support.','error');
  }
}

