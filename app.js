/* app.js — Transforma-Ação Climática (INMET)
   Versão: Mobile-friendly + Insights + sem "Completude"
   Estrutura esperada:
   - assets/stations.json
   - assets/data/<stationId>/<year>.json
*/

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DEFAULT_YEAR = 2024;

let STATIONS = [];
let filtered = [];
let selectedStation = null;

let map, markersLayer;
const DATA_CACHE = new Map();

function el(id){ return document.getElementById(id); }

function fmt(n, digits=1){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function niceCoord(x){
  if(x === null || x === undefined || Number.isNaN(x)) return "—";
  return (Math.round(Number(x)*10000)/10000).toString();
}

function byUFName(a,b){
  return (String(a.uf||"")+String(a.name||"")).localeCompare(
    String(b.uf||"")+String(b.name||""),
    "pt-BR",
    { sensitivity:"base" }
  );
}

function safeUpper(s){
  return (s ?? "").toString();
}

// ======= UI: ano =======
function setYearOptions(st){
  const sel = el("year");
  sel.innerHTML = "";

  let years = Array.isArray(st?.years) ? st.years.slice() : [];
  if(years.length === 0) years = [DEFAULT_YEAR];
  years.sort((a,b)=> b-a);

  for(const y of years){
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }

  sel.value = years.includes(DEFAULT_YEAR) ? String(DEFAULT_YEAR) : String(years[0]);
  sel.disabled = false;
}

// ======= Lista =======
function renderList(){
  const list = el("list");
  list.innerHTML = "";
  el("countNote").textContent = `${filtered.length} estações`;

  for(const st of filtered){
    const div = document.createElement("div");
    div.className = "item" + (selectedStation?.id === st.id ? " active" : "");
    div.innerHTML = `
      <div class="name">${safeUpper(st.name)} <span style="color:#64748b;font-weight:800">(${st.uf})</span></div>
      <div class="meta">ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • anos: ${st.years?.length || 0}</div>
    `;
    div.onclick = () => selectStation(st.id, true);
    list.appendChild(div);
  }
}

function applyFilter(){
  const q = el("q").value.trim().toLowerCase();
  if(!q){
    filtered = STATIONS.slice();
  } else {
    filtered = STATIONS.filter(st => {
      const s = `${st.id} ${st.name} ${st.uf}`.toLowerCase();
      return s.includes(q);
    });
  }
  renderList();
  renderMapMarkers();
}

function showAll(){
  el("q").value = "";
  filtered = STATIONS.slice();
  renderList();
  renderMapMarkers();
  try{ el("list").scrollTop = 0; }catch(e){}
}

// ======= Mapa =======
function initMap(){
  map = L.map("map", { zoomControl:true }).setView([-14.2, -55.9], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function renderMapMarkers(){
  markersLayer.clearLayers();

  for(const st of filtered){
    if(st.lat == null || st.lon == null) continue;
    const isSelected = (selectedStation?.id === st.id);

    const m = L.circleMarker([st.lat, st.lon], {
      radius: isSelected ? 7 : 5,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.65
    }).addTo(markersLayer);

    m.bindTooltip(`<b>${safeUpper(st.name)} (${st.uf})</b><br/>ID ${st.id}<br/>anos: ${st.years?.length || 0}`);
    m.on("click", () => selectStation(st.id, false));
  }
}

// ======= Seleção =======
async function selectStation(id, panTo){
  const st = STATIONS.find(s => s.id === id);
  if(!st) return;

  selectedStation = st;
  renderList();
  renderMapMarkers();

  el("stationTitle").textContent = `${safeUpper(st.name)} (${st.uf})`;
  el("stationMeta").textContent = `ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • alt: ${st.alt ?? "—"} m`;

  setYearOptions(st);
  const year = el("year").value;

  if(panTo && st.lat != null && st.lon != null){
    map.setView([st.lat, st.lon], 8, { animate:true });
  }

  if(year) await loadAndPlot(st.id, year);

  // no celular, fecha painel de estações automaticamente
  if(window.innerWidth <= 1100){
    closeStations();
  }
}

// ======= Fetch =======
async function fetchJSON(url){
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function loadAndPlot(stationId, year){
  const key = `${stationId}:${year}`;
  const url = `assets/data/${stationId}/${year}.json`;

  let data;

  try{
    if(DATA_CACHE.has(key)){
      data = DATA_CACHE.get(key);
    } else {
      data = await fetchJSON(url);
      DATA_CACHE.set(key, data);
    }
  }catch(err){
    el("cards").innerHTML = "";
    const insights = el("insights");
    if(insights) insights.innerHTML = "";
    el("chart").innerHTML = `<div style="padding:14px;color:#b91c1c;font-weight:700">
      Não encontrei dados para esta estação/ano (${stationId}/${year}).<br/>
      <span style="font-weight:500;color:#7f1d1d">Verifique se existe: <code>${url}</code></span>
    </div>`;
    return;
  }

  window.__lastData = data;

  renderCards(data);
  renderInsights(data);
  plotClimogram(data);

  requestAnimationFrame(() => {
    try{ Plotly.Plots.resize("chart"); }catch(e){}
  });
}

// ======= Cards (SEM COMPLETUDE) =======
function renderCards(d){
  const c = el("cards");
  const a = d.annual || {};

  const cards = [
    ["T mín (ano)", `${fmt(a.tmin,1)} °C`],
    ["T méd (ano)", `${fmt(a.tmean,1)} °C`],
    ["T máx (ano)", `${fmt(a.tmax,1)} °C`],
    ["Chuva total", `${fmt(a.p_total,1)} mm`],
    ["Chuva mín (mês)", `${fmt(a.p_month_min,1)} mm`],
    ["Chuva méd (mês)", `${fmt(a.p_month_mean,1)} mm`],
    ["Chuva máx (mês)", `${fmt(a.p_month_max,1)} mm`],
  ];

  c.innerHTML = cards.map(([k,v]) => `
    <div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
}

// ======= Texto “policy maker” (insights do ano) =======
function renderInsights(d){
  const box = el("insights");
  if(!box) return;

  const months = Array.isArray(d.months) ? d.months.slice() : [];
  if(months.length === 0){
    box.innerHTML = "";
    return;
  }

  // só considera meses com valores numéricos válidos
  const mm = months
    .filter(m => Number.isFinite(m.m))
    .map(m => ({
      m: m.m,
      name: MONTHS[(m.m||1)-1] ?? `M${m.m}`,
      t: Number.isFinite(m.tmean) ? m.tmean : null,
      p: Number.isFinite(m.p) ? m.p : null
    }));

  const validP = mm.filter(x => x.p !== null);
  const validT = mm.filter(x => x.t !== null);

  const maxP = validP.length ? validP.reduce((a,b)=> (b.p>a.p?b:a)) : null;
  const minP = validP.length ? validP.reduce((a,b)=> (b.p<a.p?b:a)) : null;

  const maxT = validT.length ? validT.reduce((a,b)=> (b.t>a.t?b:a)) : null;
  const minT = validT.length ? validT.reduce((a,b)=> (b.t<a.t?b:a)) : null;

  const stName = selectedStation ? `${selectedStation.name} (${selectedStation.uf})` : "esta estação";
  const year = d.year ?? "";

  const lines = [];

  lines.push(`<div class="insTitle">Resumo climático para tomada de decisão</div>`);
  lines.push(`<div class="insLine">📍 <b>${stName}</b> • Ano <b>${year}</b></div>`);

  if(maxP) lines.push(`<div class="insLine">🌧️ Mês mais chuvoso: <b>${maxP.name}</b> (${fmt(maxP.p,1)} mm)</div>`);
  if(minP) lines.push(`<div class="insLine">🏜️ Mês mais seco: <b>${minP.name}</b> (${fmt(minP.p,1)} mm)</div>`);
  if(maxT) lines.push(`<div class="insLine">🔥 Mês mais quente: <b>${maxT.name}</b> (${fmt(maxT.t,1)} °C)</div>`);
  if(minT) lines.push(`<div class="insLine">🧊 Mês mais fresco: <b>${minT.name}</b> (${fmt(minT.t,1)} °C)</div>`);

  // Extra “policymaker”: alerta simples de sazonalidade
  if(maxP && minP){
    const amp = maxP.p - minP.p;
    if(Number.isFinite(amp)){
      lines.push(`<div class="insHint">⚖️ Sazonalidade de chuva (máx − mín): <b>${fmt(amp,1)} mm</b> — útil para planejamento de drenagem, agricultura e risco de incêndios.</div>`);
    }
  }

  box.innerHTML = lines.join("");
}

// ======= Plot =======
function plotClimogram(d){
  const months = Array.isArray(d.months) ? d.months : [];
  const x = months.map(m => MONTHS[(m.m||1)-1] ?? "");
  const t = months.map(m => (m.tmean ?? null));
  const p = months.map(m => (m.p ?? null));
  const a = d.annual || {};

  const pMean = a.p_month_mean ?? null;
  const tMean = a.tmean ?? null;

  const traces = [];

  traces.push({
    x, y: p,
    type:"bar",
    name:"Precipitação mensal (mm)",
    yaxis:"y",
    opacity:0.85
  });

  if(pMean !== null){
    traces.push({
      x, y: x.map(_ => pMean),
      type:"scatter",
      mode:"lines",
      name:"Precipitação média mensal (ano)",
      yaxis:"y",
      line:{ dash:"dot", width:2 }
    });
  }

  traces.push({
    x, y: t,
    type:"scatter",
    mode:"lines+markers",
    name:"Temp. média mensal (°C)",
    yaxis:"y2",
    line:{ width:3 },
    marker:{ size:6 }
  });

  if(tMean !== null){
    traces.push({
      x, y: x.map(_ => tMean),
      type:"scatter",
      mode:"lines",
      name:"Temp. média anual (°C)",
      yaxis:"y2",
      line:{ dash:"dot", width:2 }
    });
  }

  const layout = {
    margin:{ l:62, r:62, t:18, b:48 },
    hovermode:"x unified",
    legend:{
      orientation:"h",
      y: -0.25,
      x: 0,
      font:{ size:12 }
    },
    xaxis:{ title:"Mês" },
    yaxis:{
      title:"Precipitação (mm)",
      rangemode:"tozero",
      gridcolor:"rgba(15,23,42,0.08)",
      zerolinecolor:"rgba(15,23,42,0.12)"
    },
    yaxis2:{
      title:"Temperatura (°C)",
      overlaying:"y",
      side:"right",
      gridcolor:"rgba(15,23,42,0.00)"
    },
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)"
  };

  Plotly.newPlot("chart", traces, layout, {
    displaylogo:false,
    responsive:true,
    toImageButtonOptions:{ format:"png", filename:`climograma_${d.station}_${d.year}` }
  });
}

// ======= Export =======
function exportCSV(){
  if(!window.__lastData) return;
  const d = window.__lastData;

  const rows = [["station","year","month","tmean_c","precip_mm"]];
  for(const m of d.months || []){
    rows.push([d.station, d.year, m.m, m.tmean ?? "", m.p ?? ""]);
  }

  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `climograma_${d.station}_${d.year}.csv`;
  a.click();
}

// ======= Anti-deformação (Plot resize) =======
function setupPlotResizeObserver(){
  const chartEl = el("chart");
  const wrap = chartEl?.parentElement;
  if(!wrap) return;

  const ro = new ResizeObserver(() => {
    try{ Plotly.Plots.resize("chart"); }catch(e){}
  });
  ro.observe(wrap);

  window.addEventListener("resize", () => {
    try{ Plotly.Plots.resize("chart"); }catch(e){}
  });
}

// ======= Mobile: painel de estações abre/fecha =======
let overlayEl = null;

function ensureOverlay(){
  if(overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "leftOverlay";
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function closeStations(){
  const leftPanel = document.querySelector(".panel.left");
  if(!leftPanel) return;
  leftPanel.classList.remove("open");
  const ov = ensureOverlay();
  ov.classList.remove("show");
  const btn = document.getElementById("btnStations");
  if(btn) btn.textContent = "Abrir";
}

function toggleStations(){
  const leftPanel = document.querySelector(".panel.left");
  if(!leftPanel) return;

  const isOpen = leftPanel.classList.toggle("open");
  const ov = ensureOverlay();
  ov.classList.toggle("show", isOpen);

  const btn = document.getElementById("btnStations");
  if(btn) btn.textContent = isOpen ? "Fechar" : "Abrir";
}

// ======= Bootstrap =======
async function bootstrap(){
  initMap();

  // stations.json
  const r = await fetch("assets/stations.json", { cache:"no-store" });
  STATIONS = await r.json();

  STATIONS.sort(byUFName);
  filtered = STATIONS.slice();

  renderList();
  renderMapMarkers();

  // eventos
  el("q").addEventListener("input", applyFilter);
  el("btnExportCSV").addEventListener("click", exportCSV);
  el("btnExportPNG").addEventListener("click", () => {
    alert("Dica: use o ícone de câmera no gráfico (Plotly) para exportar PNG.");
  });

  // botão opcional "Mostrar todas" (se existir)
  const btnAll = document.getElementById("btnAll");
  if(btnAll) btnAll.addEventListener("click", showAll);

  // mobile open/close (se existir no HTML)
  const btnStations = document.getElementById("btnStations");
  if(btnStations){
    btnStations.addEventListener("click", toggleStations);
  }

  const ov = ensureOverlay();
  ov.addEventListener("click", closeStations);

  // year change
  el("year").addEventListener("change", async () => {
    if(!selectedStation) return;
    const year = el("year").value;
    await loadAndPlot(selectedStation.id, year);
  });

  setupPlotResizeObserver();

  // estado inicial
  el("stationTitle").textContent = "Selecione uma estação";
  el("stationMeta").textContent = "—";
  el("cards").innerHTML = "";
  const insights = el("insights");
  if(insights) insights.innerHTML = "";

  el("chart").innerHTML = `<div style="padding:14px;color:#475569">
    Selecione uma estação na lista ou no mapa para ver o climograma.
  </div>`;

  // deixa o seletor de ano com 2024 visível antes de escolher estação
  const yearSel = el("year");
  yearSel.innerHTML = `<option value="${DEFAULT_YEAR}">${DEFAULT_YEAR}</option>`;
  yearSel.value = String(DEFAULT_YEAR);
  yearSel.disabled = false;
}

bootstrap();
