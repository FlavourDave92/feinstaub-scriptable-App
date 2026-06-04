// ═══════════════════════════════════════════════════════════════
//  🌬  sensor.community Dashboard  |  Scriptable App
//  ───────────────────────────────────────────────────────────────
//  Hardware : ESP8266 (NodeMCU) + SDS011 (PM) + BME280 (climate)
//  API docs : https://github.com/opendata-stuttgart/meta/wiki/EN-APIs
//  Requires : Scriptable  https://scriptable.app
// ═══════════════════════════════════════════════════════════════
//
//  HOW TO FIND YOUR SENSOR IDs
//  ─────────────────────────────
//  1. Open  https://maps.sensor.community/
//  2. Click your station on the map
//  3. A popup appears with TWO sensor IDs:
//       • one for "SDS011" (fine dust / PM)
//       • one for "BME280" (temperature / humidity / pressure)
//  4. Paste those numbers below and save the script
//
// ════════════════════════════════════════════════════════════════
//  ✏️  EDIT THESE THREE LINES — then you are done
// ════════════════════════════════════════════════════════════════

const SENSOR_ID_DUST = "12345"        // ← SDS011 API sensor ID
const SENSOR_ID_BME  = "12346"        // ← BME280 API sensor ID
const SENSOR_LABEL   = "My Station"   // ← any display name you like

// ════════════════════════════════════════════════════════════════
//  OPTIONAL SETTINGS
// ════════════════════════════════════════════════════════════════

const SHOW_WHO_LIMITS = true   // draw WHO PM reference lines on chart
const DARK_MODE       = true   // false = light theme
const ARCHIVE_DAYS_BACK = 1    // 1 = yesterday (most reliable); 0 = today (may be empty)

// ════════════════════════════════════════════════════════════════
//  DO NOT EDIT BELOW THIS LINE
// ════════════════════════════════════════════════════════════════

const UA = "ScriptableSensorDashboard/1.0 (scriptable-sensor-community)"

// ── Guard: show setup hint if placeholders are still in place ──
if (SENSOR_ID_DUST === "12345" || SENSOR_ID_BME === "12346") {
  const a = new Alert()
  a.title = "⚙️ Setup Required"
  a.message =
    "Open the script in Scriptable and replace SENSOR_ID_DUST " +
    "and SENSOR_ID_BME with your real sensor IDs.\n\n" +
    "Find them at:\nmaps.sensor.community → tap your station"
  a.addAction("Open maps.sensor.community")
  a.addCancelAction("Cancel")
  const choice = await a.present()
  if (choice === 0) Safari.open("https://maps.sensor.community/")
  Script.complete()
} else {
  await main()
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  const archiveDate = isoDate(-Math.abs(ARCHIVE_DAYS_BACK))

  // Parallel fetch: current data + archive CSVs
  const [dustRaw, bmeRaw, dustCsv, bmeCsv] = await Promise.all([
    apiGet(`https://data.sensor.community/airrohr/v1/sensor/${SENSOR_ID_DUST}/`),
    apiGet(`https://data.sensor.community/airrohr/v1/sensor/${SENSOR_ID_BME}/`),
    csvGet(archiveURL("sds011",  SENSOR_ID_DUST, archiveDate)),
    csvGet(archiveURL("bme280",  SENSOR_ID_BME,  archiveDate))
  ])

  const current = extractCurrent(dustRaw, bmeRaw)
  const history = {
    dust: csvParse(dustCsv, ["P1", "P2"]),
    bme:  csvParse(bmeCsv,  ["temperature", "humidity", "pressure"])
  }

  const widget = await createWidget(current, history, archiveDate)

  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    await presentExtendedDashboard(current, history, archiveDate)
  }

  Script.complete()
}

async function presentExtendedDashboard(cur, hist, archiveDate) {
  const wv = new WebView()
  await wv.loadHTML(renderDashboard(cur, hist, archiveDate))
  await wv.present(true)
}

