<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Dengue Brasil — Dashboard</title>
  <meta name="theme-color" content="#0ea5e9"/>

  <link rel="stylesheet" href="assets/style.css"/>

  <!-- PapaParse (CSV) -->
  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  <header class="top">
    <div class="brand">
      <div class="logo">🦟</div>
      <div>
        <h1>Dengue Brasil</h1>
        <p class="muted">Brasil → UF → Município (dados DATASUS em CSV)</p>
      </div>
    </div>

    <div class="actions">
      <label class="fileBtn">
        <input id="fileInput" type="file" accept=".csv,text/csv"/>
        Carregar CSV
      </label>
      <button id="btnUseDefault" class="ghost" title="Usa data/dengue.csv do repositório">Usar CSV do repositório</button>
    </div>
  </header>

  <main class="grid">
    <section class="card">
      <h2>Filtros</h2>

      <div class="row">
        <div class="field">
          <label>Escala</label>
          <select id="scale">
            <option value="br" selected>Brasil</option>
            <option value="uf">Estado (UF)</option>
            <option value="mun">Município</option>
          </select>
        </div>

        <div class="field">
          <label>UF</label>
          <select id="uf" disabled></select>
        </div>

        <div class="field">
          <label>Município</label>
          <select id="mun" disabled></select>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Período (Ano)</label>
          <div class="range">
            <select id="anoIni"></select>
            <span class="muted">até</span>
            <select id="anoFim"></select>
          </div>
        </div>

        <div class="field">
          <label>Visualização</label>
          <select id="metric">
            <option value="casos" selected>Casos (soma no ano)</option>
          </select>
        </div>
      </div>

      <div class="row">
        <button id="btnApply">Aplicar</button>
        <button id="btnExport" class="ghost">Baixar CSV filtrado</button>
      </div>

      <p id="status" class="hint">Carregue um CSV (ou use o do repositório).</p>
      <details class="help">
        <summary>Formato esperado do CSV</summary>
        <pre>ano,uf,municipio,casos</pre>
        <p class="muted">As colunas devem ter esses nomes. O app ignora colunas extras.</p>
      </details>
    </section>

    <section class="card">
      <h2>Série temporal</h2>
      <canvas id="chart" height="130"></canvas>
      <div class="kpis">
        <div class="kpi">
          <div class="kpiLabel">Total no período</div>
          <div id="kpiTotal" class="kpiValue">—</div>
        </div>
        <div class="kpi">
          <div class="kpiLabel">Pico anual</div>
          <div id="kpiPeak" class="kpiValue">—</div>
        </div>
        <div class="kpi">
          <div class="kpiLabel">Média anual</div>
          <div id="kpiMean" class="kpiValue">—</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Tabela (por ano)</h2>
      <div class="tableWrap">
        <table id="table">
          <thead>
            <tr><th>Ano</th><th>Casos</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </main>

  <footer class="foot muted">
    <span>Feito para rodar no GitHub Pages • CSV local (sem servidor)</span>
  </footer>

  <script src="assets/app.js"></script>
</body>
</html>
