export const TRANS={
  fr:{nav_home:'Accueil',nav_cal:'Agenda',nav_chat:'Chat',nav_tasks:'Tâches',nav_budget:'Budget',nav_shop:'Courses',nav_meals:'Repas',nav_settings:'Paramètres',settings_lang:'Langue',settings_appearance:'Apparence',settings_notifs:'Notifications push',settings_security:'Sécurité',settings_account:'Compte',settings_profile:'Profil'},
  en:{nav_home:'Home',nav_cal:'Calendar',nav_chat:'Chat',nav_tasks:'Tasks',nav_budget:'Budget',nav_shop:'Shopping',nav_meals:'Meals',nav_settings:'Settings',settings_lang:'Language',settings_appearance:'Appearance',settings_notifs:'Push notifications',settings_security:'Security',settings_account:'Account',settings_profile:'Profile'},
  es:{nav_home:'Inicio',nav_cal:'Agenda',nav_chat:'Chat',nav_tasks:'Tareas',nav_budget:'Presupuesto',nav_shop:'Compras',nav_meals:'Comidas',nav_settings:'Ajustes',settings_lang:'Idioma',settings_appearance:'Apariencia',settings_notifs:'Notificaciones',settings_security:'Seguridad',settings_account:'Cuenta',settings_profile:'Perfil'},
  de:{nav_home:'Startseite',nav_cal:'Kalender',nav_chat:'Chat',nav_tasks:'Aufgaben',nav_budget:'Budget',nav_shop:'Einkaufen',nav_meals:'Mahlzeiten',nav_settings:'Einstellungen',settings_lang:'Sprache',settings_appearance:'Erscheinung',settings_notifs:'Benachrichtigungen',settings_security:'Sicherheit',settings_account:'Konto',settings_profile:'Profil'},
  it:{nav_home:'Home',nav_cal:'Calendario',nav_chat:'Chat',nav_tasks:'Attività',nav_budget:'Budget',nav_shop:'Spesa',nav_meals:'Pasti',nav_settings:'Impostazioni',settings_lang:'Lingua',settings_appearance:'Aspetto',settings_notifs:'Notifiche',settings_security:'Sicurezza',settings_account:'Account',settings_profile:'Profilo'},
  pt:{nav_home:'Início',nav_cal:'Agenda',nav_chat:'Chat',nav_tasks:'Tarefas',nav_budget:'Orçamento',nav_shop:'Compras',nav_meals:'Refeições',nav_settings:'Configurações',settings_lang:'Idioma',settings_appearance:'Aparência',settings_notifs:'Notificações',settings_security:'Segurança',settings_account:'Conta',settings_profile:'Perfil'},
  ar:{nav_home:'الرئيسية',nav_cal:'التقويم',nav_chat:'دردشة',nav_tasks:'المهام',nav_budget:'الميزانية',nav_shop:'تسوق',nav_meals:'وجبات',nav_settings:'إعدادات',settings_lang:'اللغة',settings_appearance:'المظهر',settings_notifs:'الإشعارات',settings_security:'الأمان',settings_account:'الحساب',settings_profile:'الملف'},
  hi:{nav_home:'होम',nav_cal:'कैलेंडर',nav_chat:'चैट',nav_tasks:'कार्य',nav_budget:'बजट',nav_shop:'खरीदारी',nav_meals:'भोजन',nav_settings:'सेटिंग्स',settings_lang:'भाषा',settings_appearance:'स्वरूप',settings_notifs:'सूचनाएं',settings_security:'सुरक्षा',settings_account:'खाता',settings_profile:'प्रोफ़ाइल'}
};

export function t(key){const prefs=JSON.parse(localStorage.getItem('ll-prefs')||'{}');const lang=prefs.lang||'fr';return(TRANS[lang]&&TRANS[lang][key])||TRANS.fr[key]||key;}

export function applyLang(){
  const items=[['n-ho','nav_home'],['n-cal','nav_cal'],['n-ch','nav_chat'],['n-tk','nav_tasks'],['n-bg','nav_budget'],['n-sh','nav_shop'],['n-ml','nav_meals'],['n-st','nav_settings'],
               ['nd-ho','nav_home'],['nd-cal','nav_cal'],['nd-ch','nav_chat'],['nd-tk','nav_tasks'],['nd-bg','nav_budget'],['nd-sh','nav_shop'],['nd-ml','nav_meals']];
  for(const[id,key]of items){
    const el=document.getElementById(id);if(!el)continue;
    for(let i=el.childNodes.length-1;i>=0;i--){
      const n=el.childNodes[i];if(n.nodeType===3&&n.textContent.trim()){n.textContent=t(key);break;}
    }
  }
}
