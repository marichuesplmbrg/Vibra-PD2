import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import "./RightPanel.css";

const CM_TO_M = 0.01;
const REQUIRED_TREATMENTS = 3; // number of treatments to satisfy a sphere

export default function RightPanel({
  deployedData,
  effectsByKey,
  makePointKey,
  normalizeZone,
  onApplyTreatment,
  onSelectSphere,
  selectedPoint,
  showAfter,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const spheresRef = useRef([]);
  const sphereByKeyRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseNdcRef = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!mountRef.current || !deployedData?.length) return;

    mountRef.current.innerHTML = "";
    spheresRef.current = [];
    sphereByKeyRef.current = {};

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    /* ---------- SCENE ---------- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d2d2d);

    /* ---------- CAMERA ---------- */
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.05, 100);
    camera.position.set(5, 4, 6);
    cameraRef.current = camera;

    /* ---------- RENDERER ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.outputColorSpace
      ? (renderer.outputColorSpace = THREE.SRGBColorSpace)
      : (renderer.outputEncoding = THREE.sRGBEncoding);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    /* ---------- CONTROLS ---------- */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    /* ---------- LIGHTS ---------- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(6, 8, 6);
    scene.add(dir);

    /* ---------- GRID ---------- */
    scene.add(new THREE.GridHelper(20, 20, 0x4444ff, 0x222288));

    /* ---------- POST ---------- */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.8, 0)
    );
    composerRef.current = composer;

    /* ---------- STL MODEL ---------- */
    try {
      new STLLoader().load("/Protoype-stripped.stl", (geometry) => {
        if (!geometry) return;
        geometry.computeBoundingBox();
        const mat = new THREE.MeshStandardMaterial({
          color: 0xf58727,
          metalness: 0.3,
          roughness: 0.7,
        });
        const mesh = new THREE.Mesh(geometry, mat);
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        mesh.rotation.set(-Math.PI / 2, 0, Math.PI);
        mesh.scale.setScalar(0.011);
        mesh.position.y = 1.6;
        scene.add(mesh);
      });
    } catch (err) {
      console.error("STLLoader error:", err);
    }

    /* ---------- SPHERES ---------- */
    let north = 0,
      south = 0,
      east = 0,
      west = 0;

    deployedData.forEach((row, index) => {
      const angleDeg = parseFloat(row.angle);
      const ultrasonicCm = parseFloat(row.ultrasonic);
      if (!Number.isFinite(angleDeg) || !Number.isFinite(ultrasonicCm) || ultrasonicCm <= 0) return;

      const angleRad = THREE.MathUtils.degToRad(angleDeg);
      const radiusM = ultrasonicCm * CM_TO_M;
      const layerIndex =
        Number(String(row.layer || "").replace("Layer ", "")) - 1 || 0;
      const y = layerIndex * 0.45 + 0.3;
      const x = Math.cos(angleRad) * radiusM;
      const z = Math.sin(angleRad) * radiusM;

      north = Math.max(north, z);
      south = Math.min(south, z);
      east = Math.max(east, x);
      west = Math.min(west, x);

      const zone = normalizeZone(row.classification);
      const baseColor =
        zone === "deadspot"
          ? 0x4292c6
          : zone === "hotspot"
          ? 0xb22222
          : 0xffffff;

      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 1.1,
      });

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 22, 22),
        material
      );

      const key = makePointKey(row, index);
      sphere.position.set(x, y, z);
      sphere.userData = { key, row, zone, baseColor };

      scene.add(sphere);
      spheresRef.current.push(sphere);
      sphereByKeyRef.current[key] = sphere;
    });

    /* ---------- WALLS & FURNITURE ---------- */
    const addBox = ({ w, h, d, x, y, z, color = 0x555555 }) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y + h / 2, z);
      scene.add(mesh);
    };

    const MARGIN_M = 0.3;
    const WALL_HEIGHT_M = 4;
    const WALL_THICKNESS_M = 0.12;

    const northZ = north + MARGIN_M;
    const southZ = south - MARGIN_M;
    const eastX = east + MARGIN_M;
    const westX = west - MARGIN_M;

    const roomWidth = eastX - westX;
    const roomDepth = northZ - southZ;
    const cx = (eastX + westX) / 2;
    const cz = (northZ + southZ) / 2;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const wallGridMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      opacity: 0.15,
    });

    const addWall = (w, h, d, x, y, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, y, z);
      scene.add(wall);
      const grid = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallGridMat);
      grid.position.set(x, y, z);
      scene.add(grid);
    };

    addWall(roomWidth, WALL_HEIGHT_M, WALL_THICKNESS_M, cx, WALL_HEIGHT_M / 2, northZ);
    addWall(roomWidth, WALL_HEIGHT_M, WALL_THICKNESS_M, cx, WALL_HEIGHT_M / 2, southZ);
    addWall(WALL_THICKNESS_M, WALL_HEIGHT_M, roomDepth, eastX, WALL_HEIGHT_M / 2, cz);
    addWall(WALL_THICKNESS_M, WALL_HEIGHT_M, roomDepth, westX, WALL_HEIGHT_M / 2, cz);

    // furniture
    addBox({ w: 0.45, h: 0.9, d: 0.45, x: cx - 0.8, y: 0, z: southZ + 0.35, color: 0x6b4f3f });
    addBox({ w: 0.6, h: 1.4, d: 0.45, x: eastX - 0.35, y: 0, z: cz - 0.6, color: 0x3a3a3a });
    addBox({ w: 1.2, h: 0.4, d: 0.45, x: westX + 0.6, y: 0, z: cz + 0.5, color: 0x4a5d73 });
    addBox({ w: 0.8, h: 0.6, d: 0.5, x: cx + 0.7, y: 0, z: northZ - 0.4, color: 0x2f2f2f });

    const addBaseboard = (w, x, z, isHorizontal = true) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(isHorizontal ? w : 0.05, 0.08, isHorizontal ? 0.05 : w),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      mesh.position.set(x, 0.04, z);
      scene.add(mesh);
    };
    addBaseboard(roomWidth, cx, northZ - 0.03, true);
    addBaseboard(roomWidth, cx, southZ + 0.03, true);
    addBaseboard(roomDepth, eastX - 0.03, cz, false);
    addBaseboard(roomDepth, westX + 0.03, cz, false);

    /* ---------- CAMERA FRAMING ---------- */
    const maxDim = Math.max(roomWidth, roomDepth);
    camera.position.set(cx, maxDim * 0.9, cz + maxDim * 1.3);
    controls.target.set(cx, 1.4, cz);
    controls.update();

    /* ---------- TOOLTIP ---------- */
    const canvas = renderer.domElement;
    const tooltip = document.getElementById("tooltip");

    const mouseMove = (e) => {
      if (!tooltip) return;
      const r = canvas.getBoundingClientRect();
      mouseNdcRef.current.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouseNdcRef.current, camera);
      const hit = raycasterRef.current.intersectObjects(spheresRef.current)[0]?.object;

      if (hit) {
        const { row, zone } = hit.userData;
        tooltip.style.display = "block";
        tooltip.style.left = `${e.clientX + 12}px`;
        tooltip.style.top = `${e.clientY + 12}px`;
        tooltip.innerHTML = `
          <strong>Layer:</strong> ${row.layer || "-"}<br/>
          <strong>Angle:</strong> ${row.angle || "-"}<br/>
          <strong>Ultrasonic:</strong> ${row.ultrasonic || "-"} cm<br/>
          <strong>dB:</strong> ${row.db || "-"}<br/>
          <strong>RT60:</strong> ${row.rt60 || "-"}<br/>
          <strong>Classification:</strong> ${row.classification || "-"}<br/>
          <strong>Zone:</strong> ${zone || "-"}
        `;
      } else {
        tooltip.style.display = "none";
      }
    };

    canvas.addEventListener("pointermove", mouseMove);
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      mouseNdcRef.current.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouseNdcRef.current, camera);
      const hit = raycasterRef.current.intersectObjects(spheresRef.current)[0]?.object;
      if (hit) onSelectSphere(hit.userData);
    });

    /* ---------- DRAG & DROP ---------- */
    canvas.addEventListener("dragover", (e) => e.preventDefault());

    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const treatmentId = e.dataTransfer.getData("text/plain");
      if (!treatmentId) return;

      const rect = canvas.getBoundingClientRect();
      mouseNdcRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouseNdcRef.current, camera);
      const hit = raycasterRef.current.intersectObjects(spheresRef.current)[0]?.object;
      if (!hit) return;

      onApplyTreatment(hit.userData.key, treatmentId);
    });

    /* ---------- ANIMATE ---------- */
    let running = true;
    const animate = () => {
      if (!running) return;
      requestAnimationFrame(animate);
      controls.update();
      composer.render();
    };
    animate();

    return () => {
      running = false;
      renderer.dispose();
      mountRef.current.innerHTML = "";
    };
  }, [deployedData, makePointKey, normalizeZone, onApplyTreatment, onSelectSphere]);

  /* ---------- BEFORE / AFTER + SATISFIED ---------- */
  useEffect(() => {
    Object.values(sphereByKeyRef.current).forEach((s) => {
      const base = new THREE.Color(s.userData.baseColor);
      const fx = effectsByKey?.[s.userData.key];
      const appliedCount = fx?.applied?.length || 0;
      const satisfied = appliedCount >= REQUIRED_TREATMENTS;

      if (satisfied) {
        s.material.color.set(0xffffff);
        s.material.emissive.set(0xffffff);
        s.material.emissiveIntensity = 0.6;
      } else if (!showAfter) {
        s.material.color.copy(base);
        s.material.emissive.copy(base);
        s.material.emissiveIntensity = 1.1;
      } else {
        const t = Math.min(1, (fx?.severity ?? 70) / 100);
        const neutral = new THREE.Color(0x2a9d8f);
        const blend = neutral.clone().lerp(base, t);
        s.material.color.copy(blend);
        s.material.emissive.copy(blend);
        s.material.emissiveIntensity = 0.35 + t * 0.5;
      }

      s.scale.setScalar(selectedPoint?.key === s.userData.key ? 1.35 : 1);

      if (s.userData.applied?.length >= 3) {
        s.material.color.set(0xffffff); // turn white if ≥ 3 treatments
        s.material.emissive.set(0xffffff);
}
    });
  }, [effectsByKey, showAfter, selectedPoint]);

  return (
    <div className="right-panel">
      {!deployedData?.length && (
        <div className="simulation-holder">
          <div className="center-box">3D SIMULATION</div>
        </div>
      )}
      <div ref={mountRef} className="three-mount" />
      <div
        id="tooltip"
        style={{
          position: "fixed",
          padding: "6px 10px",
          background: "rgba(20,20,20,0.85)",
          color: "#fff",
          borderRadius: "5px",
          pointerEvents: "none",
          fontSize: "12px",
          display: "none",
          zIndex: 10,
        }}
      />
    </div>
  );
}
