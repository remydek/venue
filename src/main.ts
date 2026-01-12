import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
    EffectComposer,
    EffectPass,
    RenderPass,
    BloomEffect,
    VignetteEffect,
    SMAAEffect,
    SMAAPreset,
    ToneMappingEffect,
    ToneMappingMode
} from 'postprocessing';
import * as dat from 'dat.gui';

// Type definitions
interface CourtLabel {
    element: HTMLElement;
    position: THREE.Vector3;
}

interface DevSettings {
    cameraX: number;
    cameraY: number;
    cameraZ: number;
    fov: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    exposure: number;
    toneMapping: string;
    ambientIntensity: number;
    ambientColor: string;
    directIntensity: number;
    directColor: string;
    punctualLights: boolean;
    envIntensity: number;
    showEnvBackground: boolean;
    bloomEnabled: boolean;
    bloomIntensity: number;
    bloomLuminanceThreshold: number;
    bloomLuminanceSmoothing: number;
    bloomRadius: number;
    vignetteEnabled: boolean;
    vignetteOffset: number;
    vignetteDarkness: number;
    modelScale: number;
    courtLabelX: number;
    courtLabelY: number;
    courtLabelZ: number;
    fitToView: () => void;
    logCamera: () => void;
}

interface GUIFolders {
    cameras: dat.GUI;
    pointLights: dat.GUI;
    spotLights: dat.GUI;
}

// Extend Window interface
declare global {
    interface Window {
        guiFolders: GUIFolders;
    }
}

// Console error tracking
window.addEventListener('error', (e: ErrorEvent) => {
    console.error('Global error:', e.message, e.filename, e.lineno, e.colno);
});

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let model: THREE.Group;
let courtLabels: CourtLabel[] = [];
let ambientLight: THREE.AmbientLight;
let glbLights: THREE.Light[] = [];
let gui: dat.GUI;
let tennisBalls: THREE.Object3D[] = [];
let envMap: THREE.Texture;
let composer: EffectComposer;
let bloomEffect: BloomEffect;
let vignetteEffect: VignetteEffect;
let smaaEffect: SMAAEffect;
let toneMappingEffect: ToneMappingEffect;

// Cameras and lights from GLB
let glbCameras: THREE.Camera[] = [];
let glbPointLights: THREE.PointLight[] = [];
let glbSpotLights: THREE.SpotLight[] = [];

// Track if camera controls are locked (for Top View)
let cameraLocked = false;

// Highlight tracking
let highlightedMesh: THREE.Mesh | null = null;
let originalMaterial: THREE.Material | THREE.Material[] | null = null;

// Dev controls settings
const devSettings: DevSettings = {
    cameraX: 30,
    cameraY: 20,
    cameraZ: 30,
    fov: 45,
    targetX: 0,
    targetY: 2,
    targetZ: 0,
    exposure: -2,
    toneMapping: 'Linear',
    ambientIntensity: 0.3,
    ambientColor: '#ffffff',
    directIntensity: 2.5,
    directColor: '#ffffff',
    punctualLights: true,
    envIntensity: 1.5,
    showEnvBackground: false,
    bloomEnabled: true,
    bloomIntensity: 0.17,
    bloomLuminanceThreshold: 1,
    bloomLuminanceSmoothing: 0.025,
    bloomRadius: 0.44,
    vignetteEnabled: true,
    vignetteOffset: 0.3,
    vignetteDarkness: 0.5,
    modelScale: 2.5,
    courtLabelX: 0,
    courtLabelY: 15,
    courtLabelZ: 0,
    fitToView: () => fitCameraToModel(),
    logCamera: () => {
        console.log('Camera Position:', camera.position);
        console.log('Controls Target:', controls.target);
    }
};

