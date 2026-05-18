export let A={
  user:null,me:null,couple:null,partner:null,sharedKey:null,_pk:null,_sessionKey:null,
  // PFS session keys (en mémoire uniquement — jamais persistées)
  pfsKey:null,_sessionPrivKey:null,_sessionPubKey:null,_pfsReady:false,_cryptoInitPending:false,_pfsSetupInProgress:false,
  tasks:[],shop:[],accounts:[],txs:[],meals:{},msgs:[],raw:[],
  wkOff:0,selAc:null,filt:'todo',prio:'low',eTid:null,eph:false,unread:0,avail:{},
  msgCursor:null,msgHasMore:true,txCursor:null,txHasMore:true,
  _rtChannel:null,_pfsChannel:null,
  calEvents:[],calSelected:null,txFilt:'all',notifPrefs:null
};

export const CATS={
  menage:{l:'Ménage',i:'🧹',bg:'#EFF6FF',bd:'#BFDBFE'},
  admin:{l:'Administratif',i:'📄',bg:'#F5F3FF',bd:'#DDD6FE'},
  cuisine:{l:'Cuisine',i:'🍳',bg:'#FFFBEB',bd:'#FDE68A'},
  reparation:{l:'Réparation',i:'🔧',bg:'#FEF2F2',bd:'#FECACA'},
  jardin:{l:'Jardin',i:'🌿',bg:'#F0FDF4',bd:'#BBF7D0'},
  animaux:{l:'Animaux',i:'🐾',bg:'#FFF0F6',bd:'#FBCFE8'},
  autre:{l:'Autre',i:'📌',bg:'#F9FAFB',bd:'#E5E7EB'}
};

export const SCATS={
  fruits:{l:'Fruits & Légumes',i:'🥦'},viande:{l:'Viandes & Poissons',i:'🥩'},
  cremerie:{l:'Crémerie',i:'🧀'},epicerie:{l:'Épicerie',i:'🥫'},
  boissons:{l:'Boissons',i:'🧃'},hygiene:{l:'Hygiène',i:'🧴'},
  animaux:{l:'Animaux',i:'🐾'},autre:{l:'Autre',i:'📌'}
};

export const FREQ={once:'Une fois',daily:'Chaque jour',weekly:'Chaque semaine',monthly:'Chaque mois'};
export const MON=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const DAY=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

export const ALLOWED_COLORS=['#8B5CF6','#0D9488','#D97706','#DC2626','#2563EB','#DB2777'];

export function sanitizeColor(c){
  if(!c)return'var(--p1)';
  // Accepter uniquement hex court ou long
  if(/^#[0-9A-Fa-f]{3}$/.test(c)||/^#[0-9A-Fa-f]{6}$/.test(c))return c;
  // Accepter var(--xxx) qui vient uniquement du code
  if(/^var\(--[a-z0-9-]+\)$/.test(c))return c;
  return'var(--p1)'; // fallback sécurisé
}