async function createWidget(cur, hist, archiveDate) {
  const theme = DARK_MODE ? {
    bg:      new Color("#0c0e1a"),
    card:    new Color("#161928"),
    text:    new Color("#dde0f0"),
    muted:   new Color("#737b8d"),
    pm25:    new Color("#26c281"),
    pm10:    new Color("#eb4d4b"),
    temp:    new Color("#ff9f43"),
    hum:     new Color("#54a0ff"),
    pres:    new Color("#a29bfe")
  } : {
    bg:      new Color("#f0f2f8"),
    card:    new Color("#ffffff"),
    text:    new Color("#1a1d2e"),
    muted:   new Color("#6a7484"),
    pm25:    new Color("#26c281"),
    pm10:    new Color("#eb4d4b"),
    temp:    new Color("#ff9f43"),
    hum:     new Color("#54a0ff"),
    pres:    new Color("#a29bfe")
  }

  const widget = new ListWidget()
  widget.backgroundColor = theme.bg
  widget.setPadding(8, 8, 8, 8)

  const title = widget.addText(SENSOR_LABEL)
  title.font = Font.semiboldSystemFont(16)
  title.textColor = theme.text
  title.lineLimit = 1
  title.minimumScaleFactor = 0.8

  const subtitle = widget.addText(cur.ts ? fmtTime(cur.ts) : "No recent readings")
  subtitle.font = Font.systemFont(9)
  subtitle.textColor = theme.muted
  subtitle.lineLimit = 1
  subtitle.minimumScaleFactor = 0.7

  widget.addSpacer(5)

  const cardWidth = 150
  const cardHeight = 62

  const row1 = widget.addStack()
  row1.layoutHorizontally()
  row1.centerAlignContent()
  row1.spacing = 6
  row1.addSpacer()
  addMetricCard(row1, "PM 2.5", f1(cur.pm25), "μg/m³", theme.pm25, theme, cardWidth, cardHeight)
  addMetricCard(row1, "PM 10", f1(cur.pm10), "μg/m³", theme.pm10, theme, cardWidth, cardHeight)
  row1.addSpacer()

  widget.addSpacer(5)

  const row2 = widget.addStack()
  row2.layoutHorizontally()
  row2.centerAlignContent()
  row2.spacing = 6
  row2.addSpacer()
  addMetricCard(row2, "Temp", f1(cur.temp), "°C", theme.temp, theme, cardWidth, cardHeight)
  addMetricCard(row2, "Humidity", f0(cur.humidity), "%", theme.hum, theme, cardWidth, cardHeight)
  row2.addSpacer()

  widget.addSpacer(5)

  const row3 = widget.addStack()
  row3.layoutHorizontally()
  row3.centerAlignContent()
  row3.spacing = 6
  row3.addSpacer()
  addMetricCard(row3, "Status", aqText(cur.pm25, [5, 15, 25, 50]), "", theme.text, theme, cardWidth, 62)
  addMetricCard(row3, "Pressure", f0(cur.pressure), "hPa", theme.pres, theme, cardWidth, 62)
  row3.addSpacer()

  widget.addSpacer(8)
  const chartWidth = 310
  const chartImage = await createLineChartImage(hist.dust, [
    { key: 'P2', color: theme.pm25 },
    { key: 'P1', color: theme.pm10 }
  ], {
    width: chartWidth,
    height: 96,
    yMin: 0,
    title: 'Particulate Matter',
    subtitle: '24 h course'
  }, theme)

  const chartStack = widget.addStack()
  chartStack.layoutHorizontally()
  chartStack.centerAlignContent()
  chartStack.addSpacer()
  const chart = chartStack.addImage(chartImage)
  chart.imageSize = new Size(chartWidth, 96)
  chart.cornerRadius = 12
  chartStack.addSpacer()

  widget.addSpacer(8)
  const footer = widget.addText(`Archive ${archiveDate}`)
  footer.font = Font.systemFont(9)
  footer.textColor = theme.muted
  footer.lineLimit = 1
  footer.minimumScaleFactor = 0.7

  return widget
}