// Initialize Three.js
function initThreeJS(): void {
    const container = document.getElementById('threejs-container');
    const loadingScreen = document.getElementById('loading-screen');
    const logoFillWrapper = document.getElementById('logo-fill-wrapper');
    const progressText = document.getElementById('progress-text');

    if (!container) {
        console.error('Container not found');
        return;
    }

    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x191919);

    // Create camera - extended far plane to prevent clipping
    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.01,
        5000
    );
    camera.position.set(50, 30, 50);

    // Create renderer - PREMIUM QUALITY SETTINGS
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // High quality shadow settings
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = true;

    // Color and tone mapping
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = Math.pow(2, devSettings.exposure);

    container.appendChild(renderer.domElement);

    // Setup pmndrs post-processing
    composer = new EffectComposer(renderer, {
        frameBufferType: THREE.HalfFloatType,
        multisampling: 4
    });

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Bloom Effect
    bloomEffect = new BloomEffect({
        intensity: devSettings.bloomIntensity,
        luminanceThreshold: devSettings.bloomLuminanceThreshold,
        luminanceSmoothing: devSettings.bloomLuminanceSmoothing,
        radius: devSettings.bloomRadius,
        mipmapBlur: true
    });

    // Vignette Effect
    vignetteEffect = new VignetteEffect({
        offset: devSettings.vignetteOffset,
        darkness: devSettings.vignetteDarkness
    });

    // SMAA Effect
    smaaEffect = new SMAAEffect({
        preset: SMAAPreset.ULTRA
    });

    // Tone Mapping Effect
    toneMappingEffect = new ToneMappingEffect({
        mode: ToneMappingMode.LINEAR
    });

    // Add effects pass
    const effectPass = new EffectPass(
        camera,
        bloomEffect,
        vignetteEffect,
        smaaEffect,
        toneMappingEffect
    );
    composer.addPass(effectPass);

    // Create orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 2000;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    // Raycaster for click-to-position
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Double-click to get 3D position
    renderer.domElement.addEventListener('dblclick', (event: MouseEvent) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            console.log('=== CLICKED POSITION ===');
            console.log(`X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}, Z: ${point.z.toFixed(2)}`);

            devSettings.courtLabelX = point.x;
            devSettings.courtLabelY = point.y + 3;
            devSettings.courtLabelZ = point.z;
            updateCourtLabelPosition();
            if (gui) gui.updateDisplay();
        }
    });

    // Lighting setup
    ambientLight = new THREE.AmbientLight(
        new THREE.Color(devSettings.ambientColor),
        devSettings.ambientIntensity
    );
    scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(
        new THREE.Color(devSettings.directColor),
        devSettings.directIntensity
    );
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.normalBias = 0.02;
    scene.add(directionalLight);

    // Load environment map (PNG skydome)
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('skydome-large.png', (texture: THREE.Texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        envMap = texture;
        scene.environment = envMap;
        scene.environmentIntensity = devSettings.envIntensity;
        scene.backgroundBlurriness = 0.1;
        if (devSettings.showEnvBackground) {
            scene.background = envMap;
        }
        console.log('Environment map loaded: skydome-large.png');
    });

    // Load GLTF model with Draco compression support
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
        'final-model.glb?v=' + Date.now(),
        (gltf) => {
            model = gltf.scene;

            // Center the model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            model.position.x = -center.x;
            model.position.y = -box.min.y;
            model.position.z = -center.z;

            // Enable shadows and find lights from GLB
            model.traverse((child: THREE.Object3D) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (mesh.material) {
                        const mat = mesh.material as THREE.MeshStandardMaterial;
                        mat.shadowSide = THREE.FrontSide;
                        if (mat.envMapIntensity !== undefined) {
                            mat.envMapIntensity = 1.0;
                        }
                    }
                }

                if ((child as THREE.Light).isLight) {
                    const light = child as THREE.Light;
                    console.log('Found light in GLB:', light.type, 'name:', light.name, 'intensity:', light.intensity);
                    glbLights.push(light);
                    light.castShadow = true;

                    if (light.shadow) {
                        light.shadow.mapSize.width = 4096;
                        light.shadow.mapSize.height = 4096;
                        light.shadow.bias = -0.0001;
                        light.shadow.normalBias = 0.02;
                        light.shadow.radius = 2;
                    }

                    if ((light as THREE.PointLight).isPointLight) {
                        const pointLight = light as THREE.PointLight;
                        glbPointLights.push(pointLight);
                        pointLight.shadow.camera.near = 0.5;
                        pointLight.shadow.camera.far = 500;
                        pointLight.decay = 2;
                        pointLight.distance = 0;
                    }

                    if ((light as THREE.SpotLight).isSpotLight) {
                        const spotLight = light as THREE.SpotLight;
                        glbSpotLights.push(spotLight);
                        spotLight.shadow.camera.near = 0.5;
                        spotLight.shadow.camera.far = 500;
                        (spotLight.shadow.camera as THREE.PerspectiveCamera).fov = 50;
                        spotLight.penumbra = 0.5;
                        spotLight.decay = 2;
                    }

                    if ((light as THREE.DirectionalLight).isDirectionalLight) {
                        const dirLight = light as THREE.DirectionalLight;
                        dirLight.shadow.camera.near = 0.5;
                        dirLight.shadow.camera.far = 500;
                        dirLight.shadow.camera.left = -50;
                        dirLight.shadow.camera.right = 50;
                        dirLight.shadow.camera.top = 50;
                        dirLight.shadow.camera.bottom = -50;
                    }
                }

                if ((child as THREE.Camera).isCamera) {
                    console.log('Found camera in GLB:', child.name, child.type);
                    glbCameras.push(child as THREE.Camera);
                }
            });

            // Scale up the model
            model.scale.set(2.5, 2.5, 2.5);
            scene.add(model);

            // Apply specific light settings
            applyLightSettings();

            // Recalculate size after scaling
            const scaledBox = new THREE.Box3().setFromObject(model);
            const scaledSize = scaledBox.getSize(new THREE.Vector3());

            console.log('Original model size:', size);
            console.log('Scaled model size:', scaledSize);
            console.log('Model center:', center);

            fitCameraToModel();
            createCourtLabels(size);
            populateMeshDebugList();
            populateGLBControls();

            // Hide loading screen
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }
        },
        (xhr) => {
            const percent = xhr.total > 0 ? Math.min(Math.round((xhr.loaded / xhr.total) * 100), 100) : 0;
            if (logoFillWrapper) {
                logoFillWrapper.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
            }
            if (progressText) progressText.textContent = percent + '%';
        },
        (error) => {
            console.error('Error loading model:', error);
            alert('Failed to load 3D model');
        }
    );

    window.addEventListener('resize', onWindowResize);
    initDevGUI();
    animate(0);
}

