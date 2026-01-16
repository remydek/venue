import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as dat from 'dat.gui';
import { LightManager } from "./light_manager.ts";
import { RenderManager } from "./render_manager.ts";
import {CameraManager} from "./camera_manager.ts";
import {VideoScreen} from "./VideoScreen.ts";

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
let model: THREE.Group;
let gui: dat.GUI;
let tennisBalls: THREE.Object3D[] = [];
let envMap: THREE.Texture;

let lightManager: LightManager;
let renderManager : RenderManager;
let cameraManager: CameraManager;

let tableSelectors: THREE.Object3D[][] = [];

// Dev controls settings
const devSettings: DevSettings = {
    exposure: -2,
    toneMapping: 'Linear',
    ambientIntensity: 0.3,
    ambientColor: '#ffffff',
    directIntensity: 2.5,
    directColor: '#ffffff',
    punctualLights: true,
    envIntensity: 3,
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
    fitToView: () => cameraManager.fitToModel(model),
    logCamera: () => cameraManager.logCameraState()
};

function deselectTable() {
    renderManager?.selectOutlineObjects([]);

    tablePosition.set(0, 10000, 0);
}

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

    cameraManager = new CameraManager();
    renderManager = new RenderManager(container, scene, cameraManager.camera);
    lightManager = new LightManager(scene);
    lightManager.setupBaseLighting();
    cameraManager.initOrbitControls(renderManager.domElement);

    const raycaster = new THREE.Raycaster();
    const tap = new THREE.Vector2();
    const worldPos = new THREE.Vector3();

    renderManager.domElement.addEventListener('pointerdown', e => {
        tap.x = e.clientX;
        tap.y = e.clientY;
        console.log("Tap", tap);
    });

    renderManager.domElement.addEventListener('pointerup', e => {
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) return; // was drag

        tap.x = (e.clientX / window.innerWidth) * 2 - 1;
        tap.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(tap, cameraManager.camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            let root = findTableRoot(intersects[0].object);
            if (root) {
                renderManager.selectOutlineObjects([]);

                const center = new THREE.Vector3();
                new THREE.Box3().setFromObject(root).getCenter(center);
                cameraManager.flyToPoint(center);
                cameraManager.unlockControls();

                tablePosition.copy(center);
                tablePosition.y += 0.017;

                for (let i = 0; i < tableSelectors.length; i++) {
                    tableSelectors[i][0].getWorldPosition(worldPos);
                    if (worldPos.distanceTo(center) < 0.05 ) {
                        renderManager.selectOutlineObjects(tableSelectors[i]);
                        break;
                    }
                    // var selected = root.getObjectById(tableSelectors[i][0].id);
                    // if (selected) {
                    //     renderManager.selectOutlineObjects(tableSelectors[i]);
                    //     break;
                    // }
                }

                // renderManager.selectOutlineObjects(tableSelectors[0]);
            }

            console.log(root);
            console.log('=== CLICKED POSITION ===');
            console.log(`X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}, Z: ${point.z.toFixed(2)}`);
        }
    });

    function findTableRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let current: THREE.Object3D | null = obj;

        while (current) {
            if (current.name.startsWith("VIP_")) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

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
        // 'final-model.glb?v=' + Date.now(),
        'HI-IBIZA.glb',
        (gltf) => {
            model = gltf.scene;

            // Center the model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            model.position.x = -center.x;
            model.position.y = -box.min.y;
            model.position.z = -center.z;

            lightManager.processGLBLights(model);

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

                if ((child as THREE.Camera).isCamera) {
                    cameraManager.addGLBCamera(child as THREE.Camera);
                }

                if (child.name.startsWith("table_selector_")) {
                    console.log("Table selector added", child);
                    var tableMeshes: THREE.Object3D[] = [];
                    tableMeshes.push(child);
                    tableMeshes.push(...child.children);
                    tableSelectors.push(tableMeshes);
                }

                if (child.name.includes('glass')) {
                    let mesh = child as THREE.Mesh;
                    if (mesh) {
                        // (mesh.material as THREE.MeshStandardMaterial).depthWrite = true;
                    }
                    // child.userData.excludeOutline = true;
                    // child.layers.set(1);
                }

                if (child.name.startsWith('LED_Screen001')) {
                    console.log("Screen: " + child.name);

                    new VideoScreen(child as THREE.Mesh, 'LEDSCREEN.mp4', {
                        delay: 1000
                    });
                }
            });

            // Scale up the model
            model.scale.set(2.5, 2.5, 2.5);
            scene.add(model);

            // Recalculate size after scaling
            const scaledBox = new THREE.Box3().setFromObject(model);
            const scaledSize = scaledBox.getSize(new THREE.Vector3());

            console.log('Original model size:', size);
            console.log('Scaled model size:', scaledSize);
            console.log('Model center:', center);

            cameraManager.fitToModel(model);
            populateGLBControls();

            // const startCamera = cameraManager.findCameraByName('camera_b')
            // if (startCamera) {
            //     setTimeout(() => {
            //         cameraManager.flyToCamera(startCamera);
            //     }, 100);
            // }

            setTimeout(() => {
                cameraManager.flyToPoint(center, 1);
            }, 100);

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

