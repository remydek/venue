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
interface DevSettings {
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
    topViewZoom: number;
    topViewMinZoom: number;
    topViewMaxZoom: number;
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

// Dev controls settings
const devSettings: DevSettings = {
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
    topViewZoom: 1.5,
    topViewMinZoom: 20,
    topViewMaxZoom: 150,
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
    controls.minDistance = 5;
    controls.maxDistance = 200;
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
            populateGLBControls();

            // Start with camera_b view
            const startCamera = glbCameras.find(cam => cam.name.toLowerCase() === 'camera_b');
            if (startCamera) {
                setTimeout(() => {
                    flyToCamera(startCamera, false);
                }, 100);
            }

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

    // For camera_top, apply zoom multiplier from settings
    if (targetCam.name.toLowerCase() === 'camera_top' && devSettings.topViewZoom !== 1.0) {
        const zoomMultiplier = devSettings.topViewZoom;
        // Move camera closer (zoom > 1) or farther (zoom < 1) along the view direction
        const direction = lookAtPoint.clone().sub(targetPos).normalize();
        const currentDistance = targetPos.distanceTo(lookAtPoint);
        const newDistance = currentDistance / zoomMultiplier;
        targetPos.copy(lookAtPoint).sub(direction.multiplyScalar(newDistance));
        console.log(`Top View zoom applied: ${zoomMultiplier}x (distance: ${currentDistance.toFixed(2)} -> ${newDistance.toFixed(2)})`);
    }

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1500;
    const startTime = performance.now();

    cameraLocked = locked;

    // Store original limits and temporarily remove them during animation
    const origMinDist = controls.minDistance;
    const origMaxDist = controls.maxDistance;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;

    function animateFly(currentTime: number): void {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        camera.position.lerpVectors(startPos, targetPos, eased);
        controls.target.lerpVectors(startTarget, lookAtPoint, eased);
        controls.update();

        if (progress < 1) {
            requestAnimationFrame(animateFly);
        } else {
            // Keep limits open for camera views (don't restore restrictive limits)
            controls.minDistance = 0.1;
            controls.maxDistance = 500;

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

    controls.target.set(0, modelHeight * 0.3, 0);
    controls.update();

    console.log('Model size:', size);
    console.log('Final distance:', finalDistance);
    console.log('Camera position:', camera.position);
}

// Initialize dev GUI
function initDevGUI(): void {
    gui = new dat.GUI({ width: 300 });
    gui.domElement.style.marginTop = '50px';

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

    // Model folder
    const modelFolder = gui.addFolder('Model');
    modelFolder.add(devSettings, 'modelScale', 0.1, 5).onChange((v: number) => {
        if (model) {
            model.scale.set(v, v, v);
        }
    });

    // Top View folder
    const topViewFolder = gui.addFolder('Top View');
    topViewFolder.add(devSettings, 'topViewZoom', 0.1, 5).name('Zoom Multiplier').onChange((v: number) => {
        console.log('Top View Zoom set to:', v);
    });

    // Actions
    const actionsFolder = gui.addFolder('Actions');
    actionsFolder.add(devSettings, 'fitToView').name('Fit to View');
    actionsFolder.add(devSettings, 'logCamera').name('Log Camera to Console');

    // GLB Cameras folder
    const glbCameraFolder = gui.addFolder('GLB Cameras');

    // GLB Lights folders
    const pointLightsFolder = gui.addFolder('Point Lights');

    const spotLightsFolder = gui.addFolder('Spot Lights');

    window.guiFolders = {
        cameras: glbCameraFolder,
        pointLights: pointLightsFolder,
        spotLights: spotLightsFolder
    };
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

    // Waitlist form handling
    const waitlistForm = document.getElementById('waitlist-form') as HTMLFormElement;
    const waitlistModal = document.querySelector('.waitlist-modal');
    const waitlistSuccess = document.getElementById('waitlist-success');
    const successClose = document.getElementById('success-close');
    const queuePosition = document.getElementById('queue-position');
    const peopleWaiting = document.getElementById('people-waiting');

    if (waitlistForm) {
        waitlistForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = waitlistForm.querySelector('.waitlist-submit');

            if (submitBtn) {
                submitBtn.classList.add('loading');

                // Simulate API call
                setTimeout(() => {
                    submitBtn.classList.remove('loading');

                    // Update queue position
                    const currentWaiting = parseInt(peopleWaiting?.textContent || '243');
                    if (queuePosition) {
                        queuePosition.textContent = String(currentWaiting + 1);
                    }

                    // Show success state
                    if (waitlistModal && waitlistSuccess) {
                        (waitlistModal as HTMLElement).style.display = 'none';
                        waitlistSuccess.style.display = 'block';
                    }
                }, 1500);
            }
        });
    }

    if (successClose && registerModal) {
        successClose.addEventListener('click', () => {
            registerModal.classList.remove('active');
            // Reset form and views after close
            setTimeout(() => {
                if (waitlistModal) {
                    (waitlistModal as HTMLElement).style.display = 'block';
                }
                if (waitlistSuccess) {
                    waitlistSuccess.style.display = 'none';
                }
                if (waitlistForm) {
                    waitlistForm.reset();
                }
            }, 300);
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
    const tableBBtn = document.getElementById('table-b-btn');
    const tableB1Btn = document.getElementById('table-b1-btn');
    const topViewBtn = document.getElementById('top-view-btn');
    const freeViewBtn = document.getElementById('free-view-btn');

    // Helper function to find camera by name
    const findCameraByName = (name: string): THREE.Camera | undefined => {
        console.log('Looking for camera:', name);
        console.log('Available cameras:', glbCameras.map(c => c.name));
        const found = glbCameras.find(cam => cam.name.toLowerCase() === name.toLowerCase());
        console.log('Found:', found ? found.name : 'NOT FOUND');
        return found;
    };

    if (tableBBtn) {
        tableBBtn.addEventListener('click', () => {
            console.log('Table B button clicked');
            unlockCamera();
            const cam = findCameraByName('camera_b');
            if (cam) {
                flyToCamera(cam, false);
            } else {
                console.warn('Camera "camera_b" not found in GLB. Available:', glbCameras.map(c => c.name));
            }
        });
    }

    if (tableB1Btn) {
        tableB1Btn.addEventListener('click', () => {
            console.log('Table B1 button clicked');
            unlockCamera();
            const cam = findCameraByName('camera_b1');
            if (cam) {
                flyToCamera(cam, false);
            } else {
                console.warn('Camera "camera_b1" not found in GLB. Available:', glbCameras.map(c => c.name));
            }
        });
    }

    if (topViewBtn) {
        topViewBtn.addEventListener('click', () => {
            console.log('Top View button clicked');
            const cam = findCameraByName('camera_top');
            if (cam) {
                flyToCamera(cam, true);
            } else {
                console.warn('Camera "camera_top" not found in GLB. Available:', glbCameras.map(c => c.name));
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