// Create VIP Table labels
function createCourtLabels(modelSize: THREE.Vector3): void {
    const labelsContainer = document.getElementById('court-labels');
    if (!labelsContainer) return;

    let vipTable1Mesh: THREE.Object3D | null = null;
    const vipTable1Position = new THREE.Vector3(0, 15, 0);

    model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh || child.isObject3D) {
            if (child.name) {
                console.log('Found object:', child.name);
            }
            if (child.name && (child.name === 'vip_table_1' || child.name.toLowerCase() === 'vip_table_1')) {
                vipTable1Mesh = child;
                console.log('Found VIP Table 1 mesh:', child.name);
            }
        }
    });

    if (vipTable1Mesh !== null) {
        const mesh = vipTable1Mesh as THREE.Object3D;
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);

        const bbox = new THREE.Box3().setFromObject(mesh);
        const meshTop = bbox.max.y;
        const meshCenterX = (bbox.max.x + bbox.min.x) / 2;
        const meshCenterZ = (bbox.max.z + bbox.min.z) / 2;

        vipTable1Position.set(meshCenterX, meshTop + 1.5, meshCenterZ);

        console.log('VIP Table 1 bounding box:', bbox);
        console.log('Label positioned at:', vipTable1Position);

        devSettings.courtLabelX = vipTable1Position.x;
        devSettings.courtLabelY = vipTable1Position.y;
        devSettings.courtLabelZ = vipTable1Position.z;
    } else {
        console.warn('vip_table_1 mesh not found in model.');
    }

    const label = document.createElement('div');
    label.className = 'court-label vip-label';
    label.innerHTML = `
        <div class="vip-tooltip">
            <span class="vip-icon">✦</span>
            <span class="court-label-text">VIP Table 1</span>
            <span class="vip-status">Available</span>
        </div>
    `;
    label.id = 'vip-table-1-label';
    labelsContainer.appendChild(label);

    courtLabels.push({
        element: label,
        position: vipTable1Position.clone()
    });

    console.log('VIP Table 1 label created at:', vipTable1Position.x, vipTable1Position.y, vipTable1Position.z);

    if (gui) {
        gui.updateDisplay();
    }
}

