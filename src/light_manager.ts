import * as THREE from 'three';

export interface PointLightPreset {
    intensity: number;
    color: THREE.ColorRepresentation;
    distance: number;
    decay: number;
}

export const LIGHT_PRESETS = {
    purple: {
        intensity: 39,
        color: '#4700ff',
        distance: 100,
        decay: 0
    },
    pink: {
        intensity: 7,
        color: '#d400ff',
        distance: 0,
        decay: 0
    },
    spot: {
        intensity: 24,
        color: '#ffc4af',
        distance: 0,
        angle: 10, // degrees
        penumbra: 1,
        decay: 1.4
    }
} as const;

/**
 * Shadow quality settings
 */
const SHADOW_CONFIG = {
    mapSize: 2048,
    bias: -0.0001,
    normalBias: 0.02,
    radius: 2,
    camera: {
        near: 0.1,
        far: 100,
        // For directional lights
        left: -50,
        right: 50,
        top: 50,
        bottom: -50
    }
} as const;

export class LightManager {
    private scene: THREE.Scene;
    public ambientLight: THREE.AmbientLight | null = null;
    public directionalLight: THREE.DirectionalLight | null = null;

    // GLB imported lights organized by type
    public glbLights: THREE.Light[] = [];
    public glbPointLights: THREE.PointLight[] = [];
    public glbSpotLights: THREE.SpotLight[] = [];
    public glbDirectionalLights: THREE.DirectionalLight[] = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Initialize basic scene lighting (ambient + directional)
     */
    public setupBaseLighting(
        ambientColor: string = '#ffffff',
        ambientIntensity: number = 0.3,
        directColor: string = '#ffffff',
        directIntensity: number = 2.5
    ): void {
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(
            new THREE.Color(ambientColor),
            ambientIntensity
        );
        this.scene.add(this.ambientLight);

        // Directional light with shadows
        this.directionalLight = new THREE.DirectionalLight(
            new THREE.Color(directColor),
            directIntensity
        );
        this.directionalLight.position.set(5, 10, 7.5);
        this.directionalLight.castShadow = true;

        this.configureShadows(this.directionalLight, 'directional');
        this.scene.add(this.directionalLight);

        console.log('Base lighting initialized');
    }

    private configureShadows(light: THREE.Light, type: 'point' | 'spot' | 'directional'): void {
        if (!light.shadow) return;

        light.shadow.mapSize.width = SHADOW_CONFIG.mapSize;
        light.shadow.mapSize.height = SHADOW_CONFIG.mapSize;
        light.shadow.bias = SHADOW_CONFIG.bias;
        light.shadow.normalBias = SHADOW_CONFIG.normalBias;
        light.shadow.radius = SHADOW_CONFIG.radius;

        switch (type) {
            case 'point':
                const pointLight = light as THREE.PointLight;
                pointLight.shadow.camera.near = SHADOW_CONFIG.camera.near;
                pointLight.shadow.camera.far = SHADOW_CONFIG.camera.far;
                break;

            case 'spot':
                const spotLight = light as THREE.SpotLight;
                spotLight.shadow.camera.near = SHADOW_CONFIG.camera.near;
                spotLight.shadow.camera.far = SHADOW_CONFIG.camera.far;
                spotLight.shadow.camera.fov = 50;
                break;

            case 'directional':
                const dirShadowCam = light.shadow.camera as THREE.OrthographicCamera;
                dirShadowCam.near = 0.5;
                dirShadowCam.far = 500;
                dirShadowCam.left = SHADOW_CONFIG.camera.left;
                dirShadowCam.right = SHADOW_CONFIG.camera.right;
                dirShadowCam.top = SHADOW_CONFIG.camera.top;
                dirShadowCam.bottom = SHADOW_CONFIG.camera.bottom;
                break;
        }
    }

    /**
     * Extract and configure lights from a loaded GLB model
     */
    public processGLBLights(model: THREE.Group): void {
        this.glbLights = [];
        this.glbPointLights = [];
        this.glbSpotLights = [];
        this.glbDirectionalLights = [];

        model.traverse((child: THREE.Object3D) => {
            if (!(child as THREE.Light).isLight) return;

            const light = child as THREE.Light;
            console.log('Found light in GLB:', light.type, 'name:', light.name, 'intensity:', light.intensity);

            this.glbLights.push(light);
            light.castShadow = false; // Initially disabled, can be enabled per light

            if ((light as THREE.PointLight).isPointLight) {
                const pointLight = light as THREE.PointLight;
                this.glbPointLights.push(pointLight);

                pointLight.decay = 2;
                pointLight.distance = 0;
                this.configureShadows(pointLight, 'point');

            } else if ((light as THREE.SpotLight).isSpotLight) {
                const spotLight = light as THREE.SpotLight;
                this.glbSpotLights.push(spotLight);

                spotLight.penumbra = 0.5;
                spotLight.decay = 2;
                this.configureShadows(spotLight, 'spot');

            } else if ((light as THREE.DirectionalLight).isDirectionalLight) {
                const dirLight = light as THREE.DirectionalLight;
                this.glbDirectionalLights.push(dirLight);
                this.configureShadows(dirLight, 'directional');
            }
        });

        console.log(`Processed GLB lights: ${this.glbPointLights.length} point, ${this.glbSpotLights.length} spot, ${this.glbDirectionalLights.length} directional`);

        // Apply presets after processing
        this.applyLightPresets();
    }

