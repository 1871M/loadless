import './styles/variables.css'
import './styles/components.css'
import './styles/pages.css'
import { LL } from './lib/logger.js'
import { t, applyLang, TRANS } from './lib/i18n.js'
import { A, CATS, SCATS, FREQ, MON, DAY, sanitizeColor, ALLOWED_COLORS } from './lib/state.js'
import { E2E, b64e } from './lib/crypto.js'
import { sb, OSID, auditLog } from './lib/supabase.js'
import {
  toast, showSc, hideL, loadStep, showPage, isP, openM, closeM, cMO,
  launchApp, loadAll, loadMeals, loadMoreMsgs, loadMoreTx, decryptMsgs,
  setupRT, openDrawer, closeDrawer, toggleDrawer,
  esc, fd, fdFR, fmtE, cap, getMon, copyCode, updatePill, trapFocus,
  quickAdd, initSkeletons
} from './features/boot.js'
import { authTab, doLogin, doRegister, doForgot, withTO, onAuth, _refreshProfileAndCouple } from './features/auth.js'
import { setupKeys, buildKey, confirmPartnerKeyChange, loadPartner, cpSh, doCreate, doJoin, _initCryptoAsync, setupPFS, refreshPFSKey, computeFingerprint, _activeKey, _activeVer } from './features/couple.js'
import { renderHome, getSugs } from './features/home.js'
import { renderTasks, renderTL, buildTC, setF, _patchTask, claim, release, delT, openTaskModal, editTask, saveTask, onPsTg, setPrio, updPU, joinTask, leaveTask, claimTogether, inviteHelper, togT } from './features/tasks.js'
import { renderShop, renderShopItems, openShopModal, saveShopItem, addShop, togShop, delShop, clearDone, editShop } from './features/shopping.js'
import { renderBudget, _reloadTxs, changeBudgetMonth, openTx, saveTx, delTx, editAccount, saveAccount, deleteAccountConfirm, detectSubscriptions, renderDetectedSubs, toggleSubsList } from './features/budget.js'
import { renderMeals, selectMealSlot, openMealM, saveMeal, editMeal, delMeal, wkNav, getMealIngr, addIngrToShop } from './features/meals.js'
import { renderEquity, calcEquity, buildEqPerson, saveAvail, showEquityHistory } from './features/equity.js'
import { renderCalendar, openCalModal, editCalEvent, saveCalEvent, delCalEvent, loadCalEvents, calSelectDate, calNav, selectCalColor } from './features/calendar.js'