// Populate debug mesh list panel
function populateMeshDebugList(): void {
    const listContainer = document.getElementById('mesh-debug-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const meshes: { name: string; type: string; obj: THREE.Mesh }[] = [];
    const lights: { name: string; type: string; obj: THREE.Light }[] = [];
    const empties: { name: string; type: string; obj: THREE.Object3D }[] = [];

    model.traverse((child: THREE.Object3D) => {
        if (child.name) {
            if ((child as THREE.Mesh).isMesh) {
                meshes.push({ name: child.name, type: 'mesh', obj: child as THREE.Mesh });
            } else if ((child as THREE.Light).isLight) {
                lights.push({ name: child.name, type: child.type, obj: child as THREE.Light });
            } else if (child.isObject3D && !(child as THREE.Mesh).isMesh && !(child as THREE.Light).isLight) {
                empties.push({ name: child.name, type: 'empty/group', obj: child });
            }
        }
    });

    // Meshes section
    if (meshes.length > 0) {
        const meshHeader = document.createElement('div');
        meshHeader.className = 'mesh-debug-section';
        meshHeader.textContent = `Meshes (${meshes.length})`;
        listContainer.appendChild(meshHeader);

        meshes.forEach(item => {
            const div = document.createElement('div');
            div.className = 'mesh-debug-item mesh-item';
            div.textContent = item.name;
            div.title = 'Click to highlight';
            div.addEventListener('click', () => highlightMesh(item.obj));
            listContainer.appendChild(div);
        });
    }

    // Lights section
    if (lights.length > 0) {
        const lightHeader = document.createElement('div');
        lightHeader.className = 'mesh-debug-section';
        lightHeader.textContent = `Lights (${lights.length})`;
        listContainer.appendChild(lightHeader);

        lights.forEach(item => {
            const div = document.createElement('div');
            div.className = 'mesh-debug-item light-item';
            div.textContent = `${item.name} (${item.type})`;
            listContainer.appendChild(div);
        });
    }

    // Empties section
    if (empties.length > 0) {
        const emptyHeader = document.createElement('div');
        emptyHeader.className = 'mesh-debug-section';
        emptyHeader.textContent = `Empties/Groups (${empties.length})`;
        listContainer.appendChild(emptyHeader);

        empties.forEach(item => {
            const div = document.createElement('div');
            div.className = 'mesh-debug-item empty-item';
            div.textContent = item.name;
            div.title = 'Click to focus camera';
            div.addEventListener('click', () => focusOnObject(item.obj));
            listContainer.appendChild(div);
        });
    }

    // Toggle panel
    const toggleBtn = document.getElementById('mesh-debug-toggle');
    const panel = document.getElementById('mesh-debug-panel');
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        });
    }
}

// Highlight a mesh temporarily
function highlightMesh(mesh: THREE.Mesh): void {
    if (highlightedMesh && originalMaterial) {
        highlightedMesh.material = originalMaterial;
    }

    originalMaterial = mesh.material;
    highlightedMesh = mesh;

    const highlightMat = new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });
    mesh.material = highlightMat;

    focusOnObject(mesh);

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    console.log(`Mesh "${mesh.name}" world position:`, worldPos);

    setTimeout(() => {
        if (highlightedMesh === mesh && originalMaterial) {
            mesh.material = originalMaterial;
            highlightedMesh = null;
            originalMaterial = null;
        }
    }, 3000);
}

// Focus camera on an object
function focusOnObject(obj: THREE.Object3D): void {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    controls.target.copy(worldPos);
    controls.update();
    console.log(`Focused on "${obj.name}" at:`, worldPos);
}

