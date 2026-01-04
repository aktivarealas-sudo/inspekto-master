/* Inspekto Lite - vanilla JS, no build tools
   Goals:
   - Capture-first in field (fast camera)
   - Local queue in IndexedDB (offline-first)
   - Review UI later (in car)
   - Print-to-PDF via browser (no heavy libs)
*/
const APP = {
  name: "Inspekto Lite",
  dbName: "inspekto_lite_db",
  dbVersion: 2,
  stores: {
    settings: "key",
    locations: "id",
    inspections: "id",
    equipment: "id",
    issues: "id",
    media: "id", // photos & audio blobs
  }
};

function uid(prefix="id"){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function fmt(ts){
  const d = new Date(ts);
  return d.toLocaleString(undefined, {year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit"});
}

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function toast(msg){
  const el = document.createElement("div");
  el.className = "notice";
  el.style.position="fixed";
  el.style.left="16px"; el.style.right="16px"; el.style.bottom="16px";
  el.style.zIndex="9999";
  el.style.background="rgba(18,25,35,.95)";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2400);
}

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(APP.dbName, APP.dbVersion);
    req.onupgradeneeded = (ev)=>{
      const db = req.result;
      // Create stores if missing
      const ensure = (name, keyPath)=>{
        if(!db.objectStoreNames.contains(name)){
          db.createObjectStore(name, {keyPath});
        }
      };
      ensure("settings", "key");
      ensure("locations", "id");
      ensure("inspections", "id");
      ensure("equipment", "id");
      ensure("issues", "id");
      ensure("media", "id");

      // Simple indexes
      const ins = req.transaction.objectStore("inspections");
      if(!ins.indexNames.contains("by_location")){
        ins.createIndex("by_location", "locationId", {unique:false});
      }
      const eq = req.transaction.objectStore("equipment");
      if(!eq.indexNames.contains("by_inspection")){
        eq.createIndex("by_inspection", "inspectionId", {unique:false});
      }
      const issues = req.transaction.objectStore("issues");
      if(!issues.indexNames.contains("by_equipment")){
        issues.createIndex("by_equipment", "equipmentId", {unique:false});
      }
      const media = req.transaction.objectStore("media");
      if(!media.indexNames.contains("by_parent")){
        media.createIndex("by_parent", ["parentType","parentId"], {unique:false});
      }
      if(!media.indexNames.contains("by_inspection")){
        media.createIndex("by_inspection", "inspectionId", {unique:false});
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function tx(storeNames, mode="readonly"){
  const db = await openDB();
  const t = db.transaction(storeNames, mode);
  const stores = {};
  (Array.isArray(storeNames)?storeNames:[storeNames]).forEach(s=> stores[s]=t.objectStore(s));
  return {db, t, stores, done: new Promise((res, rej)=>{ t.oncomplete=res; t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);} )};
}

async function put(store, value){
  const {stores, done} = await tx([store], "readwrite");
  stores[store].put(value);
  await done;
  return value;
}

async function del(store, key){
  const {stores, done} = await tx([store], "readwrite");
  stores[store].delete(key);
  await done;
}

async function get(store, key){
  const {stores} = await tx([store], "readonly");
  return new Promise((resolve, reject)=>{
    const req = stores[store].get(key);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}

async function all(store){
  const {stores} = await tx([store], "readonly");
  return new Promise((resolve, reject)=>{
    const req = stores[store].getAll();
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = ()=> reject(req.error);
  });
}

async function byIndex(store, indexName, value){
  const {stores} = await tx([store], "readonly");
  return new Promise((resolve, reject)=>{
    const idx = stores[store].index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = ()=> reject(req.error);
  });
}

async function getSetting(key, fallback=null){
  const row = await get("settings", key);
  return row ? row.value : fallback;
}

async function setSetting(key, value){
  await put("settings", {key, value, updatedAt: Date.now()});
}

async function ensureDefaults(){
  const defaults = {
    issueTypes: [
      {id:"finger_trap", label:"Fastklemming (finger)"},
      {id:"head_neck", label:"Fastklemming (hode/hals)"},
      {id:"sharp_edge", label:"Skarp kant / kuttfare"},
      {id:"loose_parts", label:"Løse deler / fester"},
      {id:"wear_chain", label:"Slitasje kjetting / oppheng"},
      {id:"impact_surface", label:"Støtunderlag / fallområde"},
      {id:"label_missing", label:"Manglende merking / skilt"},
      {id:"rot", label:"Råte i bærende konstruksjon"},
      {id:"other", label:"Annet"}
    ],
    severity: [
      {id:"A", label:"A (kritisk)"},
      {id:"B", label:"B (alvorlig)"},
      {id:"C", label:"C (mindre)"},
      {id:"U", label:"U (må risikovurderes)"},
      {id:"OBS", label:"Observasjon"}
    ],
    uploadEndpoint: "", // optional: your server URL
  };

  for(const [k,v] of Object.entries(defaults)){
    const existing = await get("settings", k);
    if(!existing) await setSetting(k, v);
  }
}

function mustServeSecure(){
  // Service Worker + MediaRecorder require https or localhost
  const ok = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return !ok;
}

async function registerSW(){
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("./service-worker.js");
    }catch(e){
      console.warn("SW register failed", e);
    }
  }
}

async function blobToDataURL(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function mediaThumbURL(mediaId){
  const m = await get("media", mediaId);
  if(!m || !m.blob) return "";
  return await blobToDataURL(m.blob);
}

/* --- Domain helpers --- */
async function createLocation({name, address="", notes=""}){
  const loc = {id: uid("loc"), name, address, notes, createdAt: Date.now(), updatedAt: Date.now()};
  await put("locations", loc);
  return loc;
}

async function createInspection({locationId, kind="annual"}){
  const ins = {id: uid("ins"), locationId, kind, status:"capturing", createdAt: Date.now(), updatedAt: Date.now()};
  await put("inspections", ins);
  await setSetting("activeInspectionId", ins.id);
  return ins;
}

async function activeInspection(){
  const id = await getSetting("activeInspectionId", "");
  if(!id) return null;
  return await get("inspections", id);
}

async function endInspection(inspectionId){
  const ins = await get("inspections", inspectionId);
  if(!ins) return;
  ins.status = "review";
  ins.updatedAt = Date.now();
  await put("inspections", ins);
}

async function createEquipment({inspectionId, title, vendor="", equipmentNo="", addressOverride=""}){
  const eq = {
    id: uid("eq"),
    inspectionId,
    title,
    vendor,
    equipmentNo,
    addressOverride,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    coverMediaId: "",
    signMediaId: ""
  };
  await put("equipment", eq);
  return eq;
}

async function createIssue({equipmentId, issueTypeId, severityId, comment=""}){
  const issue = {
    id: uid("iss"),
    equipmentId,
    issueTypeId,
    severityId,
    comment,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mediaIds: [] // up to 4
  };
  await put("issues", issue);
  return issue;
}

async function addMedia({inspectionId, parentType, parentId, tag, blob, mime, note=""}){
  const m = {
    id: uid("m"),
    inspectionId,
    parentType, // "inspection" | "equipment" | "issue"
    parentId,
    tag, // "equipment" | "sign" | "issue" | "overview" | "audio"
    blob,
    mime,
    note,
    createdAt: Date.now(),
    uploaded: false,
    uploadError: ""
  };
  await put("media", m);
  return m;
}

async function attachMediaToIssue(issueId, mediaId){
  const issue = await get("issues", issueId);
  if(!issue) return;
  if(!issue.mediaIds.includes(mediaId)){
    issue.mediaIds.push(mediaId);
    issue.mediaIds = issue.mediaIds.slice(0, 4);
    issue.updatedAt = Date.now();
    await put("issues", issue);
  }
}

async function setEquipmentCover(eqId, mediaId, kind="cover"){
  const eq = await get("equipment", eqId);
  if(!eq) return;
  if(kind==="cover") eq.coverMediaId = mediaId;
  if(kind==="sign") eq.signMediaId = mediaId;
  eq.updatedAt = Date.now();
  await put("equipment", eq);
}

async function listInspectionBundle(inspectionId){
  const ins = await get("inspections", inspectionId);
  const loc = ins ? await get("locations", ins.locationId) : null;
  const equipment = await byIndex("equipment","by_inspection", inspectionId);
  const issues = [];
  for(const eq of equipment){
    const eqIssues = await byIndex("issues","by_equipment", eq.id);
    issues.push(...eqIssues);
  }
  const media = await byIndex("media","by_inspection", inspectionId);
  return {ins, loc, equipment, issues, media};
}

/* --- Optional upload (simple POST) ---
   Provide a server endpoint to accept:
   POST /upload  (multipart form: mediaId, inspectionId, tag, file)
*/
async function tryUploadPending(){
  const endpoint = await getSetting("uploadEndpoint", "");
  if(!endpoint) return {ok:false, reason:"no-endpoint"};
  const media = await all("media");
  const pending = media.filter(m=>!m.uploaded && m.blob && m.mime && m.tag !== "audio");
  if(pending.length === 0) return {ok:true, uploaded:0};

  let uploadedCount = 0;
  for(const m of pending.slice(0, 12)){ // batch
    try{
      const fd = new FormData();
      fd.append("mediaId", m.id);
      fd.append("inspectionId", m.inspectionId);
      fd.append("tag", m.tag);
      fd.append("file", m.blob, `${m.id}.jpg`);
      const res = await fetch(endpoint.replace(/\/$/,"") + "/upload", {method:"POST", body: fd});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      m.uploaded = true;
      m.uploadError = "";
      await put("media", m);
      uploadedCount++;
    }catch(e){
      m.uploadError = String(e?.message || e);
      await put("media", m);
    }
  }
  return {ok:true, uploaded: uploadedCount};
}

// Lightweight "AI suggestions" placeholder: only uses tags and ordering.
// Real CV/OCR should be added server-side later.
function conservativeSuggestions(media){
  // Group by tag first. Keep original capture order (createdAt).
  const sorted = [...media].sort((a,b)=>a.createdAt-b.createdAt);
  return {
    equipment: sorted.filter(m=>m.tag==="equipment"),
    sign: sorted.filter(m=>m.tag==="sign"),
    issue: sorted.filter(m=>m.tag==="issue"),
    overview: sorted.filter(m=>m.tag==="overview"),
    audio: sorted.filter(m=>m.tag==="audio"),
  };
}

export {
  APP, uid, fmt, qs, qsa, toast,
  ensureDefaults, mustServeSecure, registerSW,
  getSetting, setSetting,
  createLocation, createInspection, activeInspection, endInspection,
  createEquipment, createIssue, addMedia, attachMediaToIssue, setEquipmentCover,
  listInspectionBundle, mediaThumbURL,
  tryUploadPending, conservativeSuggestions,
  get, put, del, all, byIndex, blobToDataURL
};