async function createLineChartImage(rows, series, opts, theme) {
  opts = opts || {}
  const width = opts.width || 280
  const height = opts.height || 110
  const ctx = new DrawContext()
  ctx.size = new Size(width, height)
  ctx.opaque = false
  ctx.respectScreenScale = true

  ctx.setFillColor(theme.card)
  ctx.fillRect(new Rect(0, 0, width, height))

  const PL = 32
  const PR = 12
  const PT = 14
  const PB = 20
  const plotW = width - PL - PR
  const plotH = height - PT - PB

  const validRows = rows.filter(r => r && typeof r.t === 'number')
  if (validRows.length < 2) {
    ctx.setFillColor(theme.muted)
    ctx.setFont(Font.systemFont(12))
    ctx.drawText(`No archive data`, new Point(8, height / 2 - 6))
    return ctx.getImage()
  }

  const tMin = validRows[0].t
  const tMax = validRows[validRows.length - 1].t
  const tSpan = tMax - tMin || 1

  const allVals = []
  for (const row of validRows) {
    for (const s of series) {
      const v = row[s.key]
      if (v != null && isFinite(v)) allVals.push(v)
    }
  }

  const rawMin = Math.min.apply(null, allVals)
  const rawMax = Math.max.apply(null, allVals)
  const pad = Math.max((rawMax - rawMin) * 0.12, 1)
  const vMin = typeof opts.yMin === 'number' ? opts.yMin : rawMin - pad * 0.4
  const vMax = typeof opts.yMax === 'number' ? opts.yMax : rawMax + pad

  const xp = t => PL + ((t - tMin) / tSpan) * plotW
  const yp = v => PT + (1 - (v - vMin) / (vMax - vMin)) * plotH

  ctx.setStrokeColor(theme.muted)
  ctx.setLineWidth(0.5)
  for (let i = 0; i <= 4; i++) {
    const y = PT + (plotH * i / 4)
    const path = new Path()
    path.move(new Point(PL, y))
    path.addLine(new Point(PL + plotW, y))
    ctx.addPath(path)
    ctx.strokePath(path)
  }

  for (const s of series) {
    const path = new Path()
    let started = false
    for (const row of validRows) {
      const value = row[s.key]
      if (value == null || !isFinite(value)) continue
      const x = xp(row.t)
      const y = yp(value)
      if (!started) {
        path.move(new Point(x, y))
        started = true
      } else {
        path.addLine(new Point(x, y))
      }
    }
    if (!started) continue
    ctx.setStrokeColor(s.color)
    ctx.setLineWidth(2)
    ctx.addPath(path)
    ctx.strokePath(path)
  }

  if (opts.title) {
    ctx.setFont(Font.semiboldSystemFont(11))
    ctx.setTextColor(theme.text)
    ctx.drawText(opts.title, new Point(PL, 0))
  }
  if (opts.subtitle) {
    ctx.setFont(Font.systemFont(9))
    ctx.setTextColor(theme.muted)
    ctx.drawText(opts.subtitle, new Point(PL, 12))
  }

  return ctx.getImage()
}

function addMetricCard(parent, label, value, unit, accent, theme, width, height) {
  const card = parent.addStack()
  card.layoutVertically()
  if (width || height) card.size = new Size(width || 0, height || 74)
  card.setPadding(10, 10, 10, 10)
  card.backgroundColor = theme.card
  card.cornerRadius = 12
  card.centerAlignContent()

  const labelText = card.addText(label)
  labelText.font = Font.systemFont(10)
  labelText.textColor = theme.muted
  labelText.lineLimit = 1
  labelText.minimumScaleFactor = 0.75

  const valueText = card.addText(`${value}${unit ? ` ${unit}` : ""}`)
  valueText.font = Font.semiboldSystemFont(18)
  valueText.textColor = colorFrom(accent)
  valueText.lineLimit = 1
  valueText.minimumScaleFactor = 0.7

  return card
}

function colorFrom(value) {
  return value instanceof Color ? value : new Color(value)
}

// ═══════════════════════════════════════════════════════════════════════
//  NETWORK HELPERS
// ═══════════════════════════════════════════════════════
async function apiGet(url) {
  try {
    const r = new Request(url)
    r.headers = { "User-Agent": UA }
    return await r.loadJSON()
  } catch (e) {
    console.warn("apiGet failed:", url, String(e))
    return null
  }
}

async function csvGet(url) {
  try {
    const r = new Request(url)
    r.headers = { "User-Agent": UA }
    return await r.loadString()
  } catch (e) {
    console.warn("csvGet failed:", url, String(e))
    return null
  }
}

function archiveURL(type, sensorId, date) {
  return `https://archive.sensor.community/${date}/${date}_${type}_sensor_${sensorId}.csv`
}

