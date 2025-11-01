
import React, { useEffect, useRef } from 'react';

declare global {
    interface Window {
        gsap?: any;
        THREE?: any;
    }
}

const ThreeScene: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!window.THREE || !window.gsap || !canvasRef.current) return;

        const THREE = window.THREE;
        const gsap = window.gsap;
        const canvas = canvasRef.current;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Material & Geometry
        const material = new THREE.MeshStandardMaterial({
            color: 0x121212,
            roughness: 0.2,
            metalness: 0.8,
            flatShading: true,
        });
        const geometry = new THREE.IcosahedronGeometry(2, 6);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        scene.add(ambientLight);

        const pointLight1 = new THREE.PointLight(0xBB86FC, 1, 100);
        pointLight1.position.set(5, 5, 5);
        scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x03DAC6, 1, 100);
        pointLight2.position.set(-5, -5, -5);
        scene.add(pointLight2);
        
        camera.position.z = 5;

        // Animation
        const clock = new THREE.Clock();
        const tick = () => {
            const elapsedTime = clock.getElapsedTime();
            mesh.rotation.y = 0.2 * elapsedTime;
            mesh.rotation.x = 0.1 * elapsedTime;
            renderer.render(scene, camera);
            window.requestAnimationFrame(tick);
        };
        tick();

        // Handle Resize
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        };
        window.addEventListener('resize', handleResize);

        // GSAP Intro Animation
        gsap.from(mesh.scale, { duration: 1.5, x: 0, y: 0, z: 0, ease: 'power3.out' });

        return () => {
            window.removeEventListener('resize', handleResize);
            // Clean up Three.js resources if needed
        };
    }, []);

    return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: 10 }} />;
};

export default ThreeScene;