// Populate GLB camera buttons and light controls
function populateGLBControls(): void {
    if (!window.guiFolders) return;

    glbCameras.forEach((glbCam, index) => {
        const camName = glbCam.name || `Camera ${index + 1}`;
        const flyToFunc = () => flyToCamera(glbCam);
        window.guiFolders.cameras.add({ [camName]: flyToFunc }, camName).name(`Fly to: ${camName}`);
    });

    glbPointLights.forEach((light, index) => {
        const lightName = light.name || `Point Light ${index + 1}`;
        const folder = window.guiFolders.pointLights.addFolder(lightName);

        const lightSettings = {
            enabled: light.visible,
            intensity: light.intensity,
            color: '#' + light.color.getHexString(),
            distance: light.distance,
            decay: light.decay
        };

        folder.add(lightSettings, 'enabled').name('Enabled').onChange((v: boolean) => {
            light.visible = v;
        });
        folder.add(lightSettings, 'intensity', 0, 100).name('Intensity').onChange((v: number) => {
            light.intensity = v;
        });
        folder.addColor(lightSettings, 'color').name('Color').onChange((v: string) => {
            light.color.set(v);
        });
        folder.add(lightSettings, 'distance', 0, 100).name('Distance').onChange((v: number) => {
            light.distance = v;
        });
        folder.add(lightSettings, 'decay', 0, 5).name('Decay').onChange((v: number) => {
            light.decay = v;
        });
    });

    glbSpotLights.forEach((light, index) => {
        const lightName = light.name || `Spot Light ${index + 1}`;
        const folder = window.guiFolders.spotLights.addFolder(lightName);

        const lightSettings = {
            enabled: light.visible,
            intensity: light.intensity,
            color: '#' + light.color.getHexString(),
            distance: light.distance,
            angle: THREE.MathUtils.radToDeg(light.angle),
            penumbra: light.penumbra,
            decay: light.decay
        };

        folder.add(lightSettings, 'enabled').name('Enabled').onChange((v: boolean) => {
            light.visible = v;
        });
        folder.add(lightSettings, 'intensity', 0, 100).name('Intensity').onChange((v: number) => {
            light.intensity = v;
        });
        folder.addColor(lightSettings, 'color').name('Color').onChange((v: string) => {
            light.color.set(v);
        });
        folder.add(lightSettings, 'distance', 0, 100).name('Distance').onChange((v: number) => {
            light.distance = v;
        });
        folder.add(lightSettings, 'angle', 0, 90).name('Angle (deg)').onChange((v: number) => {
            light.angle = THREE.MathUtils.degToRad(v);
        });
        folder.add(lightSettings, 'penumbra', 0, 1).name('Penumbra').onChange((v: number) => {
            light.penumbra = v;
        });
        folder.add(lightSettings, 'decay', 0, 5).name('Decay').onChange((v: number) => {
            light.decay = v;
        });
    });

    console.log(`Added ${glbCameras.length} camera buttons, ${glbPointLights.length} point lights, ${glbSpotLights.length} spot lights to GUI`);
}

// Fly camera to a GLB camera position with smooth animation
function flyToCamera(targetCam: THREE.Camera, locked = false): void {
    const targetPos = new THREE.Vector3();
    targetCam.getWorldPosition(targetPos);

    const targetDir = new THREE.Vector3(0, 0, -1);
    targetDir.applyQuaternion(targetCam.quaternion);

    const lookAtPoint = targetPos.clone().add(targetDir.multiplyScalar(10));

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1500;
    const startTime = performance.now();

    cameraLocked = locked;

    function animateFly(currentTime: number): void {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        camera.position.lerpVectors(startPos, targetPos, eased);
        controls.target.lerpVectors(startTarget, lookAtPoint, eased);
        controls.update();

        devSettings.cameraX = camera.position.x;
        devSettings.cameraY = camera.position.y;
        devSettings.cameraZ = camera.position.z;
        devSettings.targetX = controls.target.x;
        devSettings.targetY = controls.target.y;
        devSettings.targetZ = controls.target.z;
        if (gui) gui.updateDisplay();

        if (progress < 1) {
            requestAnimationFrame(animateFly);
        } else {
            if (locked) {
                controls.enableRotate = false;
                controls.enablePan = false;
                controls.enableZoom = true;
                console.log('Camera controls locked (Top View mode)');
            }
        }
    }

    requestAnimationFrame(animateFly);
    console.log(`Flying to camera: ${targetCam.name}`, targetPos, locked ? '(locked)' : '(free)');
}

// Unlock camera controls
function unlockCamera(): void {
    cameraLocked = false;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    console.log('Camera controls unlocked');
}

