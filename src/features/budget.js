import { A, MON, sanitizeColor } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { toast, esc, fdFR, fmtE, isP, openM, closeM, fd, loadMoreTx } from './boot.js'

let _editTxId = null
let _editAcId = null
const _deleteAcState = new Map()

export async function _reloadTxs(){
  const[txRes,acRes]=await Promise.all([
    sb.from('transactions').select('*').eq('couple_id',A.couple.id)
      .order('tx_date',{ascending:false}).order('created_at',{ascending:false}).limit(200),
    sb.from('accounts').select('*').eq('couple_id',A.couple.id)
  ]);
  if(!txRes.error&&txRes.data&&txRes.data.length>0){A.txs=txRes.data;A.txHasMore=txRes.data.length>=200;A.txCursor=null;}
  if(!acRes.error&&acRes.data)A.accounts=acRes.data;
  if(isP('budget'))renderBudget();
}

export function changeBudgetMonth(dir){
  const now=new Date();
  if(!A.budgetMonth)A.budgetMonth=fd(now).slice(0,7);
  const[yr,mo]=A.budgetMonth.split('-').map(Number);
  const d=new Date(yr,mo-1+dir,1);
  const next=fd(d).slice(0,7);
  const curM=fd(now).slice(0,7);
  if(next>curM)return;
  A.budgetMonth=next;
  A.txFilt='all';
  renderBudget();
}

