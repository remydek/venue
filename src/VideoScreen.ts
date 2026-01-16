import * as THREE from 'three';

export class VideoScreen {
    private video: HTMLVideoElement;
    private texture: THREE.VideoTexture;

    constructor(
        mesh: THREE.Mesh,
        src: string,
        {
            autoplay = true,
            loop = true,
            muted = true,
            delay = 0
        } = {}
    ) {
        this.video = document.createElement('video');
        this.video.src = src;
        this.video.loop = loop;
        this.video.muted = muted;
        this.video.playsInline = true;
        this.video.crossOrigin = 'anonymous';

        this.texture = new THREE.VideoTexture(this.video);
        this.texture.flipY = false;
        this.texture.needsUpdate = true;
        this.texture.colorSpace = THREE.SRGBColorSpace;

        // mesh.material = new THREE.MeshBasicMaterial({
        //     map: this.texture,
        //     toneMapped: false
        // });

        mesh.material = new THREE.MeshStandardMaterial({
            map: this.texture,
            emissive: new THREE.Color(1, 1, 1),
            emissiveMap: this.texture,
            emissiveIntensity: 3.0,
            toneMapped: false
        });

        if (autoplay) {
            const start = () => this.video.play().catch(() => {});
            delay > 0 ? setTimeout(start, delay) : start();

            // iOS fallback
            window.addEventListener('pointerdown', start, { once: true });
        }
    }

    dispose() {
        this.video.pause();
        this.texture.dispose();
    }
}