// ═══════════════════════════════════════════════════════════════
//  DATA EXTRACTION  (current readings from API)
// ═══════════════════════════════════════════════════════════════
function extractCurrent(dustRaw, bmeRaw) {
  const out = {
    pm25: null, pm10: null,
    temp: null, humidity: null, pressure: null,
    ts: null
  }

  if (Array.isArray(dustRaw) && dustRaw.length > 0) {
    // API returns array of last 5-min readings; take the most recent
    const reading = dustRaw[dustRaw.length - 1]
    out.ts = reading.timestamp
    for (const sv of reading.sensordatavalues || []) {
      if (sv.value_type === "P2") out.pm25 = +sv.value   // PM2.5
      if (sv.value_type === "P1") out.pm10 = +sv.value   // PM10
    }
  }

  if (Array.isArray(bmeRaw) && bmeRaw.length > 0) {
    const reading = bmeRaw[bmeRaw.length - 1]
    if (!out.ts) out.ts = reading.timestamp
    for (const sv of reading.sensordatavalues || []) {
      if (sv.value_type === "temperature") out.temp     = +sv.value
      if (sv.value_type === "humidity")    out.humidity = +sv.value
      if (sv.value_type === "pressure") {
        const v = +sv.value
        // Firmware sends Pa; divide by 100 if the value looks like Pa (> 2000)
        out.pressure = v > 2000 ? v / 100 : v
      }
    }
  }

  return out
}

// ═══════════════════════════════════════════════════════════════
//  CSV PARSING  (archive time-series data)
// ═══════════════════════════════════════════════════════════════
function csvParse(text, fields) {
  if (!text || text.trim().length === 0) return []

  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(";").map(s => s.trim())
  const tsIdx  = header.indexOf("timestamp")
  if (tsIdx < 0) return []

  const fieldMap = fields.map(f => ({ f, i: header.indexOf(f) }))

  const rows = []
  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(";")
    let rawTs = (cols[tsIdx] || "").trim()
    if (!rawTs) continue

    // Normalise to ISO 8601 UTC
    rawTs = rawTs.replace(" ", "T")
    if (!rawTs.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(rawTs)) rawTs += "Z"
    const ts = new Date(rawTs)
    if (isNaN(ts.getTime())) continue

    const row = { t: ts.getTime() }
    for (const { f, i } of fieldMap) {
      if (i >= 0 && cols[i] !== undefined && cols[i].trim() !== "") {
        let v = parseFloat(cols[i])
        if (!isNaN(v)) {
          // Pressure unit normalisation (Pa → hPa)
          if (f === "pressure" && v > 2000) v /= 100
          row[f] = v
        }
      }
    }
    rows.push(row)
  }

  return rows
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════
function isoDate(offsetDays = 0) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function fmtTime(tsStr) {
  if (!tsStr) return "—"
  let normalized = tsStr.replace(" ", "T")
  if (!/Z|[+-]\d{2}:\d{2}$/.test(normalized)) {
    normalized += "Z"
  }
  const d = new Date(normalized)
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
         " · " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
}

function f1(v) { return v != null ? v.toFixed(1) : "—" }
function f0(v) { return v != null ? Math.round(v).toString() : "—" }

// Air quality color scale (WHO-inspired)
function aqColor(v, [g, m, p, vp]) {
  if (v == null) return "#607080"
  if (v <= g)   return "#26c281"   // good
  if (v <= m)   return "#f9ca24"   // fair
  if (v <= p)   return "#f0932b"   // moderate
  if (v <= vp)  return "#eb4d4b"   // poor
  return "#8b0000"                  // very poor
}

function aqText(v, [g, m, p, vp]) {
  if (v == null) return "—"
  if (v <= g)  return "Good"
  if (v <= m)  return "Fair"
  if (v <= p)  return "Moderate"
  if (v <= vp) return "Poor"
  return "Very Poor"
}

