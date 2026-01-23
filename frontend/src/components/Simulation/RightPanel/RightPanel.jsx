import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import "./RightPanel.css";

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
  const sceneRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);

  const spheresRef = useRef([]); // array of meshes
  const sphereByKeyRef = useRef({}); // key -> mesh
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseNdcRef = useRef(new THREE.Vector2());

  // Build scene
  useEffect(() => {
    if (!mountRef.current) return;

    // cleanup
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    mountRef.current.innerHTML = "";
    spheresRef.current = [];
    sphereByKeyRef.current = {};

    if (!deployedData || deployedData.length === 0) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d2d2d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(6, 6, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(10, 10, 10);
    scene.add(light);

    scene.add(new THREE.GridHelper(20, 20));

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.9, 0.0));
    composerRef.current = composer;

    // STL model
    const loader = new STLLoader();
    loader.load("/Protoype-stripped.stl", (geometry) => {
      geometry.computeBoundingBox();

      const material = new THREE.MeshStandardMaterial({
        color: 0xf58727,
        metalness: 0.3,
        roughness: 0.7,
      });

      const mesh = new THREE.Mesh(geometry, material);

      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(0.011, 0.011, 0.011);
      mesh.position.y = 1.85;

      scene.add(mesh);
    });

    // spheres
    deployedData.forEach((row, index) => {
      const angleDeg = parseFloat(String(row.angle).replace(/[^\d.-]/g, ""));
      const ultrasonic = parseFloat(String(row.ultrasonic).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(angleDeg) || !Number.isFinite(ultrasonic) || ultrasonic <= 0) return;

      const angleRad = THREE.MathUtils.degToRad(angleDeg);
      const radius = ultrasonic * 0.05;

      const layerIndex = Number(String(row.layer || "").replace("Layer ", "")) - 1 || 0;
      const y = layerIndex * 0.5 + 0.3;

      const zone = normalizeZone(row.classification);
      const baseColor =
        zone === "deadspot" ? 0x4292c6 : zone === "hotspot" ? 0xb22222 : 0x2a9d8f;

      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 1.2,
        roughness: 0.35,
        metalness: 0.25,
      });

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 25, 25), material);

      const x = Math.cos(angleRad) * radius;
      const z = Math.sin(angleRad) * radius;
      sphere.position.set(x, y, z);

      const key = makePointKey(row, index);

      sphere.userData = { key, zone, row, baseColor };
      scene.add(sphere);

      spheresRef.current.push(sphere);
      sphereByKeyRef.current[key] = sphere;
    });

    // walls (unchanged)
    const ROOM_HALF = 5;
    const WALL_HEIGHT = 4.5;
    const WALL_THICKNESS = 0.25;

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f2f26,
      transparent: true,
      opacity: 0.35,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const wallGridMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });

    const createWall = (geo, position) => {
      const wall = new THREE.Mesh(geo, wallMaterial);
      wall.position.copy(position);
      scene.add(wall);

      const grid = new THREE.Mesh(geo.clone(), wallGridMaterial);
      grid.position.copy(position);
      scene.add(grid);
    };

    createWall(new THREE.BoxGeometry(ROOM_HALF * 2, WALL_HEIGHT, WALL_THICKNESS), new THREE.Vector3(0, WALL_HEIGHT / 2, ROOM_HALF));
    createWall(new THREE.BoxGeometry(ROOM_HALF * 2, WALL_HEIGHT, WALL_THICKNESS), new THREE.Vector3(0, WALL_HEIGHT / 2, -ROOM_HALF));
    createWall(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, ROOM_HALF * 2), new THREE.Vector3(ROOM_HALF, WALL_HEIGHT / 2, 0));
    createWall(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, ROOM_HALF * 2), new THREE.Vector3(-ROOM_HALF, WALL_HEIGHT / 2, 0));

    const canvas = renderer.domElement;

    const getHitSphere = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      mouseNdcRef.current.set(x, y);

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(mouseNdcRef.current, camera);
      const hits = raycaster.intersectObjects(spheresRef.current, false);
      return hits.length ? hits[0].object : null;
    };

    // Drop treatment
    const onDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e) => {
      e.preventDefault();
      const treatmentId = e.dataTransfer.getData("text/plain");
      if (!treatmentId) return;

      const hitSphere = getHitSphere(e.clientX, e.clientY);
      if (!hitSphere) return;

      const { key, zone } = hitSphere.userData;
      onApplyTreatment(key, treatmentId, zone);
    };

    // Click select
    const onPointerDown = (e) => {
      const hitSphere = getHitSphere(e.clientX, e.clientY);
      if (!hitSphere) return;

      const { key, zone, row } = hitSphere.userData;
      onSelectSphere({ key, zone, row });
    };

    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);
    canvas.addEventListener("pointerdown", onPointerDown);

    // animate
    let running = true;
    const animate = () => {
      if (!running) return;
      requestAnimationFrame(animate);

      controls.update();
      composer.render();
    };
    animate();

    // resize
    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
      canvas.removeEventListener("pointerdown", onPointerDown);
      renderer.dispose();
      mountRef.current && (mountRef.current.innerHTML = "");
    };
  }, [deployedData, makePointKey, normalizeZone, onApplyTreatment, onSelectSphere]);

  // Apply Before/After + selection highlight
  useEffect(() => {
    const sphereByKey = sphereByKeyRef.current;

    // 1) Before/After coloring
    Object.values(sphereByKey).forEach((sphere) => {
      const baseColor = new THREE.Color(sphere.userData.baseColor);

      if (!showAfter) {
        // BEFORE: restore original
        sphere.material.color.copy(baseColor);
        sphere.material.emissive.copy(baseColor);
        sphere.material.emissiveIntensity = 1.2;
        sphere.material.needsUpdate = true;
        return;
      }

// AFTER: only change color if a treatment was applied
const key = sphere.userData.key;
const fx = effectsByKey?.[key];

// If no treatment applied yet, keep original color in AFTER mode too
if (!fx || !fx.applied || fx.applied.length === 0) {
  sphere.material.color.copy(baseColor);
  sphere.material.emissive.copy(baseColor);
  sphere.material.emissiveIntensity = 1.2;
  sphere.material.needsUpdate = true;
  return;
}

// If treated: blend toward neutral based on severity
const severity = fx.severity ?? 70;
const neutral = new THREE.Color(0x2a9d8f);

const t = Math.max(0, Math.min(1, severity / 100)); // 1=bad, 0=good
const blended = neutral.clone().lerp(baseColor, t);

sphere.material.color.copy(blended);
sphere.material.emissive.copy(blended);

// Keep glow controlled so it doesn’t look “washed out”
sphere.material.emissiveIntensity = 0.35 + (t * 0.55);
sphere.material.needsUpdate = true;

    });

    // 2) Selection highlight (scale up selected sphere)
    Object.values(sphereByKey).forEach((sphere) => {
      const isSelected = selectedPoint?.key && sphere.userData.key === selectedPoint.key;
      sphere.scale.setScalar(isSelected ? 1.35 : 1.0);
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
      <div id="tooltip" className="tooltip" />
    </div>
  );
}
