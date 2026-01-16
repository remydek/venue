import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Manages camera, controls, and camera transitions
 */
export class CameraManager {
    public camera: THREE.PerspectiveCamera;
    public controls!: OrbitControls;
    public glbCameras: THREE.Camera[] = [];

    private cameraLocked: boolean = false;

    constructor() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.01,
            500
        );
        this.camera.position.set(50, 30, 50);
        console.log('Camera initialized');
    }

    public initOrbitControls(domElement: HTMLElement) {
        this.controls = new OrbitControls(this.camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 3;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        console.log('Orbit controls initialized');
    }

    /**
     * Add a GLB camera (called during model traverse)
     */
    public addGLBCamera(camera: THREE.Camera): void {
        console.log('Found camera in GLB:', camera.name, camera.type);
        this.glbCameras.push(camera);
    }

    /**
     * Fit camera to view the entire model
     */
    public fitToModel(model: THREE.Group): void {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        const modelWidth = size.x;
        const modelHeight = size.y;

        const fovRad = this.camera.fov * (Math.PI / 180);
        const aspect = window.innerWidth / window.innerHeight;
        const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
        const distanceToFitWidth = (modelWidth / 2) / Math.tan(hFov / 2);
        const finalDistance = distanceToFitWidth * 0.85;

        this.camera.position.set(
            finalDistance * 0.7,
            finalDistance * 0.5,
            finalDistance * 0.7
        );

        this.controls.target.set(0, modelHeight * 0.3, 0);
        this.controls.update();

        console.log('Camera fitted to model. Distance:', finalDistance);
    }

    public flyToPoint(
        point: THREE.Vector3,
        distance = 0.2,
        polarAngle = Math.PI / 4,
        azimuthAngle = 0
    ): void {
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();

        const startOffset = startPos.clone().sub(startTarget);

        const startSpherical = new THREE.Spherical().setFromVector3(startOffset);
        const endSpherical = new THREE.Spherical(
            distance,
            polarAngle,
            azimuthAngle
        );

        const duration = 1200;
        const startTime = performance.now();

        const animate = (time: number): void => {
            const t = Math.min((time - startTime) / duration, 1);
            const eased = t < 0.5
                ? 2 * t * t
                : 1 - Math.pow(-2 * t + 2, 2) / 2;

            let deltaTheta = endSpherical.theta - startSpherical.theta;
            if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
            if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;

            const spherical = new THREE.Spherical(
                THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, eased),
                THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, eased),
                startSpherical.theta + deltaTheta * eased
            );

            const currentTarget = new THREE.Vector3().lerpVectors(startTarget, point, eased);
            const newPos = new THREE.Vector3()
                .setFromSpherical(spherical)
                .add(currentTarget);

            this.camera.position.copy(newPos);
            this.controls.target.copy(currentTarget);
            this.controls.update();

            if (t < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    public flyToCamera(targetCam: THREE.Object3D, locked: boolean = false, zoomMultiplier: number = 1.0): void {
        console.log('Flying to camera:', targetCam.name, locked ? '(locked)' : '(free)');

        const targetPos = new THREE.Vector3();
        targetCam.getWorldPosition(targetPos);

        const targetDir = new THREE.Vector3(0, 0, -1);
        targetDir.applyQuaternion(targetCam.quaternion);

        const lookAtPoint = targetPos.clone().add(targetDir.multiplyScalar(10));

        // Apply zoom multiplier if needed (e.g., for top view)
        if (zoomMultiplier !== 1.0) {
            const direction = lookAtPoint.clone().sub(targetPos).normalize();
            const currentDistance = targetPos.distanceTo(lookAtPoint);
            const newDistance = currentDistance / zoomMultiplier;
            targetPos.copy(lookAtPoint).sub(direction.multiplyScalar(newDistance));
            console.log(`Zoom applied: ${zoomMultiplier}x (distance: ${currentDistance.toFixed(2)} -> ${newDistance.toFixed(2)})`);
        }

        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const duration = 1500;
        const startTime = performance.now();

        this.cameraLocked = locked;

        // Temporarily remove distance limits during animation
        this.controls.minDistance = 0;
        this.controls.maxDistance = Infinity;

        const animate = (currentTime: number): void => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            this.camera.position.lerpVectors(startPos, targetPos, eased);
            this.controls.target.lerpVectors(startTarget, lookAtPoint, eased);
            this.controls.update();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete - set final state
                this.controls.target.copy(lookAtPoint);
                this.controls.minDistance = 0.1;
                this.controls.maxDistance = 500;
                this.controls.enableZoom = true;
                this.controls.enableRotate = !locked;
                this.controls.enablePan = !locked;
                this.controls.minPolarAngle = 0.1;
                this.controls.maxPolarAngle = Math.PI - 0.1;
                this.controls.enableDamping = false;
                this.controls.update();
                this.controls.saveState();

                if (locked) {
                    console.log('Camera controls locked');
                }
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Unlock camera controls (enable rotation and pan)
     */
    public unlockControls(): void {
        this.cameraLocked = false;
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        console.log('Camera controls unlocked');
    }

    /**
     * Lock camera controls (disable rotation and pan)
     */
    public lockControls(): void {
        this.cameraLocked = true;
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        console.log('Camera controls locked');
    }

    /**
     * Set specific control permissions
     */
    public setControlsEnabled(rotate: boolean, pan: boolean, zoom: boolean): void {
        this.controls.enableRotate = rotate;
        this.controls.enablePan = pan;
        this.controls.enableZoom = zoom;
    }

    /**
     * Update controls (call in animation loop)
     */
    public update(): void {
        this.controls.update();
    }

    /**
     * Handle window resize
     */
    public onResize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public findCameraByName(name: string): THREE.Camera | undefined {
        const cam = this.glbCameras.find(
            c => c.name.toLowerCase() === name.toLowerCase()
        );

        if (!cam) {
            console.warn(
                `Camera "${name}" not found in GLB. Available:`,
                this.glbCameras.map(c => c.name)
            );
        }

        return cam;
    }

    public logCameraState(): void {
        console.log('Camera Position:', this.camera.position);
        console.log('Controls Target:', this.controls.target);
        console.log('Controls Locked:', this.cameraLocked);
    }

    public dispose(): void {
        this.controls.dispose();
        console.log('Camera manager disposed');
    }
}