export function renderBudget(){
  const el=document.getElementById('p-budget');
  if(!A.selAc&&A.accounts.length)A.selAc=A.accounts[0].id;
  const mStr=(A.budgetMonth||fd(new Date()).slice(0,7));
  const mExp=(A.selAc?A.txs.filter(t=>t.account_id===A.selAc):A.txs).filter(t=>t.tx_date?.startsWith(mStr)&&t.type!=='income').reduce((a,t)=>a+Number(t.amount),0);
  const mInc=(A.selAc?A.txs.filter(t=>t.account_id===A.selAc):A.txs).filter(t=>t.tx_date?.startsWith(mStr)&&t.type==='income').reduce((a,t)=>a+Number(t.amount),0);
  const txAll=A.selAc?A.txs.filter(t=>t.account_id===A.selAc):A.txs;
  // Filtrer par mois et par type
  const txD=txAll.filter(t=>t.tx_date?.startsWith(A.budgetMonth||fd(new Date()).slice(0,7))
    &&(A.txFilt==='all'||t.type===A.txFilt));
  const byM={};[...txD].sort((a,b)=>b.tx_date?.localeCompare(a.tx_date)).forEach(t=>{const m=t.tx_date?.slice(0,7);if(m){if(!byM[m])byM[m]=[];byM[m].push(t);}});

  // Mois sélectionné pour l'historique
  if(!A.budgetMonth)A.budgetMonth=fd(new Date()).slice(0,7);
  const curM=fd(new Date()).slice(0,7);
  const allMonths=[...new Set([...A.txs.map(t=>t.tx_date?.slice(0,7)).filter(Boolean),curM,A.budgetMonth||curM])].sort();
  const mIdx=allMonths.indexOf(A.budgetMonth);
  const btnSt='background:var(--surface);border:1.5px solid var(--border);border-radius:9px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--ink);';
  const disBtn='opacity:.35;cursor:default;';
  let monthSel='';
  if(allMonths.length>=1){
    const opts=allMonths.map(m=>{
      const[yr,mo]=m.split('-');
      const sel=m===A.budgetMonth?' selected':'';
      return '<option value="'+m+'"'+sel+'>'+MON[parseInt(mo)-1]+' '+yr+'</option>';
    }).join('');
    const canPrev=mIdx>0;
    const canNext=mIdx<allMonths.length-1;
    monthSel='<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">'
      +'<button onclick="changeBudgetMonth(-1)" style="'+btnSt+(canPrev?'':'pointer-events:none;'+disBtn)+'" title="Mois précédent">‹</button>'
      +'<select onchange="A.budgetMonth=this.value;renderBudget()" style="flex:1;background:var(--surface);border:1.5px solid var(--border);border-radius:9px;padding:6px 10px;font-family:Outfit,sans-serif;font-size:12px;color:var(--ink);outline:none;text-align:center">'
      +opts+'</select>'
      +'<button onclick="changeBudgetMonth(1)" style="'+btnSt+(canNext?'':'pointer-events:none;'+disBtn)+'" title="Mois suivant">›</button>'
      +'</div>';
  }

  el.innerHTML='<div class="bg-wr"><div class="ac-row" id="ac-row"></div>'
    +monthSel
    +'<div class="bg-acts"><button class="btn-tx inc" onclick="openTx(\'income\')">💰 Revenu</button><button class="btn-tx exp" onclick="openTx(\'expense\')">💸 Dépense</button><button class="btn-tx rec" onclick="openTx(\'recurring\')">🔁 Abonnement</button><button class="btn-tx wd" onclick="openTx(\'withdrawal\')">🏧 Retrait</button></div>'
    +(function(){
      const tabs=[
        {f:'all',l:'Tout'},
        {f:'expense',l:'💸 Dépenses'},
        {f:'income',l:'💰 Revenus'},
        {f:'recurring',l:'🔁 Abonnements'}
      ];
      return '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'
        +tabs.map(t=>'<button class="tab'+(A.txFilt===t.f?' active':'')+'" onclick="A.txFilt=\''+t.f+'\';renderBudget()">'+t.l+'</button>').join('')
        +'</div>';
    })()
    +'<div class="bg-sum"><div class="bs-c"><div class="bs-lb">Revenus</div><div class="bs-vl" style="color:var(--green)">+'+fmtE(mInc)+'</div></div><div class="bs-c"><div class="bs-lb">Dépenses</div><div class="bs-vl" style="color:var(--red)">−'+fmtE(mExp)+'</div></div><div class="bs-c"><div class="bs-lb">Bilan</div><div class="bs-vl" style="color:'+(mInc-mExp>=0?'var(--green)':'var(--red)')+'">'+((mInc-mExp>=0?'+':'')+fmtE(mInc-mExp))+'</div></div></div>'
    +'<div id="bg-subs"></div>'
    +'<div class="tx-lst" id="tx-lst"></div></div>';

  const ar=document.getElementById('ac-row');
  A.accounts.forEach(ac=>{
    const sel=ac.id===A.selAc;
    const d=document.createElement('div');d.className='ac-card'+(sel?' sel':'');
    if(sel){d.style.borderColor=ac.color;d.style.boxShadow='0 0 0 2px '+ac.color+'44';}
    d.innerHTML='<div class="ac-ty">'+({courant:'💳 Courant',epargne:'🏦 Épargne',especes:'💵 Espèces'}[ac.type]||ac.type)+'</div>'+'<div class="ac-nm">'+esc(ac.name)+'</div>'+'<div class="ac-bl" style="color:'+ac.color+';font-family:Lora,serif">'+fmtE(Number(ac.balance))+'</div>'+'<div style="display:flex;gap:6px;margin-top:6px">'+'<span style="font-size:10px;color:var(--muted);cursor:pointer" onclick="event.stopPropagation();editAccount(\''+ac.id+'\')">✏️ Modifier</span>'+'<span style="font-size:10px;color:var(--red);cursor:pointer" id="del-ac-btn-'+ac.id+'" onclick="event.stopPropagation();deleteAccountConfirm(\''+ac.id+'\',\''+esc(ac.name)+'\')">🗑️ Supprimer</span>'+'</div>';
    d.onclick=()=>{A.selAc=ac.id;renderBudget();};ar.appendChild(d);
  });
  const ab=document.createElement('button');ab.className='btn-ac';ab.innerHTML='＋<span>Compte</span>';ab.onclick=()=>{_editAcId=null;document.querySelector('#mo-ac .mo-tt').textContent='Ajouter un compte';openM('mo-ac');};ar.appendChild(ab);

  // ✅ Détection automatique des abonnements (récurrents implicites)
  renderDetectedSubs();

  const tl=document.getElementById('tx-lst');
  if(!txD.length){tl.innerHTML='<div class="empty"><div class="ei">💸</div><p>Aucune opération.</p></div>';return;}
  Object.entries(byM).forEach(([m,items])=>{
    const sep=document.createElement('div');sep.className='tx-sp';const[y,mo]=m.split('-');sep.textContent=MON[parseInt(mo)-1]+' '+y;tl.appendChild(sep);
    items.forEach(tx=>{
      const isPos=tx.type==='income';
      const icons={expense:'💸',income:'💰',recurring:'🔄',withdrawal:'🏧'};
      const bgs={expense:['#FEF2F2','#DC2626'],income:['#F0FDF4','#16A34A'],recurring:['#F5F0FF','#8B5CF6'],withdrawal:['#FFFBEB','#D97706']};
      const[ibg,ic]=bgs[tx.type]||bgs.expense;
      const d=document.createElement('div');d.className='tx-c';
      const typeLabel={expense:'💸 Dépense',income:'💰 Revenu',recurring:'🔁 Abonnement',withdrawal:'🏧 Retrait'}[tx.type]||tx.type;
      const catLabel=tx.category&&tx.category!=='autre'?' · '+tx.category:'';
      d.innerHTML=''
        +'<div class="tx-ic" style="background:'+ibg+';color:'+ic+'">'+(icons[tx.type]||'💸')+'</div>'
        +'<div class="tx-inf">'
          +'<div class="tx-tt">'+esc(tx.title)+'</div>'
          +'<div class="tx-mt" style="color:'+ic+';font-weight:700;font-size:11px">'+typeLabel+catLabel+'</div>'
          +'<div class="tx-mt">'+fdFR(tx.tx_date)+(tx.note?' · '+esc(tx.note):'')+'</div>'
        +'</div>'
        +'<div class="tx-am '+(isPos?'pos':'neg')+'">'+(isPos?'+':'−')+fmtE(Number(tx.amount))+'</div>'
        +'<div style="display:flex;flex-direction:column;gap:2px">'
          +'<button class="tx-dl" onclick="openTx(\''+tx.type+'\',\''+tx.id+'\')" title="Modifier l\'opération" aria-label="Modifier"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
          +'<button class="tx-dl" onclick="delTx(\''+tx.id+'\')" title="Supprimer l\'opération" aria-label="Supprimer"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
        +'</div>';
      tl.appendChild(d);
    });
  });
  // ✅ Bouton charger plus de transactions (restauré)
  if(A.txHasMore){
    const btn=document.createElement('button');
    btn.style.cssText='display:block;margin:12px auto 4px;background:none;border:1.5px solid var(--border);border-radius:9px;padding:8px 18px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;font-family:Outfit,sans-serif';
    btn.textContent='Charger les transactions précédentes';
    btn.onclick=async()=>{btn.textContent='Chargement…';btn.disabled=true;await loadMoreTx();renderBudget();};
    tl.appendChild(btn);
  }
}