// Apply specific light settings from user configuration
function applyLightSettings(): void {
    glbPointLights.forEach(light => {
        const name = light.name.toLowerCase();

        if (name.includes('purple')) {
            light.visible = true;
            light.intensity = 39;
            light.color.set('#4700ff');
            light.distance = 100;
            light.decay = 0;
            console.log('Applied purplelight settings:', light.name);
        } else if (name.includes('pink')) {
            light.visible = true;
            light.intensity = 7;
            light.color.set('#d400ff');
            light.distance = 0;
            light.decay = 0;
            console.log('Applied pinklight settings:', light.name);
        }
    });

    glbSpotLights.forEach(light => {
        const name = light.name.toLowerCase();

        if (name.includes('spot')) {
            light.visible = true;
            light.intensity = 24;
            light.color.set('#ffc4af');
            light.distance = 0;
            light.angle = THREE.MathUtils.degToRad(10);
            light.penumbra = 1;
            light.decay = 1.4;
            console.log('Applied spotlight settings:', light.name);
        }
    });

    console.log('Light settings applied');
}

// Update VIP Table 1 label position from GUI controls
function updateCourtLabelPosition(): void {
    if (courtLabels.length > 0) {
        courtLabels[0].position.set(
            devSettings.courtLabelX,
            devSettings.courtLabelY,
            devSettings.courtLabelZ
        );
        console.log('VIP Table 1 position updated to:', devSettings.courtLabelX, devSettings.courtLabelY, devSettings.courtLabelZ);
    }
}

// Fit camera to model
function fitCameraToModel(): void {
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    const modelWidth = size.x;
    const modelHeight = size.y;

    const fovRad = camera.fov * (Math.PI / 180);
    const aspect = window.innerWidth / window.innerHeight;
    const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    const distanceToFitWidth = (modelWidth / 2) / Math.tan(hFov / 2);
    const finalDistance = distanceToFitWidth * 0.85;

    camera.position.set(
        finalDistance * 0.7,
        finalDistance * 0.5,
        finalDistance * 0.7
    );

    devSettings.cameraX = camera.position.x;
    devSettings.cameraY = camera.position.y;
    devSettings.cameraZ = camera.position.z;

    controls.target.set(0, modelHeight * 0.3, 0);
    devSettings.targetX = controls.target.x;
    devSettings.targetY = controls.target.y;
    devSettings.targetZ = controls.target.z;

    controls.update();

    if (gui) {
        gui.updateDisplay();
    }

    console.log('Model size:', size);
    console.log('Final distance:', finalDistance);
    console.log('Camera position:', camera.position);
}

