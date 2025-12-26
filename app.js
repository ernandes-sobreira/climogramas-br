const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Config UX/performance
const MIN_QUERY = 2;      // mínimo de letras pra buscar
const MAX_RESULTS = 60;   // quantos itens aparecem na lista
const MAP_MAX_POINTS = 400; // limite de pontos no mapa (segurança)

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

function setHint(text){
  const list = document.getElementById("list");
  list.innerHTML = `<div style="padding:14px;color:#64748b;font-size:13px;line-height:1.4">${text}</div>`;
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

  // tenta auto-selecionar 2024 se existir
  if(years.includes(2024)) sel.value = "2024";
}

function renderList(){
  const countNote = document.getElementById("countNote");
  const list = document.getElementById("list");

  // Se não tem filtro ativo: deixa mensagem (não lista tudo)
  const q = document.getElementById("q").value.trim();
  if(q.length < MIN_QUERY){
    countNote.textContent = `Digite pelo menos ${MIN_QUERY} letras`;
    setHint(`🔎 Comece digitando acima (mínimo <b>${MIN_QUERY}</b> letras).<br/>Ex.: <b>Cuiabá</b>, <b>MT</b>, <b>A901</b>.`);
    return;
  }

  countNote.textContent = `${Math.min(filtered.length, MAX_RESULTS)} de ${filtered.length} estações`;
  list.innerHTML = "";

  const shown = filtered.slice(0, MAX_RESULTS);
  for(const st of shown){
    const div = document.createElement("div");
    div.className = "item" + (selectedStation?.id === st.id ? " active" : "");
    div.innerHTML = `
      <div class="name">${st.name} <span style="color:#64748b;font-weight:700">(${st.uf})</span></div>
      <div class="meta">ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • anos: ${st.years?.length || 0}</div>
    `;
    div.onclick = () => selectStation(st.id, true);
    list.appendChild(div);
  }

  // se tem mais resultados que o limite
  if(filtered.length > MAX_RESULTS){
    const more = document.createElement("div");
    more.style.padding = "10px 12px";
    more.style.color = "#64748b";
    more.style.fontSize = "12px";
    more.innerHTML = `Mostrando os <b>${MAX_RESULTS}</b> primeiros. Refine a busca para ver os demais.`;
    list.appendChild(more);
  }
}

function applyFilter(){
  const q = document.getElementById("q").value.trim().toLowerCase();

  if(q.length < MIN_QUERY){
    filtered = [];
    renderList();
    renderMapMarkers();
    return;
  }

  filtered = STATIONS.filter(st => {
    const s = `${st.id} ${st.name} ${st.uf}`.toLowerCase();
    return s.includes(q);
  });

  // Ordena por UF e nome para ficar bonito
  filtered.sort((a,b) => (a.uf+a.name).localeCompare(b.uf+b.name, "pt-BR"));

  renderList();
  renderMapMarkers();
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

  // sem busca ativa = nada no mapa (leve e bonito)
  const q = document.getElementById("q").value.trim();
  if(q.length < MIN_QUERY) return;

  const shown = filtered.slice(0, MAP_MAX_POINTS);

  for(const st of shown){
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

  document.getElementById("stationTitle").textContent = `${st.name} (${st.uf})`;
  document.getElementById("stationMeta").textContent =
    `ID ${st.id} • ${niceCoord(st.lat)}, ${niceCoord(st.lon)} • alt: ${st.alt ?? "—"} m`;

  setYearOptions(st);

  // re-render para marcar ativo
  renderList();
  renderMapMarkers();

  if(panTo && st.lat != null && st.lon != null){
    map.setView([st.lat, st.lon], 8, { animate:true });
  }

  const year = document.getElementById("year").value;
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
    document.getElementById("cards").innerHTML = "";
    document.getElementById("chart").innerHTML = `<div style="padding:14px;color:#b91c1c">
      Não encontrei dados para <b>${stationId}</b> em <b>${year}</b>.
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
  if(tracePrecMean) traces.splice(1, 0, tracePrecMean);
  if(traceTempMean) traces.push(traceTempMean);

  const layout = {
    autosize: true,
    height: 520,
    margin:{ l:60, r:60, t:15, b:95 },
    hovermode:"x unified",
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

  // Carrega estações
  const r = await fetch("assets/stations.json", { cache:"no-store" });
  STATIONS = await r.json();

  // Ordena (caso venha bagunçado)
  STATIONS.sort((a,b) => (a.uf+a.name).localeCompare(b.uf+b.name, "pt-BR"));

  // Estado inicial (nada listado)
  filtered = [];
  document.getElementById("countNote").textContent = `Digite pelo menos ${MIN_QUERY} letras`;
  setHint(`🔎 Comece digitando acima (mínimo <b>${MIN_QUERY}</b> letras).<br/>Ex.: <b>Cuiabá</b>, <b>MT</b>, <b>A901</b>.`);

  // listeners
  document.getElementById("q").addEventListener("input", applyFilter);

  document.getElementById("year").addEventListener("change", async () => {
    if(!selectedStation) return;
    const year = document.getElementById("year").value;
    await loadAndPlot(selectedStation.id, year);
  });

  document.getElementById("btnExportPNG").addEventListener("click", () => {
    alert("Dica: use o ícone de câmera dentro do gráfico (Plotly) para exportar PNG.");
  });

  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);

  window.addEventListener("resize", () => {
    const el = document.getElementById("chart");
    if(el && el.data) Plotly.Plots.resize(el);
  });
}

bootstrap();