// ═══════════════════════════════════════════════════════════════
//  HTML DASHBOARD  (returned as a string, loaded into WebView)
// ═══════════════════════════════════════════════════════════════
function renderDashboard(cur, hist, archiveDate) {

  const pm25Col = aqColor(cur.pm25, [5, 15, 25, 50])
  const pm10Col = aqColor(cur.pm10, [15, 45, 75, 100])
  const pm25Txt = aqText(cur.pm25,  [5, 15, 25, 50])
  const pm10Txt = aqText(cur.pm10,  [15, 45, 75, 100])

  const archiveDateFmt = archiveDate
    ? new Date(archiveDate + "T12:00:00Z").toLocaleDateString("de-DE",
        { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—"

  // Serialize history data for injection into the page's <script>
  const jsDust = JSON.stringify(hist.dust)
  const jsBme  = JSON.stringify(hist.bme)
  const whoRef  = JSON.stringify(SHOW_WHO_LIMITS)

  // Theme
  const T = DARK_MODE ? {
    bg:      "#0c0e1a",
    card:    "#161928",
    border:  "#222540",
    text:    "#dde0f0",
    muted:   "#505870",
    grid:    "#1a1e30"
  } : {
    bg:      "#f0f2f8",
    card:    "#ffffff",
    border:  "#d8dce8",
    text:    "#1a1d2e",
    muted:   "#7880a0",
    grid:    "#e8eaf0"
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${SENSOR_LABEL}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{
  --bg:${T.bg};--card:${T.card};--border:${T.border};
  --text:${T.text};--muted:${T.muted};--grid:${T.grid};
  --r:14px;
}
html,body{background:var(--bg);color:var(--text);height:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;
  font-size:14px;
  padding:0 14px;
  padding-top:max(18px,env(safe-area-inset-top));
  padding-bottom:max(18px,env(safe-area-inset-bottom));
  overflow-x:hidden;
}
/* ── Header ─────────────────────────────────────── */
header{
  display:flex;justify-content:space-between;align-items:flex-start;
  margin-bottom:16px;padding-bottom:14px;
  border-bottom:1px solid var(--border);
}
header h1{font-size:19px;font-weight:700;line-height:1.1;color:var(--text)}
.sub{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.4}
.ts{font-size:10px;color:var(--muted);text-align:right}
.ts b{display:block;font-size:12px;color:var(--text);margin-top:2px}
/* ── Section label ───────────────────────────────── */
.sec{
  font-size:10px;font-weight:600;color:var(--muted);
  text-transform:uppercase;letter-spacing:.08em;
  margin:14px 0 7px;
}
/* ── Cards ───────────────────────────────────────── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
.card{
  background:var(--card);border-radius:var(--r);
  padding:12px 10px;border:1px solid var(--border);
  position:relative;overflow:hidden;
}
.card::after{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:var(--stripe,var(--muted));border-radius:var(--r) var(--r) 0 0;
}
.lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.val{font-size:28px;font-weight:700;line-height:1}
.unit{font-size:11px;color:var(--muted);margin-top:3px}
.badge{
  display:inline-block;font-size:9px;font-weight:700;
  padding:2px 7px;border-radius:99px;margin-top:6px;
  text-transform:uppercase;letter-spacing:.04em;
}
/* ── Chart boxes ─────────────────────────────────── */
.chart-box{
  background:var(--card);border-radius:var(--r);
  padding:12px 10px 8px;margin-bottom:8px;
  border:1px solid var(--border);
}
.chart-hd{
  display:flex;justify-content:space-between;
  align-items:baseline;margin-bottom:8px;
}
.cht-title{font-size:12px;font-weight:600;color:var(--text)}
.cht-sub{font-size:10px;color:var(--muted);margin-left:6px}
.legend{display:flex;gap:10px;align-items:center}
.leg-item{display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted)}
.leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
canvas{display:block;width:100%}
/* ── Footer ──────────────────────────────────────── */
footer{
  text-align:center;font-size:10px;color:var(--muted);
  margin-top:16px;padding-bottom:4px;line-height:1.6;
}
</style>
</head>
<body>

<!-- ═══ HEADER ══════════════════════════════════════════ -->
<header>
  <div>
    <h1>${SENSOR_LABEL}</h1>
    <div class="sub">
      ESP8266 &middot; SDS011 &middot; BME280<br>
      sensor.community
    </div>
  </div>
  <div class="ts">
    Updated<b>${fmtTime(cur.ts)}</b>
  </div>
</header>

<!-- ═══ PARTICULATE MATTER ══════════════════════════════ -->
<div class="sec">Particulate Matter</div>
<div class="grid2">
  <div class="card" style="--stripe:${pm25Col}">
    <div class="lbl">PM 2.5</div>
    <div class="val" style="color:${pm25Col}">${f1(cur.pm25)}</div>
    <div class="unit">μg/m³</div>
    <span class="badge" style="background:${pm25Col}30;color:${pm25Col}">${pm25Txt}</span>
  </div>
  <div class="card" style="--stripe:${pm10Col}">
    <div class="lbl">PM 10</div>
    <div class="val" style="color:${pm10Col}">${f1(cur.pm10)}</div>
    <div class="unit">μg/m³</div>
    <span class="badge" style="background:${pm10Col}30;color:${pm10Col}">${pm10Txt}</span>
  </div>
</div>

<!-- ═══ CLIMATE ══════════════════════════════════════════ -->
<div class="sec">Climate</div>
<div class="grid3">
  <div class="card" style="--stripe:#ff9f43">
    <div class="lbl">Temp</div>
    <div class="val" style="font-size:24px;color:#ff9f43">${f1(cur.temp)}</div>
    <div class="unit">°C</div>
  </div>
  <div class="card" style="--stripe:#54a0ff">
    <div class="lbl">Humidity</div>
    <div class="val" style="font-size:24px;color:#54a0ff">${f0(cur.humidity)}</div>
    <div class="unit">%</div>
  </div>
  <div class="card" style="--stripe:#a29bfe">
    <div class="lbl">Pressure</div>
    <div class="val" style="font-size:20px;color:#a29bfe">${f0(cur.pressure)}</div>
    <div class="unit">hPa</div>
  </div>
</div>

<!-- ═══ CHARTS ════════════════════════════════════════════ -->
<div class="sec">24 h Course — ${archiveDateFmt}</div>

<!-- PM2.5 + PM10 -->
<div class="chart-box">
  <div class="chart-hd">
    <div>
      <span class="cht-title">Fine Dust</span>
      <span class="cht-sub">μg/m³</span>
    </div>
    <div class="legend">
      <div class="leg-item"><div class="leg-dot" style="background:#f9ca24"></div>PM2.5</div>
      <div class="leg-item"><div class="leg-dot" style="background:#eb4d4b"></div>PM10</div>
    </div>
  </div>
  <canvas id="cPM" height="150"></canvas>
</div>

<!-- Temperature -->
<div class="chart-box">
  <div class="chart-hd">
    <div>
      <span class="cht-title">Temperature</span>
      <span class="cht-sub">°C</span>
    </div>
  </div>
  <canvas id="cTemp" height="110"></canvas>
</div>

<!-- Humidity -->
<div class="chart-box">
  <div class="chart-hd">
    <div>
      <span class="cht-title">Humidity</span>
      <span class="cht-sub">%</span>
    </div>
  </div>
  <canvas id="cHum" height="100"></canvas>
</div>

<!-- Pressure -->
<div class="chart-box">
  <div class="chart-hd">
    <div>
      <span class="cht-title">Air Pressure</span>
      <span class="cht-sub">hPa</span>
    </div>
  </div>
  <canvas id="cPres" height="100"></canvas>
</div>

<footer>
  sensor.community open data &middot; archive ${archiveDateFmt}<br>
  IDs: SDS011 ${SENSOR_ID_DUST} · BME280 ${SENSOR_ID_BME}
</footer>

<!-- ═══════════════════════════════════════════════════════
     CHART ENGINE
     ═══════════════════════════════════════════════════════ -->
<script>
'use strict';

// Injected from Scriptable-side
const dustRows = ${jsDust};
const bmeRows  = ${jsBme};
const showWHO  = ${whoRef};

// ── Core chart function ─────────────────────────────────
// rows   : [{t: epochMs, field1: val, field2: val, ...}]
// series : [{key, color, label}]
// opts   : {yMin, yMax, refs:[{v, color, label}]}
function drawChart(canvasId, rows, series, opts) {
  opts = opts || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const dpr = Math.min(window.devicePixelRatio || 2, 3);
  const W   = canvas.parentElement.clientWidth - 20;   // card padding
  const H   = parseInt(canvas.getAttribute('height'), 10);
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  // Layout
  const PL = 36, PR = 6, PT = 8, PB = 24;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  // ── Collect all values for auto-scaling ──────────────
  const allVals = [];
  for (const row of rows) {
    for (const s of series) {
      const v = row[s.key];
      if (v != null && isFinite(v)) allVals.push(v);
    }
  }

  if (allVals.length === 0 || rows.length < 2) {
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#607080';
    g.font = '11px -apple-system';
    g.textAlign = 'center';
    g.fillText('No archive data available for this date', W / 2, H / 2);
    return;
  }

  const rawMin = Math.min.apply(null, allVals);
  const rawMax = Math.max.apply(null, allVals);
  const pad    = Math.max((rawMax - rawMin) * 0.12, 0.5);
  const vMin   = opts.yMin != null ? opts.yMin : rawMin - pad * 0.4;
  const vMax   = opts.yMax != null ? opts.yMax : rawMax + pad;
  const tMin   = rows[0].t;
  const tMax   = rows[rows.length - 1].t;
  const tSpan  = tMax - tMin || 1;

  const xp = t => PL + ((t - tMin) / tSpan) * cW;
  const yp = v => PT + (1 - (v - vMin) / (vMax - vMin)) * cH;

  // ── Y-axis grid & labels ──────────────────────────────
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const v = vMin + (vMax - vMin) * (i / ySteps);
    const y = yp(v);
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#1a1e30';
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + cW, y); g.stroke();
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#505870';
    g.font = '9px -apple-system';
    g.textAlign = 'right';
    const lbl = Math.abs(v) < 10
      ? v.toFixed(1)
      : Math.round(v).toString();
    g.fillText(lbl, PL - 3, y + 3);
  }

  // ── X-axis hour labels (every 3 h) ───────────────────
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#505870';
  g.font = '9px -apple-system';
  g.textAlign = 'center';
  for (let h = 0; h <= 24; h += 3) {
    const t = tMin + (h / 24) * tSpan;
    if (t > tMax + 60000) break;
    const x = xp(t);
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#1a1e30';
    g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(x, PT); g.lineTo(x, PT + cH); g.stroke();
    g.fillText(h + 'h', x, H - 4);
  }

  // ── Reference lines (e.g. WHO limits) ────────────────
  for (const ref of (opts.refs || [])) {
    const v = ref.v;
    if (v < vMin || v > vMax) continue;
    const y = yp(v);
    g.save();
    g.strokeStyle = ref.color;
    g.lineWidth   = 1;
    g.globalAlpha = 0.65;
    g.setLineDash([3, 5]);
    g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + cW, y); g.stroke();
    g.setLineDash([]);
    g.restore();
    g.fillStyle   = ref.color;
    g.globalAlpha = 0.75;
    g.font        = '8px -apple-system';
    g.textAlign   = 'left';
    g.fillText(ref.label, PL + 3, y - 2);
    g.globalAlpha = 1;
  }

  // ── Data series (area fill + line) ────────────────────
  for (const s of series) {
    const pts = rows.filter(r => r[s.key] != null && isFinite(r[s.key]));
    if (pts.length === 0) continue;

    // Area fill (very transparent)
    g.save();
    g.beginPath();
    pts.forEach(function(r, i) {
      const x = xp(r.t), y = yp(r[s.key]);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.lineTo(xp(pts[pts.length - 1].t), PT + cH);
    g.lineTo(xp(pts[0].t), PT + cH);
    g.closePath();
    g.fillStyle   = s.color + '25';
    g.fill();
    g.restore();

    // Line
    g.save();
    g.beginPath();
    g.strokeStyle = s.color;
    g.lineWidth   = 1.8;
    g.lineJoin    = 'round';
    g.lineCap     = 'round';
    g.globalAlpha = 0.92;
    pts.forEach(function(r, i) {
      const x = xp(r.t), y = yp(r[s.key]);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.stroke();
    g.restore();
  }

  // ── Border around chart area ──────────────────────────
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border') || '#222540';
  g.lineWidth   = 0.5;
  g.strokeRect(PL, PT, cW, cH);
}

// ── Render all charts once DOM is ready ─────────────────
window.addEventListener('load', function() {

  // PM2.5 (P2) & PM10 (P1) — color-coded by WHO index
  drawChart('cPM', dustRows,
    [
      { key: 'P2', color: '#f9ca24', label: 'PM2.5' },
      { key: 'P1', color: '#eb4d4b', label: 'PM10'  }
    ],
    {
      yMin: 0,
      refs: showWHO ? [
        { v: 5,  color: '#f9ca24', label: 'WHO 5 (PM2.5)' },
        { v: 15, color: '#eb4d4b', label: 'WHO 15 (PM10)'  }
      ] : []
    }
  );

  // Temperature
  drawChart('cTemp', bmeRows,
    [{ key: 'temperature', color: '#ff9f43', label: 'Temp' }],
    {}
  );

  // Humidity
  drawChart('cHum', bmeRows,
    [{ key: 'humidity', color: '#54a0ff', label: 'Humidity' }],
    { yMin: 0, yMax: 100 }
  );

  // Air pressure
  drawChart('cPres', bmeRows,
    [{ key: 'pressure', color: '#a29bfe', label: 'Pressure' }],
    {}
  );
});
</script>
</body>
</html>`
}