// Initialize dev GUI
function initDevGUI(): void {
    gui = new dat.GUI({ width: 300 });
    gui.domElement.style.marginTop = '50px';

    // Camera folder
    const cameraFolder = gui.addFolder('Camera Position');
    cameraFolder.add(devSettings, 'cameraX', -100, 100).onChange((v: number) => {
        camera.position.x = v;
    });
    cameraFolder.add(devSettings, 'cameraY', -100, 100).onChange((v: number) => {
        camera.position.y = v;
    });
    cameraFolder.add(devSettings, 'cameraZ', -100, 100).onChange((v: number) => {
        camera.position.z = v;
    });
    cameraFolder.add(devSettings, 'fov', 20, 120).onChange((v: number) => {
        camera.fov = v;
        camera.updateProjectionMatrix();
    });
    cameraFolder.open();

    // Target folder
    const targetFolder = gui.addFolder('Camera Target');
    targetFolder.add(devSettings, 'targetX', -50, 50).onChange((v: number) => {
        controls.target.x = v;
    });
    targetFolder.add(devSettings, 'targetY', -20, 50).onChange((v: number) => {
        controls.target.y = v;
    });
    targetFolder.add(devSettings, 'targetZ', -50, 50).onChange((v: number) => {
        controls.target.z = v;
    });
    targetFolder.open();

    // Renderer folder
    const rendererFolder = gui.addFolder('Renderer');
    rendererFolder.add(devSettings, 'exposure', -5, 5).name('Exposure (EV)').onChange((v: number) => {
        renderer.toneMappingExposure = Math.pow(2, v);
    });

    // Tone mapping options (postprocessing library modes)
    const toneMappingOptions: { [key: string]: ToneMappingMode } = {
        'Linear': ToneMappingMode.LINEAR,
        'Reinhard': ToneMappingMode.REINHARD,
        'Reinhard2': ToneMappingMode.REINHARD2,
        'Reinhard2 Adaptive': ToneMappingMode.REINHARD2_ADAPTIVE,
        'Uncharted2': ToneMappingMode.UNCHARTED2,
        'Optimized Cineon': ToneMappingMode.OPTIMIZED_CINEON,
        'ACES Filmic': ToneMappingMode.ACES_FILMIC,
        'AGX': ToneMappingMode.AGX,
        'Neutral': ToneMappingMode.NEUTRAL
    };
    rendererFolder.add(devSettings, 'toneMapping', Object.keys(toneMappingOptions)).name('Tone Mapping').onChange((v: string) => {
        toneMappingEffect.mode = toneMappingOptions[v];
    });
    rendererFolder.open();

    // Lighting folder
    const lightFolder = gui.addFolder('Lighting');
    lightFolder.add(devSettings, 'ambientIntensity', 0, 2).name('Ambient Intensity').onChange((v: number) => {
        if (ambientLight) ambientLight.intensity = v;
    });
    lightFolder.add(devSettings, 'directIntensity', 0, 5).name('Direct Intensity').onChange((v: number) => {
        scene.traverse((child: THREE.Object3D) => {
            if ((child as THREE.DirectionalLight).isDirectionalLight && child !== ambientLight) {
                (child as THREE.DirectionalLight).intensity = v;
            }
        });
    });
    lightFolder.add(devSettings, 'punctualLights').name('Punctual Lights').onChange((v: boolean) => {
        glbLights.forEach(light => {
            light.visible = v;
        });
    });
    lightFolder.open();

    // Environment folder
    const envFolder = gui.addFolder('Environment (HDR)');
    envFolder.add(devSettings, 'envIntensity', 0, 3).name('Intensity').onChange((v: number) => {
        if (scene) scene.environmentIntensity = v;
    });
    envFolder.add(devSettings, 'showEnvBackground').name('Show as Background').onChange((v: boolean) => {
        if (scene && envMap) {
            scene.background = v ? envMap : new THREE.Color(0x191919);
        }
    });

    // Post-processing folder
    const postFolder = gui.addFolder('Post-Processing');

    postFolder.add(devSettings, 'bloomEnabled').name('Bloom').onChange((v: boolean) => {
        bloomEffect.blendMode.opacity.value = v ? 1 : 0;
    });
    postFolder.add(devSettings, 'bloomIntensity', 0, 3).name('Bloom Intensity').onChange((v: number) => {
        bloomEffect.intensity = v;
    });
    postFolder.add(devSettings, 'bloomLuminanceThreshold', 0, 1).name('Bloom Threshold').onChange((v: number) => {
        bloomEffect.luminanceMaterial.threshold = v;
    });
    postFolder.add(devSettings, 'bloomRadius', 0, 1).name('Bloom Radius').onChange((v: number) => {
        bloomEffect.mipmapBlurPass.radius = v;
    });

    postFolder.add(devSettings, 'vignetteEnabled').name('Vignette').onChange((v: boolean) => {
        vignetteEffect.blendMode.opacity.value = v ? 1 : 0;
    });
    postFolder.add(devSettings, 'vignetteOffset', 0, 1).name('Vignette Offset').onChange((v: number) => {
        vignetteEffect.offset = v;
    });
    postFolder.add(devSettings, 'vignetteDarkness', 0, 1).name('Vignette Darkness').onChange((v: number) => {
        vignetteEffect.darkness = v;
    });
    postFolder.open();

    // Model folder
    const modelFolder = gui.addFolder('Model');
    modelFolder.add(devSettings, 'modelScale', 0.1, 5).onChange((v: number) => {
        if (model) {
            model.scale.set(v, v, v);
        }
    });

    // VIP Table Label Position
    const vipLabelFolder = gui.addFolder('VIP Table 1 Position');
    vipLabelFolder.add(devSettings, 'courtLabelX', -100, 100).step(0.5).name('X').onChange(updateCourtLabelPosition);
    vipLabelFolder.add(devSettings, 'courtLabelY', 0, 50).step(0.5).name('Y (Height)').onChange(updateCourtLabelPosition);
    vipLabelFolder.add(devSettings, 'courtLabelZ', -100, 100).step(0.5).name('Z').onChange(updateCourtLabelPosition);
    vipLabelFolder.open();

    // Actions
    const actionsFolder = gui.addFolder('Actions');
    actionsFolder.add(devSettings, 'fitToView').name('Fit to View');
    actionsFolder.add(devSettings, 'logCamera').name('Log Camera to Console');
    actionsFolder.open();

    // GLB Cameras folder
    const glbCameraFolder = gui.addFolder('GLB Cameras');
    glbCameraFolder.open();

    // GLB Lights folders
    const pointLightsFolder = gui.addFolder('Point Lights');
    pointLightsFolder.open();

    const spotLightsFolder = gui.addFolder('Spot Lights');
    spotLightsFolder.open();

    window.guiFolders = {
        cameras: glbCameraFolder,
        pointLights: pointLightsFolder,
        spotLights: spotLightsFolder
    };

    controls.addEventListener('change', () => {
        devSettings.cameraX = camera.position.x;
        devSettings.cameraY = camera.position.y;
        devSettings.cameraZ = camera.position.z;
        devSettings.targetX = controls.target.x;
        devSettings.targetY = controls.target.y;
        devSettings.targetZ = controls.target.z;
        gui.updateDisplay();
    });
}