export function _normTitle(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z\s]/g,'')
    .replace(/\s+/g,' ').trim();
}
export function detectSubscriptions(){
  // Marquer comme abonnement : tout ce qui est explicitement 'recurring' OU détecté comme tel
  // ✅ Exclure les transactions à montant 0 (anti division par zéro)
  const candidates=A.txs.filter(t=>(t.type==='expense'||t.type==='recurring')&&Number(t.amount)>0);
  // Grouper par titre normalisé
  const grps={};
  candidates.forEach(t=>{
    const k=_normTitle(t.title);
    if(!k)return;
    (grps[k]=grps[k]||[]).push(t);
  });
  const subs=[];
  for(const k in grps){
    const arr=grps[k].slice().sort((a,b)=>(a.tx_date||'').localeCompare(b.tx_date||''));
    if(arr.length<2)continue;
    // Vérifier la régularité d'intervalle
    let intervals=[];
    for(let i=1;i<arr.length;i++){
      const d1=new Date(arr[i-1].tx_date),d2=new Date(arr[i].tx_date);
      const dd=Math.round((d2-d1)/(1000*60*60*24));
      intervals.push(dd);
    }
    // Au moins un intervalle entre 25 et 35 jours
    const monthly=intervals.some(d=>d>=25&&d<=35);
    if(!monthly)continue;
    // Montants similaires (tolérance 5%)
    const amounts=arr.map(t=>Number(t.amount));
    const avg=amounts.reduce((a,b)=>a+b,0)/amounts.length;
    const allClose=amounts.every(a=>Math.abs(a-avg)/avg<=0.05);
    if(!allClose)continue;
    // Marquer comme abonnement détecté
    const last=arr[arr.length-1];
    subs.push({
      key:k,
      title:last.title,
      avgAmount:Math.round(avg*100)/100,
      occurrences:arr.length,
      lastDate:last.tx_date,
      explicit:arr.some(t=>t.type==='recurring'),
      ids:arr.map(t=>t.id)
    });
  }
  // Tri par montant décroissant
  subs.sort((a,b)=>b.avgAmount-a.avgAmount);
  return subs;
}