    public applyLightPresets(): void {
        this.glbPointLights.forEach(light => {
            const name = light.name.toLowerCase();

            if (name.includes('purple')) {
                this.applyPointLightPreset(light, LIGHT_PRESETS.purple);
                console.log('Applied purple light preset:', light.name);
            } else if (name.includes('pink')) {
                this.applyPointLightPreset(light, LIGHT_PRESETS.pink);
                console.log('Applied pink light preset:', light.name);
            }
        });

        this.glbSpotLights.forEach(light => {
            const name = light.name.toLowerCase();

            if (name.includes('spot')) {
                this.applySpotLightPreset(light, LIGHT_PRESETS.spot);
                console.log('Applied spot light preset:', light.name);
            }
        });

        console.log('Light presets applied');
    }

    private applyPointLightPreset(
        light: THREE.PointLight,
        preset: PointLightPreset
    ): void {
        light.visible = true;
        light.intensity = preset.intensity;
        light.color.set(preset.color);
        light.distance = preset.distance;
        light.decay = preset.decay;
    }

    private applySpotLightPreset(
        light: THREE.SpotLight,
        preset: typeof LIGHT_PRESETS.spot
    ): void {
        light.visible = true;
        light.intensity = preset.intensity;
        light.color.set(preset.color);
        light.distance = preset.distance;
        light.angle = THREE.MathUtils.degToRad(preset.angle);
        light.penumbra = preset.penumbra;
        light.decay = preset.decay;
    }

    public updateAmbientLight(intensity: number, color?: string): void {
        if (!this.ambientLight) return;

        this.ambientLight.intensity = intensity;

        if (color) {
            this.ambientLight.color.set(color);
        }
    }

    public updateDirectionalLight(intensity: number, color?: string): void {
        if (!this.directionalLight) return;

        this.directionalLight.intensity = intensity;
        if (color) {
            this.directionalLight.color.set(color);
        }
    }

    public setPunctualLightsVisible(visible: boolean): void {
        this.glbLights.forEach(light => {
            light.visible = visible;
        });
        console.log(`Punctual lights ${visible ? 'enabled' : 'disabled'}`);
    }

    public setLightShadows(light: THREE.Light, enabled: boolean): void {
        light.castShadow = enabled;
    }

    public updatePointLight(
        light: THREE.PointLight,
        settings: {
            intensity?: number;
            color?: string;
            distance?: number;
            decay?: number;
            visible?: boolean;
        }
    ): void {
        if (settings.intensity !== undefined) light.intensity = settings.intensity;
        if (settings.color !== undefined) light.color.set(settings.color);
        if (settings.distance !== undefined) light.distance = settings.distance;
        if (settings.decay !== undefined) light.decay = settings.decay;
        if (settings.visible !== undefined) light.visible = settings.visible;
    }

    public updateSpotLight(
        light: THREE.SpotLight,
        settings: {
            intensity?: number;
            color?: string;
            distance?: number;
            angle?: number; // in degrees
            penumbra?: number;
            decay?: number;
            visible?: boolean;
        }
    ): void {
        if (settings.intensity !== undefined) light.intensity = settings.intensity;
        if (settings.color !== undefined) light.color.set(settings.color);
        if (settings.distance !== undefined) light.distance = settings.distance;
        if (settings.angle !== undefined) light.angle = THREE.MathUtils.degToRad(settings.angle);
        if (settings.penumbra !== undefined) light.penumbra = settings.penumbra;
        if (settings.decay !== undefined) light.decay = settings.decay;
        if (settings.visible !== undefined) light.visible = settings.visible;
    }

    public dispose(): void {
        if (this.ambientLight) {
            this.scene.remove(this.ambientLight);
        }
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
            this.directionalLight.dispose();
        }

        this.glbLights = [];
        this.glbPointLights = [];
        this.glbSpotLights = [];
        this.glbDirectionalLights = [];
    }
}