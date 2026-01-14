import * as THREE from 'three';
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

export const TONE_MAPPING_MODES: { [key: string]: ToneMappingMode } = {
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

export class RenderManager {
    public renderer: THREE.WebGLRenderer;
    public composer: EffectComposer;
    public bloomEffect: BloomEffect;
    public vignetteEffect: VignetteEffect;
    public smaaEffect: SMAAEffect;
    public toneMappingEffect: ToneMappingEffect;

    constructor(
        container: HTMLElement,
        private scene: THREE.Scene,
        private camera: THREE.Camera
    ) {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false, // SMAA handles anti-aliasing
            powerPreference: 'high-performance',
            alpha: false,
            stencil: false
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // High quality shadow settings
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        this.renderer.shadowMap.autoUpdate = true;

        // Color and tone mapping
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMappingExposure = Math.pow(2, -2); // -2 EV default

        container.appendChild(this.renderer.domElement);
        console.log('WebGL renderer initialized');

        this.composer = new EffectComposer(this.renderer, {
            frameBufferType: THREE.HalfFloatType,
            multisampling: 4
        });

        // Add render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Create effects with default settings
        this.bloomEffect = new BloomEffect({
            intensity: 0.17,
            luminanceThreshold: 1,
            luminanceSmoothing: 0.025,
            radius: 0.44,
            mipmapBlur: true
        });

        this.vignetteEffect = new VignetteEffect({
            offset: 0.3,
            darkness: 0.5
        });

        this.smaaEffect = new SMAAEffect({
            preset: SMAAPreset.ULTRA
        });

        this.toneMappingEffect = new ToneMappingEffect({
            mode: ToneMappingMode.ACES_FILMIC
        });

        // Add effects pass
        const effectPass = new EffectPass(
            this.camera,
            this.bloomEffect,
            this.vignetteEffect,
            this.smaaEffect,
            this.toneMappingEffect
        );
        this.composer.addPass(effectPass);

        console.log('Post-processing initialized');
    }

    public render(): void {
        this.composer.render();
    }

    public setSize(width: number, height: number): void {
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }

    public setToneMappingByName(name: string): void {
        const mode = TONE_MAPPING_MODES[name];
        if (mode !== undefined) {
            this.toneMappingEffect.mode = mode;
        } else {
            console.warn(`Unknown tone mapping mode: ${name}`);
        }
    }

    public getToneMappingModeNames(): string[] {
        return Object.keys(TONE_MAPPING_MODES);
    }

    public getToneMappingName(): string {
        const current = this.toneMappingEffect.mode;

        const entry = Object.entries(TONE_MAPPING_MODES)
            .find(([_, mode]) => mode === current);

        return entry ? entry[0] : 'Unknown';
    }

    public get domElement(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    /**
     * Dispose of all effects and composer
     */
    public dispose(): void {
        this.composer.dispose();
        console.log('Post-processing disposed');
    }
}