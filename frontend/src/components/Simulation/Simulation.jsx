import { useCallback, useMemo, useState } from "react";
import "./Simulation.css";
import LeftPanel from "./LeftPanel/LeftPanel";
import RightPanel from "./RightPanel/RightPanel";

const TREATMENTS = [
  { id: "bass_trap", name: "Bass Trap", icon: "🟥", impact: { hotspot: 35, deadspot: 5, neutral: 0 } },
  { id: "absorber", name: "Absorber", icon: "🧱", impact: { hotspot: 25, deadspot: 0, neutral: 0 } },
  { id: "diffuser", name: "Diffuser", icon: "🔀", impact: { hotspot: 10, deadspot: 20, neutral: 5 } },
  { id: "rug", name: "Rug", icon: "🟫", impact: { hotspot: 15, deadspot: 0, neutral: 0 } },
];


function normalizeZone(classification) {
  const cls = String(classification || "").toLowerCase();
  if (cls.includes("hot")) return "hotspot";
  if (cls.includes("dead")) return "deadspot";
  return "neutral";
}

function makePointKey(row, index) {
  const layer = String(row.layer || "Layer 1");
  const angle = String(row.angle || "");
  const ultrasonic = String(row.ultrasonic || "");
  return `${layer}__${angle}__${ultrasonic}__${index}`;
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Studio standard for your system (camera sensor mapping)
const STUDIO_MIN_M = 3;
const STUDIO_MAX_M = 5;

// --- helpers for "studio standard 3–5 meters" error handling ---
const toMeters = (v) => {
  if (v == null) return null;
  const raw = String(v).trim();

  const num = parseFloat(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num)) return null;

  const lower = raw.toLowerCase();

  // support: "120 cm", "1.2 m", "4.5m", "4500 mm"
  if (lower.includes("cm")) return num / 100;
  if (lower.includes("mm")) return num / 1000;
  if (lower.includes("m")) return num;

  // if no unit, assume cm (since your sheet uses cm)
  return num / 100;
};

const getRoomSizeStatus = (rows = []) => {
  // We infer "room size" from the farthest ultrasonic radius in the deployed points.
  // If your ultrasonic column is distance from center to wall, then 2*max gives an estimated diameter.
  // If instead it already represents a room dimension, adjust here accordingly.
  const meters = rows
    .map((r) => toMeters(r.ultrasonic))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (!meters.length) {
    return {
      ok: false,
      reason: "No ultrasonic distance values found. Please import/deploy valid data.",
      estimatedMeters: null,
    };
  }

  const maxR = Math.max(...meters); // radius-like distance (m)
  const estimated = Number((maxR * 2).toFixed(2)); // diameter estimate (m)

  const ok = estimated >= STUDIO_MIN_M && estimated <= STUDIO_MAX_M;

  return {
    ok,
    estimatedMeters: estimated,
    reason: ok
      ? `Studio standard detected (${STUDIO_MIN_M}–${STUDIO_MAX_M}m).`
      : `Not studio standard: estimated ~${estimated}m (expected ${STUDIO_MIN_M}–${STUDIO_MAX_M}m).`,
  };
};

export default function Simulation() {
  const [deployedData, setDeployedData] = useState([]);
  const [effectsByKey, setEffectsByKey] = useState({});
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showAfter, setShowAfter] = useState(true);

  // ✅ NEW: room size validation state
  const [roomCheck, setRoomCheck] = useState({
    ok: true,
    estimatedMeters: null,
    reason: "",
  });

  const treatmentsById = useMemo(() => {
    const m = {};
    TREATMENTS.forEach((t) => (m[t.id] = t));
    return m;
  }, []);

  const bestTreatment = useMemo(() => {
    if (!selectedPoint) return null;
    const zone = selectedPoint.zone || "neutral";
    let best = null;
    let bestScore = -Infinity;

    for (const t of TREATMENTS) {
      const score = t.impact?.[zone] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }, [selectedPoint]);

  // ✅ stable
  const onResetAll = useCallback(() => {
    setDeployedData([]);
    setEffectsByKey({});
    setSelectedPoint(null);
    setShowAfter(true);
    setRoomCheck({ ok: true, estimatedMeters: null, reason: "" });
  }, []);

  // ✅ stable
  const onDeployData = useCallback((data) => {
    // Studio standard check (3–5m)
    const status = getRoomSizeStatus(data);

    setRoomCheck(status);

    // If NOT studio standard, block deployment to the 3D scene
    if (!status.ok) {
      setDeployedData(data);
      setEffectsByKey({});
      setSelectedPoint(null);
      setShowAfter(true);
      return;
    }

    // OK: proceed with deployment
    setDeployedData(data);
    setEffectsByKey({});
    setSelectedPoint(null);
    setShowAfter(true);
  }, []);

  // ✅ stable
  const onApplyTreatment = useCallback(
    (pointKey, treatmentId, originalZone) => {
      const treatment = treatmentsById[treatmentId];
      if (!treatment) return;

      setEffectsByKey((prev) => {
        const prevPoint = prev[pointKey] || { severity: 70, applied: [] };
        const times = prevPoint.applied.filter((x) => x === treatmentId).length;
        const diminish = Math.pow(0.7, times);

        const zone = originalZone || "neutral";
        const baseImpact = treatment.impact?.[zone] ?? 0;
        const impact = Math.round(baseImpact * diminish);

        return {
          ...prev,
          [pointKey]: {
            severity: clamp(prevPoint.severity - impact, 0, 100),
            applied: [...prevPoint.applied, treatmentId],
          },
        };
      });
    },
    [treatmentsById]
  );

  // optional helper: allow UI to “try deploy anyway” after user fixes data
  const recheckRoomSize = useCallback(() => {
    const status = getRoomSizeStatus(deployedData);
    setRoomCheck(status);
  }, [deployedData]);

  return (
    <section id="simulation" className="simulation">
      <LeftPanel
        onDeploy={onDeployData}
        onReset={onResetAll}
        treatments={TREATMENTS}
        selectedPoint={selectedPoint}
        bestTreatment={bestTreatment}
        showAfter={showAfter}
        setShowAfter={setShowAfter}
        effectsByKey={effectsByKey}
        // ✅ NEW props for error handling UI
        roomCheck={roomCheck}
        studioMin={STUDIO_MIN_M}
        studioMax={STUDIO_MAX_M}
        onRecheckRoomSize={recheckRoomSize}
      />

      <RightPanel
        deployedData={deployedData}
        effectsByKey={effectsByKey}
        makePointKey={makePointKey}
        normalizeZone={normalizeZone}
        onApplyTreatment={onApplyTreatment}
        onSelectSphere={setSelectedPoint}
        selectedPoint={selectedPoint}
        showAfter={showAfter}
        // ✅ NEW: RightPanel can optionally show overlay if blocked (if you want)
        roomCheck={roomCheck}
      />
    </section>
  );
}