export function renderDetectedSubs(){
  const wrap=document.getElementById('bg-subs');
  if(!wrap)return;
  const subs=detectSubscriptions();
  if(!subs.length){wrap.innerHTML='';return;}
  const total=subs.reduce((a,s)=>a+s.avgAmount,0);
  const detected=subs.filter(s=>!s.explicit);
  let html='<div style="background:linear-gradient(135deg,var(--p1b),#FAF5FF);border:1px solid var(--p1m);border-radius:14px;padding:14px;margin:10px 0 14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      +'<div style="display:flex;align-items:center;gap:8px">'
        +'<span style="font-size:18px" aria-hidden="true">🔁</span>'
        +'<div>'
          +'<div style="font-family:Lora,serif;font-size:14px;font-weight:700;color:var(--ink)">Abonnements détectés</div>'
          +'<div style="font-size:10px;color:var(--muted)">'+subs.length+' actif'+(subs.length>1?'s':'')+' · ~'+fmtE(total)+'/mois</div>'
        +'</div>'
      +'</div>'
      +'<button onclick="toggleSubsList()" id="bg-subs-tg" aria-expanded="false" aria-controls="bg-subs-list" style="background:none;border:none;color:var(--p1);font-weight:700;font-size:12px;cursor:pointer;font-family:Outfit,sans-serif">Voir ›</button>'
    +'</div>'
    +'<div id="bg-subs-list" style="display:none;border-top:1px solid var(--p1m);padding-top:10px">';
  subs.forEach(s=>{
    const tag=s.explicit?'<span style="font-size:9px;background:var(--p1);color:#fff;padding:2px 6px;border-radius:6px;font-weight:700">déclaré</span>':'<span style="font-size:9px;background:var(--goldb);color:var(--gold);padding:2px 6px;border-radius:6px;font-weight:700;border:1px solid var(--goldm)">détecté</span>';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(196,181,253,.3);font-size:12px">'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.title)+'</div>'
        +'<div style="font-size:10px;color:var(--muted)">'+s.occurrences+' fois · dernier '+fdFR(s.lastDate)+' · '+tag+'</div>'
      +'</div>'
      +'<div style="font-weight:800;color:var(--p1);font-family:Lora,serif">'+fmtE(s.avgAmount)+'</div>'
      +'</div>';
  });
  if(detected.length){
    html+='<div style="font-size:10px;color:var(--muted);margin-top:8px;line-height:1.5">💡 '+detected.length+' abonnement'+(detected.length>1?'s':'')+' détecté'+(detected.length>1?'s':'')+' automatiquement. Vous pouvez les marquer explicitement comme « Abonnement » via le bouton 🔁 ci-dessus.</div>';
  }
  html+='</div></div>';
  wrap.innerHTML=html;
}

