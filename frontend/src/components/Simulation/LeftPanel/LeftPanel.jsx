import { useState } from "react";
import "./LeftPanel.css";

const layers = {
  "Layer 1": 0,
  "Layer 2": 540291160,
  "Layer 3": 1597351297,
  "Layer 4": 1962364642,
};

const DEFAULT_ROW_COUNT = 5;
const createBlankRows = () =>
  Array.from({ length: DEFAULT_ROW_COUNT }, () => ({
    angle: "",
    db: "",
    ultrasonic: "",
    rt60: "",
    classification: "",
    layer: "",
  }));

const normalizeRow = (row) => ({
  angle: Number(row.angle),
  db: Number(row.db),
  ultrasonic: Number(row.ultrasonic),
  rt60: Number(row.rt60),
  classification: String(row.classification).toLowerCase().replace(/\s+/g, ""),
  layer: row.layer, // keep Layer 1 string
});

const ZONE_COLORS = {
  hotspot: "#b22222",
  deadspot: "#4292c6",
  neutral: "#2a9d8f",
};

const blendColor = (fromHex, toHex, t) => {
  const f = fromHex.replace("#", "");
  const e = toHex.replace("#", "");

  const rf = parseInt(f.substring(0, 2), 16);
  const gf = parseInt(f.substring(2, 4), 16);
  const bf = parseInt(f.substring(4, 6), 16);

  const rt = parseInt(e.substring(0, 2), 16);
  const gt = parseInt(e.substring(2, 4), 16);
  const bt = parseInt(e.substring(4, 6), 16);

  const r = Math.round(rf + (rt - rf) * t);
  const g = Math.round(gf + (gt - gf) * t);
  const b = Math.round(bf + (bt - bf) * t);

  return `rgb(${r}, ${g}, ${b})`;
};

const prettyZone = (zone) => {
  if (!zone) return "—";
  const z = String(zone).toLowerCase();
  if (z.includes("hot")) return "HOTSPOT";
  if (z.includes("dead")) return "DEADSPOT";
  return "NEUTRAL";
};

const intensityFromSeverity = (severity) => {
  if (severity <= 20) return "LOW";
  if (severity <= 50) return "MEDIUM";
  return "HIGH";
};

const dominantTreatmentName = (applied = [], treatments = [], fallbackName = "") => {
  if (!applied?.length) return fallbackName || "—";
  const counts = {};
  applied.forEach((id) => (counts[id] = (counts[id] || 0) + 1));

  let topId = null;
  let topCount = -1;
  Object.entries(counts).forEach(([id, c]) => {
    if (c > topCount) {
      topId = id;
      topCount = c;
    }
  });

  const t = treatments.find((x) => x.id === topId);
  return t?.name || fallbackName || topId || "—";
};

const formatAppliedTreatments = (applied = [], treatments = []) => {
  const counts = {};
  applied.forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  return Object.entries(counts).map(([id, count]) => {
    const t = treatments.find((x) => x.id === id);
    return `${t?.name || id} ×${count}`;
  });
};

