/* app.js — Transforma-Ação Climática (INMET)
   Versão FINAL — multi-anos via assets/years.json
   Estrutura:
   - assets/stations.json
   - assets/years.json
   - assets/data/<stationId>/<year>.json
*/

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DEFAULT_YEAR = 2024;

let AVAILABLE_YEARS = [];
let STATIONS = [];
let filtered = [];
let selectedStation = null;

let map, markersLayer;
const DATA_CACHE = new Map();

function el(id){ return document.getElementById(id); }
function fmt(n,d=1){ return (n==null||isNaN(n))?"—":Number(n).toFixed(d); }
function niceCoord(x){ return (x==null||isNaN(x))?"—":(Math.round(x*10000)/10000); }
function safeUpper(s){ return (s ?? "").toString(); }
function byUFName(a,b){
  return (`${a.uf}${a.name}`).localeCompare(`${b.uf}${b.name}`,"pt-BR",{sensitivity:"base"});
}

// ======= YEARS =======
async function loadAvailableYears(){
  const r = await fetch("assets/years.json",{cache:"no-store"});
  AVAILABLE_YEARS = await r.json();
  AVAILABLE_YEARS.sort((a,b)=>b-a);
}

fsetYearOptions();

// escolhe um ano que realmente exista para a estação
let year = el("year").value;
if (selectedStation.years && !selectedStation.years.includes(Number(year))) {
  year = String(selectedStation.years[0]);
  el("year").value = year;
}
  sel.innerHTML = "";
  for(const y of AVAILABLE_YEARS){
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    sel.appendChild(o);
  }
  sel.value = AVAILABLE_YEARS.includes(DEFAULT_YEAR)
    ? String(DEFAULT_YEAR)
    : String(AVAILABLE_YEARS[0]);
  sel.disabled = false;
}

// ======= LIST =======
function renderList(){
  const list = el("list");
  list.innerHTML = "";
  el("countNote").textContent = `${filtered.length} estações`;

  for(const st of filtered){
    const div = document.createElement("div");
    div.className = "item" + (selectedStation?.id === st.id ? " active" : "");
    div.innerHTML = `
      <div class="name">${safeUpper(st.name)} <span style="color:#64748b;font-weight:800">(${st.uf})</span></div>
      <div class="meta">ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)}</div>
    `;
    div.onclick = () => selectStation(st.id,true);
    list.appendChild(div);
  }
}

function applyFilter(){
  const q = el("q").value.trim().toLowerCase();
  filtered = q
    ? STATIONS.filter(st => `${st.id} ${st.name} ${st.uf}`.toLowerCase().includes(q))
    : STATIONS.slice();
  renderList();
  renderMapMarkers();
}

// ======= MAP =======
function initMap(){
  map = L.map("map").setView([-14.2,-55.9],4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:18, attribution:"&copy; OpenStreetMap"
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function renderMapMarkers(){
  markersLayer.clearLayers();
  for(const st of filtered){
    if(st.lat==null||st.lon==null) continue;
    const m = L.circleMarker([st.lat,st.lon],{
      radius:selectedStation?.id===st.id?7:5,
      weight:1, fillOpacity:.65
    }).addTo(markersLayer);
    m.bindTooltip(`<b>${st.name} (${st.uf})</b><br>ID ${st.id}`);
    m.on("click",()=>selectStation(st.id,false));
  }
}

// ======= SELECT =======
async function selectStation(id,pan){
  const st = STATIONS.find(s=>s.id===id);
  if(!st) return;
  selectedStation = st;

  renderList();
  renderMapMarkers();

  el("stationTitle").textContent = `${st.name} (${st.uf})`;
  el("stationMeta").textContent = `ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)}`;

  setYearOptions();
  const year = el("year").value;

  if(pan && st.lat && st.lon) map.setView([st.lat,st.lon],8);
  await loadAndPlot(st.id,year);
}

// ======= FETCH =======
async function fetchJSON(url){
  const r = await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error(url);
  return r.json();
}

async function loadAndPlot(stationId,year){
  const key = `${stationId}:${year}`;
  const url = `assets/data/${stationId}/${year}.json`;

  let d;
  try{
    d = DATA_CACHE.has(key) ? DATA_CACHE.get(key) : await fetchJSON(url);
    DATA_CACHE.set(key,d);
  }catch{
    el("chart").innerHTML = `<div style="padding:14px;color:#b91c1c">
      Dados não encontrados: ${url}
    </div>`;
    return;
  }

  window.__lastData = d;
  renderCards(d);
  renderInsights(d);
  plotClimogram(d);
}

// ======= CARDS =======
function renderCards(d){
  const a = d.annual || {};
  el("cards").innerHTML = [
    ["T mín",`${fmt(a.tmin)} °C`],
    ["T méd",`${fmt(a.tmean)} °C`],
    ["T máx",`${fmt(a.tmax)} °C`],
    ["Chuva total",`${fmt(a.p_total)} mm`],
  ].map(([k,v])=>`<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

// ======= INSIGHTS =======
function renderInsights(d){
  const b = el("insights");
  if(!b) return;
  const m = d.months || [];
  if(!m.length){ b.innerHTML=""; return; }

  const maxP = m.reduce((a,b)=>b.p>a.p?b:a);
  const minP = m.reduce((a,b)=>b.p<a.p?b:a);

  b.innerHTML = `
    <div class="insTitle">Resumo climático</div>
    <div>📍 ${d.station} • ${d.year}</div>
    <div>🌧️ Mais chuvoso: ${MONTHS[maxP.m-1]} (${fmt(maxP.p)} mm)</div>
    <div>🏜️ Mais seco: ${MONTHS[minP.m-1]} (${fmt(minP.p)} mm)</div>
  `;
}

// ======= PLOT =======
function plotClimogram(d){
  const x = d.months.map(m=>MONTHS[m.m-1]);
  const p = d.months.map(m=>m.p);
  const t = d.months.map(m=>m.tmean);

  Plotly.newPlot("chart",[
    {x,y:p,type:"bar",name:"Precipitação (mm)"},
    {x,y:t,type:"scatter",yaxis:"y2",name:"Temp (°C)"}
  ],{
    yaxis:{title:"Precipitação"},
    yaxis2:{title:"Temperatura",overlaying:"y",side:"right"},
    margin:{t:20}
  },{responsive:true});
}

// ======= EXPORT =======
function exportCSV(){
  if(!window.__lastData) return;
  const d = window.__lastData;
  const rows = [["station","year","month","tmean","precip"]];
  d.months.forEach(m=>rows.push([d.station,d.year,m.m,m.tmean,m.p]));
  const blob = new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${d.station}_${d.year}.csv`;
  a.click();
}

// ======= BOOTSTRAP =======
async function bootstrap(){
  initMap();
  await loadAvailableYears();

  STATIONS = await fetchJSON("assets/stations.json");
  STATIONS.sort(byUFName);
  filtered = STATIONS.slice();

  renderList();
  renderMapMarkers();

  el("q").addEventListener("input",applyFilter);
  el("year").addEventListener("change",()=>selectedStation && loadAndPlot(selectedStation.id,el("year").value));
  el("btnExportCSV").addEventListener("click",exportCSV);

  el("chart").innerHTML = `<div style="padding:14px;color:#475569">
    Selecione uma estação para ver o climograma.
  </div>`;
}

bootstrap();