export function toggleSubsList(){
  const list=document.getElementById('bg-subs-list');
  const btn=document.getElementById('bg-subs-tg');
  if(!list||!btn)return;
  const open=list.style.display!=='none';
  list.style.display=open?'none':'block';
  btn.textContent=open?'Voir ›':'Masquer ‹';
  btn.setAttribute('aria-expanded',open?'false':'true');
}
export function openTx(type,txId){
  if(!txId&&!A.accounts.length){toast('Créez d\'abord un compte bancaire (bouton ＋ Compte).','info');return;}
  _editTxId=txId||null;
  const isEdit=!!txId;
  const labels={expense:'Dépense',income:'Revenu',recurring:'Prélèvement',withdrawal:'Retrait'};
  document.getElementById('mo-tx-t').textContent=isEdit?"Modifier l'opération":labels[type];
  document.getElementById('tx-dt').value=fd(new Date());
  ['tx-ti','tx-no'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('tx-am').value='';
  const sel=document.getElementById('tx-ac');
  sel.innerHTML=A.accounts.map(a=>'<option value="'+a.id+'"'+(a.id===A.selAc?' selected':'')+'>'+esc(a.name)+'</option>').join('');
  if(isEdit){
    const tx=A.txs.find(x=>x.id===txId);
    if(tx){
      document.getElementById('tx-ti').value=tx.title||'';
      document.getElementById('tx-am').value=tx.amount||'';
      document.getElementById('tx-ty').value=tx.type||type;
      document.getElementById('tx-dt').value=tx.tx_date||fd(new Date());
      document.getElementById('tx-ca').value=tx.category||'autre';
      document.getElementById('tx-no').value=tx.note||'';
      sel.value=tx.account_id;
    }
  } else {
    document.getElementById('tx-ty').value=type;
  }
  openM('mo-tx');
}
// delta solde selon type
export function _txDelta(type,amount){return type==='income'?Number(amount):-Number(amount);}

// insert direct sur la table + maj solde — retourne {data, error}
export async function _directInsert(pl){
  const{data:ins,error}=await sb.from('transactions').insert({
    couple_id:pl.couple_id,account_id:pl.account_id,title:pl.title,
    amount:pl.amount,type:pl.type,category:pl.category,note:pl.note,tx_date:pl.tx_date
  }).select().single();
  if(error)return{error};
  const ac=A.accounts.find(x=>x.id===pl.account_id);
  if(ac)sb.from('accounts').update({balance:Number(ac.balance)+_txDelta(pl.type,pl.amount)}).eq('id',pl.account_id);
  return{data:ins};
}

// delete direct sur la table + restaure solde
export async function _directDelete(id){
  const tx=A.txs.find(x=>x.id===id);
  const{error}=await sb.from('transactions').delete().eq('id',id);
  if(error)return error;
  if(tx){const ac=A.accounts.find(x=>x.id===tx.account_id);if(ac)await sb.from('accounts').update({balance:Number(ac.balance)-_txDelta(tx.type,Number(tx.amount))}).eq('id',tx.account_id);}
  return null;
}

export async function saveTx(){
  if(!A.couple){toast('Session expirée. Rechargez la page.','error');return;}
  const title=document.getElementById('tx-ti').value.trim();
  const amount=parseFloat(document.getElementById('tx-am').value);
  if(!title||!amount||amount<=0){toast('Remplissez titre et montant (> 0).','error');return;}
  const type=document.getElementById('tx-ty').value;
  const accId=document.getElementById('tx-ac').value;
  if(!accId){toast('Sélectionnez un compte.','error');return;}
  const cat=document.getElementById('tx-ca').value;
  const note=document.getElementById('tx-no').value.trim();
  const txDate=document.getElementById('tx-dt').value||fd(new Date());
  const pl={couple_id:A.couple.id,account_id:accId,title,amount,type,category:cat,note,tx_date:txDate};

  if(_editTxId){
    const old=A.txs.find(x=>x.id===_editTxId);
    // Essai RPC update
    const{data:upd,error:upErr}=await sb.rpc('update_transaction_secure',{
      p_tx_id:_editTxId,p_account_id:accId,p_title:title,p_amount:amount,
      p_type:type,p_category:cat,p_note:note,p_tx_date:txDate
    });
    const rpcOk=!upErr&&upd&&!upd.error;
    if(!rpcOk){
      const errMsg=upErr?.message||upd?.error||'Erreur serveur.';
      toast('Erreur modification: '+errMsg,'error');
      return;
    }
    // Patch local immédiat : transaction + solde comptes
    const i=A.txs.findIndex(x=>x.id===_editTxId);
    const updTx={...(A.txs[i]||old||{}),account_id:accId,title,amount,type,category:cat,note,tx_date:txDate};
    if(i!==-1)A.txs[i]=updTx;else A.txs.unshift(updTx);
    closeM('mo-tx');toast('Modifié ! ✅','success');_editTxId=null;renderBudget();_reloadTxs();return;
  }

  // Création — essai RPC sécurisé d'abord
  const{data,error}=await sb.rpc('add_transaction_secure',{
    p_couple_id:A.couple.id,p_account_id:accId,p_title:title,
    p_amount:amount,p_type:type,p_category:cat,p_note:note,p_tx_date:txDate
  });
  if(!error&&!data?.error){
    // Patch local immédiat — le RPC a inséré en DB, on l'affiche sans attendre realtime
    const newTx={...pl,id:data?.transaction_id||(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'tmp-'+Date.now()),created_at:new Date().toISOString()};
    A.txs.unshift(newTx);
    // Mettre à jour le solde du compte localement pour affichage immédiat
    const acIdx=A.accounts.findIndex(a=>a.id===accId);
    if(acIdx!==-1){const delta=_txDelta(type,amount);A.accounts[acIdx]={...A.accounts[acIdx],balance:Number(A.accounts[acIdx].balance)+delta};}
    closeM('mo-tx');toast('Enregistré !','success');renderBudget();_reloadTxs();return;
  }
  // RPC obligatoire — pas de fallback (bloqué par RLS tx_block_direct_insert)
  const msg=error?.message||data?.error||data?.message||'Erreur serveur.';
  toast('Erreur: '+msg,'error');
}

export async function delTx(id){
  if(!confirm('Supprimer cette opération ?'))return;
  const tx=A.txs.find(x=>x.id===id);
  const{data,error}=await sb.rpc('delete_transaction_secure',{p_tx_id:id});
  const rpcOk=!error&&!data?.error;
  if(!rpcOk){
    const err=await _directDelete(id);
    if(err){toast('Erreur: '+err.message,'error');return;}
  }
  // Patch local immédiat — retire la ligne de la liste sans attendre realtime
  A.txs=A.txs.filter(x=>x.id!==id);
  toast('Supprimé.','success');renderBudget();_reloadTxs();
}
export function editAccount(id){
  const ac=A.accounts.find(x=>x.id===id);if(!ac)return;
  _editAcId=id;
  document.querySelector('#mo-ac .mo-tt').textContent='Modifier le compte';
  document.getElementById('ac-nm').value=ac.name||'';
  document.getElementById('ac-ty').value=ac.type||'courant';
  document.getElementById('ac-bl').value=ac.balance||0;
  document.getElementById('ac-co').value=ac.color||'#8B5CF6';
  openM('mo-ac');
}
export async function saveAccount(){
  if(!A.couple){toast('Session expirée. Rechargez la page.','error');return;}
  const name=document.getElementById('ac-nm').value.trim();
  if(!name){toast('Saisissez un nom de compte.','error');return;}
  const bal=parseFloat(document.getElementById('ac-bl').value)||0;
  const rawColor=document.getElementById('ac-co').value;
  const safeColor=sanitizeColor(rawColor);
  const color=/^#[0-9A-Fa-f]{6}$/.test(safeColor)?safeColor:'#8B5CF6';
  const type=document.getElementById('ac-ty').value;
  try{
  if(_editAcId){
    const ac=A.accounts.find(x=>x.id===_editAcId);
    if(!ac){toast('Compte introuvable.','error');return;}
    const{error:e1}=await sb.from('accounts').update({name,type,color}).eq('id',_editAcId);
    if(e1){toast('Erreur: '+e1.message,'error');return;}
    const i=A.accounts.findIndex(x=>x.id===_editAcId);
    if(i!==-1)A.accounts[i]={...A.accounts[i],name,type,color};
    const diff=bal-Number(ac.balance);
    if(Math.abs(diff)>0.001){
      const adjType=diff>0?'income':'expense';
      await sb.rpc('add_transaction_secure',{
        p_couple_id:A.couple.id,p_account_id:_editAcId,
        p_title:'Ajustement de solde',p_amount:Math.abs(diff),
        p_type:adjType,p_category:'autre',p_note:'Correction manuelle du solde',
        p_tx_date:fd(new Date())
      });
    }
    closeM('mo-ac');toast('Compte modifié !','success');
  } else {
    const{data,error}=await sb.from('accounts').insert({name,type,balance:bal,color,couple_id:A.couple.id}).select().single();
    if(error){toast('Erreur: '+error.message,'error');return;}
    if(data&&!A.accounts.find(x=>x.id===data.id))A.accounts.push(data);
    closeM('mo-ac');toast('Compte créé !','success');
  }
  _editAcId=null;
  document.querySelector('#mo-ac .mo-tt').textContent='Ajouter un compte';
  renderBudget();
  }catch(e){toast('Erreur inattendue: '+e.message,'error');}
}

export async function deleteAccountConfirm(id,name){
  const state=_deleteAcState.get(id)||0;
  if(state===0){
    _deleteAcState.set(id,1);
    const btn=document.getElementById('del-ac-btn-'+id);
    if(btn){btn.textContent='⚠️ Êtes-vous sûr ?';btn.style.fontWeight='700';}
    setTimeout(()=>{
      _deleteAcState.delete(id);
      const b=document.getElementById('del-ac-btn-'+id);
      if(b){b.textContent='🗑️ Supprimer';b.style.fontWeight='';}
    },5000);
    return;
  }
  _deleteAcState.delete(id);
  if(!confirm('Confirmer définitivement la suppression de "'+name+'" ?'))return;
  const keepHistory=confirm('Que faire des transactions liées ?\n\n[OK] Garder l\'historique (transactions conservées)\n[Annuler] Tout supprimer (transactions effacées)');
  try{
    const{data:res,error}=await sb.rpc('delete_account_secure',{p_account_id:id,p_keep_history:keepHistory});
    if(error||res?.error){toast('Erreur: '+(error?.message||res?.error),'error');return;}
    A.accounts=A.accounts.filter(x=>x.id!==id);
    if(A.selAc===id)A.selAc=A.accounts[0]?.id||null;
    if(!keepHistory)A.txs=A.txs.filter(t=>t.account_id!==id);
    else A.txs=A.txs.map(t=>t.account_id===id?{...t,account_id:null}:t);
    toast(keepHistory?'Compte supprimé (historique conservé).':'Compte et transactions supprimés.','success');
    renderBudget();
  }catch(e){toast('Erreur inattendue: '+e.message,'error');}
}