// Update court label positions
function updateCourtLabels(): void {
    courtLabels.forEach((label) => {
        const screenPosition = label.position.clone();
        screenPosition.project(camera);

        const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(screenPosition.y * 0.5) + 0.5) * window.innerHeight;

        if (screenPosition.z < 1) {
            label.element.style.display = 'block';
            label.element.style.left = `${x}px`;
            label.element.style.top = `${y}px`;
        } else {
            label.element.style.display = 'none';
        }
    });
}

function onWindowResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
}

function animate(time: number): void {
    requestAnimationFrame(animate);
    controls.update();
    updateCourtLabels();
    composer.render();
}

// Start Three.js when page loads
window.addEventListener('load', initThreeJS);

// UI Controls
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            menuBtn.classList.toggle('active');
        });
    }

    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', () => {
            settingsPanel.classList.toggle('active');
        });
    }

    const registerBtn = document.getElementById('register-btn');
    const registerModal = document.getElementById('register-modal');
    const modalClose = document.getElementById('modal-close');

    if (registerBtn && registerModal) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerModal.classList.add('active');
        });
    }

    if (modalClose && registerModal) {
        modalClose.addEventListener('click', () => {
            registerModal.classList.remove('active');
        });
    }

    if (registerModal) {
        registerModal.addEventListener('click', (e) => {
            if (e.target === registerModal) {
                registerModal.classList.remove('active');
            }
        });
    }

    const infoPopupClose = document.getElementById('info-popup-close');
    const infoPopup = document.getElementById('info-popup');
    if (infoPopupClose && infoPopup) {
        infoPopupClose.addEventListener('click', () => {
            infoPopup.classList.remove('active');
        });
    }

    // Camera view buttons
    const vipViewBtn = document.getElementById('vip-view-btn');
    const topViewBtn = document.getElementById('top-view-btn');
    const freeViewBtn = document.getElementById('free-view-btn');

    if (vipViewBtn) {
        vipViewBtn.addEventListener('click', () => {
            unlockCamera();
            if (glbCameras.length > 1) {
                flyToCamera(glbCameras[1], false);
            } else {
                console.warn('Camera 2 not found in GLB');
            }
        });
    }

    if (topViewBtn) {
        topViewBtn.addEventListener('click', () => {
            if (glbCameras.length > 0) {
                flyToCamera(glbCameras[0], true);
            } else {
                console.warn('No cameras found in GLB');
            }
        });
    }

    if (freeViewBtn) {
        freeViewBtn.addEventListener('click', () => {
            unlockCamera();
            fitCameraToModel();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (settingsPanel) settingsPanel.classList.remove('active');
            if (registerModal) {
                registerModal.classList.remove('active');
            }
            if (mobileMenu) {
                mobileMenu.classList.remove('active');
                if (menuBtn) menuBtn.classList.remove('active');
            }
        }
    });
});
