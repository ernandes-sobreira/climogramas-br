const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

let STATIONS = [];
let filtered = [];
let selectedStation = null;
let map, markersLayer;

function fmt(n, digits=1){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function niceCoord(x){
  if(x === null || x === undefined) return "—";
  return (Math.round(x*10000)/10000).toString();
}

function setYearOptions(st){
  const sel = document.getElementById("year");
  sel.innerHTML = "";
  const years = (st?.years || []).slice().sort((a,b)=>b-a);

  if(years.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem anos";
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  for(const y of years){
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
}

function renderList(){
  const list = document.getElementById("list");
  list.innerHTML = "";
  document.getElementById("countNote").textContent = `${filtered.length} estações`;

  for(const st of filtered){
    const div = document.createElement("div");
    div.className = "item" + (selectedStation?.id === st.id ? " active" : "");
    div.innerHTML = `
      <div class="name">${st.name} <span style="color:#64748b;font-weight:700">(${st.uf})</span></div>
      <div class="meta">ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • anos: ${st.years?.length || 0}</div>
    `;
    div.onclick = () => selectStation(st.id, true);
    list.appendChild(div);
  }
}

function applyFilter(){
  const q = document.getElementById("q").value.trim().toLowerCase();
if(q.length < 2){
  filtered = [];
  renderList();
  renderMapMarkers();
  return;
}
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

    const m = L.circleMarker([st.lat, st.lon], {
      radius: (selectedStation?.id === st.id) ? 7 : 5,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.65
    }).addTo(markersLayer);

    m.bindTooltip(`<b>${st.name} (${st.uf})</b><br/>ID ${st.id}<br/>anos: ${st.years?.length || 0}`);
    m.on("click", () => selectStation(st.id, false));
  }
}

async function selectStation(id, panTo){
  const st = STATIONS.find(s => s.id === id);
  if(!st) return;

  selectedStation = st;
  renderList();
  renderMapMarkers();

  document.getElementById("stationTitle").textContent = `${st.name} (${st.uf})`;
  document.getElementById("stationMeta").textContent =
    `ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • alt: ${st.alt ?? "—"} m`;

  setYearOptions(st);
  const year = document.getElementById("year").value;

  if(panTo && st.lat != null && st.lon != null){
    map.setView([st.lat, st.lon], 8, { animate:true });
  }

  if(year) await loadAndPlot(st.id, year);
}

async function loadAndPlot(stationId, year){
  const url = `assets/data/${stationId}/${year}.json`;
  let data;

  try{
    const r = await fetch(url, { cache:"no-store" });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  }catch(err){
    document.getElementById("chart").innerHTML = `<div style="padding:14px;color:#b91c1c">
      Não encontrei dados para esta estação/ano (${stationId}/${year}).
    </div>`;
    return;
  }

  window.__lastData = data;
  renderCards(data);
  plotClimogram(data);
}

function renderCards(d){
  const c = document.getElementById("cards");
  const a = d.annual || {};

  const cards = [
    ["T mín (ano)", `${fmt(a.tmin,1)} °C`],
    ["T méd (ano)", `${fmt(a.tmean,1)} °C`],
    ["T máx (ano)", `${fmt(a.tmax,1)} °C`],
    ["Chuva total", `${fmt(a.p_total,1)} mm`],
    ["Chuva mín (mês)", `${fmt(a.p_month_min,1)} mm`],
    ["Chuva méd (mês)", `${fmt(a.p_month_mean,1)} mm`],
    ["Chuva máx (mês)", `${fmt(a.p_month_max,1)} mm`],
    ["Completude", `${fmt((a.coverage||0)*100,0)} %`],
  ];

  c.innerHTML = cards.map(([k,v]) => `
    <div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
}

function plotClimogram(d){
  const months = d.months || [];
  const x = months.map(m => MONTHS[m.m-1]);
  const t = months.map(m => m.tmean);
  const p = months.map(m => m.p);

  const a = d.annual || {};
  const pMean = a.p_month_mean ?? null;
  const tMean = a.tmean ?? null;

  const tracePrec = {
    x, y: p,
    type:"bar",
    name:"Precipitação mensal (mm)",
    yaxis:"y",
    opacity:0.85
  };

  const tracePrecMean = (pMean !== null) ? {
    x, y: x.map(_ => pMean),
    type:"scatter",
    mode:"lines",
    name:"Precipitação média mensal (ano)",
    yaxis:"y",
    line:{ dash:"dot", width:2 }
  } : null;

  const traceTemp = {
    x, y: t,
    type:"scatter",
    mode:"lines+markers",
    name:"Temp. média mensal (°C)",
    yaxis:"y2",
    line:{ width:3 },
    marker:{ size:6 }
  };

  const traceTempMean = (tMean !== null) ? {
    x, y: x.map(_ => tMean),
    type:"scatter",
    mode:"lines",
    name:"Temp. média anual (°C)",
    yaxis:"y2",
    line:{ dash:"dot", width:2 }
  } : null;

  const traces = [tracePrec, traceTemp].filter(Boolean);
  if(tracePrecMean) traces.splice(1, 0, tracePrecMean); // coloca a média da chuva antes da temp
  if(traceTempMean) traces.push(traceTempMean);

  const layout = {
    autosize: true,
    height: Math.max(460, Math.floor(window.innerHeight * 0.55)),
    margin:{ l:60, r:60, t:20, b:95 },
    hovermode:"x unified",

    // legenda EMBAIXO (resolve “amassado”)
    legend:{ orientation:"h", x:0, y:-0.25, yanchor:"top" },

    xaxis:{ title:"Mês" },
    yaxis:{
      title:"Precipitação (mm)",
      rangemode:"tozero",
      gridcolor:"rgba(15,23,42,0.08)"
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
  }).then(() => {
    // garante ajuste final do tamanho (GitHub Pages/Chrome às vezes precisa)
    setTimeout(() => Plotly.Plots.resize("chart"), 80);
  });
}


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

async function bootstrap(){
  initMap();

  const r = await fetch("assets/stations.json", { cache:"no-store" });
  STATIONS = await r.json();

  STATIONS.sort((a,b) => (a.uf+a.name).localeCompare(b.uf+b.name, "pt-BR"));

  filtered = STATIONS.slice();
  renderList();
  renderMapMarkers();

  document.getElementById("q").addEventListener("input", applyFilter);

  document.getElementById("year").addEventListener("change", async () => {
    if(!selectedStation) return;
    const year = document.getElementById("year").value;
    await loadAndPlot(selectedStation.id, year);
  });

  document.getElementById("btnExportPNG").addEventListener("click", async () => {
    alert("Dica: use o ícone de câmera no gráfico (Plotly) para exportar PNG.");
  });

  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
}

bootstrap();
window.addEventListener("resize", () => {
  const el = document.getElementById("chart");
  if(el && el.data) Plotly.Plots.resize(el);
});