const LeftPanel = ({
  onDeploy,
  onReset,
  treatments = [],
  selectedPoint,
  bestTreatment,
  showAfter,
  setShowAfter,
  effectsByKey,
}) => {
  const [data, setData] = useState(createBlankRows());
  const [filtered, setFiltered] = useState(createBlankRows());
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [recSlide, setRecSlide] = useState(0);

  /* ========================= IMPORT CLOUD ========================= */
  const importCloud = async () => {
  const PUB_ID =
    "2PACX-1vQnlfc6CjTojBjP_DLUsIuHR3W0QcUPJpI9_M3cruntXPtUog_gtHLb8qb2dP-D-ZQ4e2rUKG89S0yD";

  let combined = [];
  for (const [layerName, gid] of Object.entries(layers)) {
    const url = `https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();

    const rows = text
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => {
        const [angle, db, ultrasonic, rt60, classification] = line.split(",");
        return { angle, db, ultrasonic, rt60, classification, layer: layerName };
      });

    combined = combined.concat(rows);
  }

  setData(combined);
  setFiltered(combined);

  // ❌ REMOVE this:
  // onDeploy(normalized);
};

  /* ========================= DEPLOY ========================= */
  const deployData = () => {
    const normalized = filtered.filter((r) => r.angle || r.db).map(normalizeRow);
    onDeploy(normalized);
    console.log("Deploying:", normalized);
  };

  /* ========================= SEARCH ========================= */
  const handleSearch = () => {
    if (!query) {
      setFiltered(data);
      setMessage("");
      return;
    }

    const result = data.filter((row) =>
      Object.values(row).some((v) =>
        String(v).toLowerCase().includes(query.toLowerCase())
      )
    );
    setFiltered(result);
    setMessage(result.length ? "" : "The value entered is not in the table");
  };

  /* ========================= SORT ========================= */
  const handleSort = (value) => {
    let result = data;

    if (value === "HOTSPOT") {
      result = data.filter((row) => row.classification.toLowerCase().replace(/\s+/g, "") === "hotspot");
    } else if (value === "DEADSPOT") {
      result = data.filter((row) => row.classification.toLowerCase().replace(/\s+/g, "") === "deadspot");
    } else if (value.startsWith("Layer")) {
      result = data.filter((row) => row.layer === value);
    }

    setFiltered(result);
    const normalized = result.filter((r) => r.angle || r.db).map(normalizeRow);
    onDeploy(normalized);
  };

  /* ========================= RESET ========================= */
  const resetTable = () => {
    const blanks = createBlankRows();
    setData(blanks);
    setFiltered(blanks);
    setQuery("");
    setMessage("");
    onReset();
  };

  /* ========================= IMPORT LOCAL ========================= */
  const importLocal = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const lines = reader.result.split("\n").slice(1);
      const parsed = lines
        .filter(Boolean)
        .map((line) => {
          const [angle, db, ultrasonic, rt60, classification, layer] = line.split(",");
          return { angle, db, ultrasonic, rt60, classification, layer };
        });

      setData(parsed);
      setFiltered(parsed);

      const normalized = parsed.filter((r) => r.angle || r.db).map(normalizeRow);
    };
    reader.readAsText(file);
  };

  /* ========================= EXPORT CSV ========================= */
  const exportCSV = () => {
    const headers = "Angle,dB,Ultrasonic,RT60,Classification,Layer\n";
    const rows = filtered
      .filter((r) => r.angle || r.db)
      .map((r) =>
        `${r.angle},${r.db},${r.ultrasonic},${r.rt60},${r.classification},${r.layer}`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vibra-data.csv";
    link.click();
  };

  /* ========================= SELECTED POINT COLORS ========================= */
  const selectedRow = selectedPoint?.row || null;
  const selectedFx = selectedPoint?.key ? effectsByKey?.[selectedPoint.key] : null;
  const appliedList = selectedFx?.applied || [];
  const hasApplied = appliedList.length > 0;

  const zoneKey = selectedPoint?.zone || "neutral";
  const beforeColor = ZONE_COLORS[zoneKey] || ZONE_COLORS.neutral;

  let afterColor = beforeColor;
  if (hasApplied) {
    const severity = selectedFx?.severity ?? 70;
    const t = Math.max(0, Math.min(1, severity / 100));
    afterColor = blendColor(ZONE_COLORS.neutral, beforeColor, t);
  }

  const dominantName = dominantTreatmentName(appliedList, treatments, bestTreatment?.name || "");
  const severityVal = selectedFx?.severity ?? 70;
  const intensityLabel = intensityFromSeverity(severityVal);

  return (
    <div className="left-panel">
      {/* ========== SEARCH + SORT ========== */}
      <div className="raw-box">
        <h3 className="box-title">RAW PARAMETERS</h3>
        <div className="search-row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." />
          <button className="raw-btn" onClick={handleSearch}>Enter</button>
          <select className="raw-btn" onChange={(e) => handleSort(e.target.value)}>
            <option value="ALL">Sort</option>
            <option value="HOTSPOT">Hot Spot</option>
            <option value="DEADSPOT">Dead Spot</option>
            <option value="Layer 1">Layer 1</option>
            <option value="Layer 2">Layer 2</option>
            <option value="Layer 3">Layer 3</option>
            <option value="Layer 4">Layer 4</option>
          </select>
        </div>
        {message && <p>{message}</p>}

        {/* ========== TABLE ========== */}
        <div className="table-wrapper">
          <table className="raw-table">
            <thead>
              <tr>
                <th>NO.</th>
                <th>ANGLE</th>
                <th>DECIBEL</th>
                <th>ULTRASONIC</th>
                <th>REVERBERATION</th>
                <th>CLASSIFICATION</th>
                <th>LAYER</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i}>
                  <td>{row.angle || row.db ? i + 1 : ""}</td>
                  <td>{row.angle}</td>
                  <td> 
                    {row.db ? `${row.db} db` : ""}
                  </td>
                  <td>
                    {row.ultrasonic ? `${row.ultrasonic} cm` : ""}
                  </td>
                  <td>
                    {row.rt60 ? `${row.rt60} ms` : ""}
                  </td>
                  <td>{row.classification}</td>
                  <td>{row.layer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ========== ACTIONS ========== */}
        <div className="raw-actions">
          <div className="raw-actions-left">
            <button className="raw-btn" onClick={deployData}>Deploy</button>
            <button className="raw-btn" onClick={exportCSV}>Export</button>
            <button className="raw-btn" onClick={resetTable}>Reset</button>
          </div>
          <div className="raw-actions-right">
            <input type="file" accept=".csv" hidden id="importLocal" onChange={importLocal} />
            <button className="raw-btn" onClick={() => document.getElementById("importLocal").click()}>Import Local</button>
            <button className="raw-btn" onClick={importCloud}>Import Cloud</button>
          </div>
        </div>
      </div>

      {/* ========== LEGEND + RECOMMENDATION ========== */}
      <div className="mid-row">
        <div className="rt60-box">
          <h4 className="box-title">SPATIAL STATUS</h4>
        </div>
        <div className="legend-box">
          <h4 className="box-title">LEGEND</h4>
          <ul className="legend-row">
            <li><span className="legend-dot neutral" /> Neutral</li>
            <li><span className="legend-dot dead" /> Dead Spot</li>
            <li><span className="legend-dot hot" /> Hot Spot</li>
          </ul>
        </div>
      </div>

      {/* ========== RECOMMENDATION PANEL ========== */}
      <div className="recommend-box">
        <h4 className="box-title">RECOMMENDATION</h4>

        {/* SLIDE ARROWS */}
        <button
          className="rec-arrow left"
          onClick={() => setRecSlide(0)}
          disabled={recSlide === 0}
        >
          ‹
        </button>

        <button
          className="rec-arrow right"
          onClick={() => setRecSlide(1)}
          disabled={recSlide === 1}
        >
          ›
        </button>


        {/* ================= SLIDE 1 : SPHERE INFO ================= */}
        {recSlide === 0 && (
          <>
            <div className="rec-toggle">
              <button
                className={`raw-btn rec-toggle-btn ${showAfter ? "muted" : "active"}`}
                onClick={() => setShowAfter(false)}
              >
                BEFORE
              </button>

              <button
                className={`raw-btn rec-toggle-btn ${showAfter ? "active" : "muted"}`}
                onClick={() => setShowAfter(true)}
              >
                AFTER
              </button>
            </div>

            {!selectedPoint && (
              <p className="rec-text">
                Click a sphere in the 3D room to see the best treatment recommendation.
              </p>
            )}

            {selectedPoint && (
              <div className="rec-details">

                {/* Selected Zone */}
                <div className="rec-zone-row">
                  <div className="rec-zone-left">
                    <span className="rec-label">Selected Zone:</span>
                    <span className="rec-zone-text">
                      {prettyZone(selectedPoint.zone)}
                    </span>
                  </div>

                  <div className="rec-zone-right">
                    <span
                      className="rec-color-dot"
                      style={{ backgroundColor: beforeColor }}
                    />
                    <span
                      className="rec-color-dot"
                      style={{ backgroundColor: afterColor }}
                    />
                  </div>
                </div>

                {/* Meta Info */}
                {selectedRow && (
                  <div className="rec-meta">
                    <div><span className="rec-label">Layer:</span> {selectedRow.layer || "—"}</div>
                    <div><span className="rec-label">Angle:</span> {selectedRow.angle || "—"}</div>
                    <div><span className="rec-label">Ultrasonic:</span> {selectedRow.ultrasonic || "—"}</div>
                    <div><span className="rec-label">dB:</span> {selectedRow.db || "—"}</div>
                    <div><span className="rec-label">RT60:</span> {selectedRow.rt60 || "—"}</div>
                  </div>
                )}

                {/* Best Treatment */}
                {bestTreatment && (
                  <div className="rec-best">
                    <div className="rec-best-title">
                      Best Recommendation:
                      <span className="rec-best-name">
                        {bestTreatment.name}
                      </span>
                    </div>

                    <div className="rec-best-sub">
                      Highest improvement for this zone type
                    </div>
                  </div>
                )}

                {/* Status */}
                {selectedPoint.key && selectedFx ? (
                  <div className="rec-status">

                    <div>
                      <span className="rec-label">After Status:</span>{" "}
                      Severity {severityVal}/100
                    </div>

                    <div className="rec-applied">
                      <span className="rec-label">Applied:</span>{" "}
                      {hasApplied
                        ? formatAppliedTreatments(appliedList, treatments).join(", ")
                        : "—"}
                    </div>

                    <div className="rec-intensity">
                      <span className="rec-label">Treatment Intensity:</span>{" "}
                      {hasApplied
                        ? `${intensityLabel} (${dominantName} dominant)`
                        : "—"}
                    </div>

                  </div>
                ) : (
                  <div className="rec-status muted">
                    No treatment applied yet.
                  </div>
                )}

              </div>
            )}
          </>
        )}

        {/* ================= SLIDE 2 : DEVICES ================= */}
        {recSlide === 1 && (
          <>
            <p className="rec-text">
              Drag a device and drop it onto a sphere in the 3D simulation.
            </p>

            <div className="rec-cards">
              {treatments.map((t) => (
                <div
                  key={t.id}
                  className="rec-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`Drag ${t.name}`}
                >
                  <span className="rec-card-icon">{t.icon}</span>
                  <span className="rec-card-label">{t.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </div>

        );
      };


export default LeftPanel;
