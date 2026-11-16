const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.resolve('C:/Users/Usuario/Documents/HackatonNASA/output/historico_riesgo_grid.json');
const DEST_DIR = path.resolve(__dirname, '../public/data/calendar');

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

console.log(`Leyendo dataset histórico desde: ${SOURCE_PATH}...`);
const raw = fs.readFileSync(SOURCE_PATH, 'utf-8');
const data = JSON.parse(raw);

console.log(`Metadata cargada: ${data.metadata.total_cells} celdas, años ${data.metadata.min_year}-${data.metadata.max_year}`);

// 1. Metadata
const metadata = {
  title: data.metadata.title,
  region: data.metadata.region,
  min_year: data.metadata.min_year,
  max_year: data.metadata.max_year,
  current_year: data.metadata.current_year,
  current_closed_week: data.metadata.current_closed_week,
  min_date: data.metadata.min_date,
  max_date: data.metadata.max_date,
  total_years: data.metadata.total_years,
  total_archive_records_scanned: data.metadata.total_archive_records_scanned,
  direct_firms_points_count: data.metadata.direct_firms_points_count,
  cordoba_points_count: data.metadata.cordoba_points_count,
  san_luis_points_count: data.metadata.san_luis_points_count,
  yearly_breakdown: data.metadata.yearly_breakdown,
  generated_at_utc: data.metadata.generated_at_utc,
  source: 'NASA FIRMS (MODIS Terra/Aqua 1km & VIIRS SNPP/NOAA-20/NOAA-21 375m)',
};

fs.writeFileSync(path.join(DEST_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));

// Helper to accumulate weekly year data
function buildZoneData(filterProvince = null) {
  const filteredCells = filterProvince
    ? data.cells.filter((c) => c.province && c.province.toLowerCase().includes(filterProvince.toLowerCase()))
    : data.cells;

  // Compute 52-week baseline for this zone
  // For each week (1..52) and each year (2000..2025): sum detections across cells
  const weeklyYearlySums = {};
  for (let w = 1; w <= 52; w++) {
    weeklyYearlySums[w] = {};
    for (let yr = 2000; yr <= 2026; yr++) {
      weeklyYearlySums[w][yr] = { eq: 0, viirs: 0, modis: 0, frp_mw: 0 };
    }
  }

  for (const cell of filteredCells) {
    if (!cell.weeks) continue;
    for (let w = 1; w <= 52; w++) {
      const wData = cell.weeks[String(w)] || cell.weeks[w];
      if (wData && wData.by_year) {
        for (const [yrStr, yVals] of Object.entries(wData.by_year)) {
          const yr = parseInt(yrStr, 10);
          if (weeklyYearlySums[w][yr]) {
            weeklyYearlySums[w][yr].eq += (yVals.eq || 0);
            weeklyYearlySums[w][yr].viirs += (yVals.viirs || 0);
            weeklyYearlySums[w][yr].modis += (yVals.modis || 0);
            weeklyYearlySums[w][yr].frp_mw += (yVals.frp_mw || 0);
          }
        }
      }
    }
  }

  // Calculate baseline mean & std across closed baseline years (2000-2025)
  const baseline = [];
  for (let w = 1; w <= 52; w++) {
    const historicalVals = [];
    for (let yr = 2000; yr <= 2025; yr++) {
      historicalVals.push(weeklyYearlySums[w][yr].eq);
    }
    const mean = historicalVals.reduce((a, b) => a + b, 0) / historicalVals.length;
    const variance = historicalVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / historicalVals.length;
    const std = Math.sqrt(variance);
    baseline.push({
      week: w,
      baseline_mean: Math.round(mean * 100) / 100,
      baseline_std: Math.round(std * 100) / 100,
    });
  }

  // Format years matrix: 2000 to 2026
  const matrix = {};
  for (let yr = 2000; yr <= 2026; yr++) {
    matrix[yr] = [];
    for (let w = 1; w <= 52; w++) {
      const entry = weeklyYearlySums[w][yr];
      const base = baseline[w - 1];
      const eq = Math.round(entry.eq * 10) / 10;
      const frp = Math.round(entry.frp_mw * 10) / 10;
      const stdSafe = base.baseline_std > 0 ? base.baseline_std : 1;
      const zScore = Math.round(((eq - base.baseline_mean) / stdSafe) * 10) / 10;

      // Tier: 1=Bajo, 2=Medio, 3=Alto, 4=Extremo
      let tier = 1;
      let level = 'Bajo';
      if (eq > base.baseline_mean + 2 * stdSafe || zScore >= 2.0 || eq > 500) {
        tier = 4;
        level = 'Extremo';
      } else if (eq > base.baseline_mean + 1 * stdSafe || zScore >= 1.0 || eq > 200) {
        tier = 3;
        level = 'Alto';
      } else if (eq > base.baseline_mean || zScore > 0 || eq > 50) {
        tier = 2;
        level = 'Medio';
      }

      matrix[yr].push({
        w,
        eq,
        frp,
        z: zScore,
        t: tier,
        lvl: level,
      });
    }
  }

  return {
    province: filterProvince || 'Toda la Región',
    total_cells: filteredCells.length,
    baseline,
    matrix,
  };
}

console.log('Generando partición para San Luis...');
const sanLuisData = buildZoneData('San Luis');
fs.writeFileSync(path.join(DEST_DIR, 'san_luis.json'), JSON.stringify(sanLuisData));
console.log(`-> san_luis.json guardado (${(fs.statSync(path.join(DEST_DIR, 'san_luis.json')).size / 1024).toFixed(1)} KB)`);

console.log('Generando partición para Córdoba...');
const cordobaData = buildZoneData('Córdoba');
fs.writeFileSync(path.join(DEST_DIR, 'cordoba.json'), JSON.stringify(cordobaData));
console.log(`-> cordoba.json guardado (${(fs.statSync(path.join(DEST_DIR, 'cordoba.json')).size / 1024).toFixed(1)} KB)`);

console.log('Generando partición para Región Completa...');
const regionalData = buildZoneData(null);
fs.writeFileSync(path.join(DEST_DIR, 'regional.json'), JSON.stringify(regionalData));
console.log(`-> regional.json guardado (${(fs.statSync(path.join(DEST_DIR, 'regional.json')).size / 1024).toFixed(1)} KB)`);

console.log('Partición completada exitosamente.');