const tablePosition = new THREE.Vector3(0, 1000, 0);
const popup = document.querySelector('#popup') as HTMLElement;

function updatePopup() {
    const popup = document.getElementById('popup');
    if (!popup) return;

    const vector = tablePosition.clone();
    vector.project(cameraManager.camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

    // Use translate3d for sub-pixel precision and GPU acceleration.
    // We include the -50% and -100% here to keep the popup centered and above the point.
    // popup.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    const tiltX = (cameraManager.camera.position.y / 10) * 45;

    popup.style.transform = `
        translate3d(${x}px, ${y}px, 0) 
        translate(-50%, -100%) 
        perspective(1000px) 
        rotateX(${-tiltX}deg)
    `;

    popup.style.display = vector.z > 1 ? 'none' : 'block';
}

// Populate GLB camera buttons and light controls
function populateGLBControls(): void {
    if (!window.guiFolders) return;

    cameraManager.glbCameras.forEach((glbCam, index) => {
        const camName = glbCam.name || `Camera ${index + 1}`;
        const flyToFunc = () => cameraManager.flyToCamera(glbCam);
        window.guiFolders.cameras.add({ [camName]: flyToFunc }, camName).name(`Fly to: ${camName}`);
    });

    lightManager.glbPointLights.forEach((light, index) => {
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

    lightManager.glbSpotLights.forEach((light, index) => {
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

    console.log(`Added ${cameraManager.glbCameras.length} camera buttons, ${lightManager.glbPointLights.length} point lights, ${lightManager.glbSpotLights.length} spot lights to GUI`);
}

// Initialize dev GUI
function initDevGUI(): void {
    gui = new dat.GUI({ width: 300 });
    gui.domElement.style.marginTop = '50px';

    // Renderer folder
    const rendererFolder = gui.addFolder('Renderer');
    rendererFolder.add(devSettings, 'exposure', -5, 5).name('Exposure (EV)').onChange((v: number) => {
        renderManager.renderer.toneMappingExposure = Math.pow(2, v);
    });

    devSettings.toneMapping = renderManager.getToneMappingName();
    rendererFolder.add(devSettings, 'toneMapping', renderManager.getToneMappingModeNames())
        .name('Tone Mapping')
        .onChange((v: string) => {
            renderManager.setToneMappingByName(v);
        });

    const lightFolder = gui.addFolder('Lighting');
    lightFolder.add(devSettings, 'ambientIntensity', 0, 2).name('Ambient Intensity').onChange((v: number) => {
        lightManager.updateAmbientLight(v);
    });
    lightFolder.add(devSettings, 'directIntensity', 0, 5).name('Direct Intensity').onChange((v: number) => {
        lightManager.updateDirectionalLight(v);
    });
    lightFolder.add(devSettings, 'punctualLights').name('Punctual Lights').onChange((v: boolean) => {
        lightManager.glbLights.forEach(light => {
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
        renderManager.bloomEffect.blendMode.opacity.value = v ? 1 : 0;
    });
    postFolder.add(devSettings, 'bloomIntensity', 0, 3).name('Bloom Intensity').onChange((v: number) => {
        renderManager.bloomEffect.intensity = v;
    });
    postFolder.add(devSettings, 'bloomLuminanceThreshold', 0, 1).name('Bloom Threshold').onChange((v: number) => {
        renderManager.bloomEffect.luminanceMaterial.threshold = v;
    });
    postFolder.add(devSettings, 'bloomRadius', 0, 1).name('Bloom Radius').onChange((v: number) => {
        renderManager.bloomEffect.mipmapBlurPass.radius = v;
    });

    postFolder.add(devSettings, 'vignetteEnabled').name('Vignette').onChange((v: boolean) => {
        renderManager.vignetteEffect.blendMode.opacity.value = v ? 1 : 0;
    });
    postFolder.add(devSettings, 'vignetteOffset', 0, 1).name('Vignette Offset').onChange((v: number) => {
        renderManager.vignetteEffect.offset = v;
    });
    postFolder.add(devSettings, 'vignetteDarkness', 0, 1).name('Vignette Darkness').onChange((v: number) => {
        renderManager.vignetteEffect.darkness = v;
    });

    const outlineFolder = gui.addFolder('Outline Effect');

    outlineFolder.add({ enabled: true }, 'enabled').onChange((v) => {
        renderManager.setOutlineEnabled(v);
    });

    outlineFolder.add({ strength: 2.5 }, 'strength', 0, 10).onChange((v) => {
        renderManager.setOutlineStrength(v);
    });

    outlineFolder.add({ blurriness: 2.5 }, 'blurriness', 0, 10).onChange((v) => {
        renderManager.outlineEffect.blur = true;
        renderManager.outlineEffect.blurPass.scale = v;
    })

    outlineFolder.addColor({ color: 0xff38 }, 'color').onChange((v) => {
        renderManager.setOutlineColor(v);
    });

    outlineFolder.add({ pulse: 0 }, 'pulse', 0, 3).onChange((v) => {
        renderManager.setOutlinePulse(v);

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
    cameraManager.onResize(width, height);
    renderManager.setSize(width, height);
}

function animate(time: number): void {
    requestAnimationFrame(animate);
    cameraManager.update();
    updatePopup();
    renderManager.render();
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

    const reserveButton = document.getElementById('reserve-btn');

    const bookModal = document.getElementById('book-modal');
    const bookModalClose = document.getElementById('modal-book-close');

    console.log("reserveButton", reserveButton)

    const popupActionButton = document.querySelector('.waitlist-submit .submit-text');

    if (registerBtn && registerModal) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerModal.classList.add('active');

            popupActionButton!.textContent = "JOIN WAITLIST NOW";
        });
    }

    if (reserveButton && bookModal) {
        reserveButton.addEventListener('click', (e) => {
            console.log("RESERVE CLICKEd")
            e.preventDefault();
            bookModal.classList.add('active');
        })
    }

    if (modalClose && registerModal) {
        modalClose.addEventListener('click', () => {
            registerModal.classList.remove('active');
        });
    }

    if (bookModalClose && bookModal) {
        bookModalClose.addEventListener('click', () => {
            bookModal.classList.remove('active');
        })
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

    const topViewBtn = document.getElementById('top-view-btn');
    const freeViewBtn = document.getElementById('free-view-btn');

    if (topViewBtn) {
        topViewBtn.addEventListener('click', () => {
            console.log('Top View button clicked');
            cameraManager.flyToPoint(new THREE.Vector3(0, 0, 0), 1.5, 0);
            cameraManager.lockControls();

            deselectTable();
        });
    }

    if (freeViewBtn) {
        freeViewBtn.addEventListener('click', () => {
            cameraManager.unlockControls();
            cameraManager.flyToPoint(new THREE.Vector3(0, 0.1, 0), 0.5, Math.PI / 4, Math.PI / 3);
            // cameraManager.fitToModel(model);

            deselectTable();
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
