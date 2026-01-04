import {qs, qsa, toast, fmt, mustServeSecure, registerSW, ensureDefaults, getSetting, setSetting} from "./app.js";

export async function initShell(active=""){
  await ensureDefaults();
  await registerSW();

  const warn = qs("#secureWarn");
  if(warn){
    warn.style.display = mustServeSecure() ? "block" : "none";
  }

  // Highlight nav
  qsa("[data-nav]").forEach(a=>{
    if(a.dataset.nav === active) a.classList.add("primary");
  });

  // Footer quick info
  const info = qs("#activeInfo");
  if(info){
    const activeId = await getSetting("activeInspectionId", "");
    info.textContent = activeId ? `Aktiv inspeksjon: ${activeId}` : "Ingen aktiv inspeksjon";
  }
}

export function setBusy(btn, busy=true, labelBusy="Jobber…"){
  if(!btn) return;
  if(busy){
    btn.dataset._label = btn.textContent;
    btn.textContent = labelBusy;
    btn.disabled = true;
  }else{
    btn.textContent = btn.dataset._label || btn.textContent;
    btn.disabled = false;
  }
}
