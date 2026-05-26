'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ThreeDSplashScreenProps {
  onComplete: () => void;
}

export default function ThreeDSplashScreen({ onComplete }: ThreeDSplashScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingDone, setLoadingDone] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 320;
    const height = containerRef.current.clientHeight || 320;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background to blend with CSS gradient

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xfff3e0, 2.5); // Golden ambient warm light
    directionalLight1.position.set(5, 5, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xec7505, 2.0); // Brand Orange accent light
    directionalLight2.position.set(-5, -5, 2);
    scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
    pointLight.position.set(0, 0, 4);
    scene.add(pointLight);

    // 5. GLTF Loader for the 3D GLB model
    const loader = new GLTFLoader();
    let model: THREE.Group | null = null;

    loader.load(
      '/assets/wekelea 3d logo.glb',
      (gltf) => {
        model = gltf.scene;

        // Auto-center and normalize size
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Shift model origin to exactly center of geometry
        model.position.sub(center);

        // Scale model to standard 2.0 size viewport unit
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.2 / maxDim;
        model.scale.setScalar(scale);

        scene.add(model);
        setLoadingDone(true);
      },
      (xhr) => {
        if (xhr.total > 0) {
          const progress = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingProgress(progress);
        } else {
          // If total is 0 (unsupported header by mock dev server), increment artificially for visuals
          setLoadingProgress((prev) => Math.min(prev + 10, 95));
        }
      },
      (error) => {
        console.error('An error happened loading the 3D model:', error);
        // Fallback progress
        setLoadingProgress(100);
        setLoadingDone(true);
      }
    );

    // 6. Animation loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (model) {
        // Rotate on its own vertical axis (Y-axis)
        model.rotation.y = clock.getElapsedTime() * 1.5;
        // Subtle floating effect on the vertical axis (Y-axis offset)
        model.position.y = Math.sin(clock.getElapsedTime() * 2.0) * 0.1;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle screen resize
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 7. Timer to complete splash screen after 2.5 seconds (2 seconds logo animation as requested + transition fade)
    const splashTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      clearTimeout(splashTimer);
      renderer.dispose();
    };
  }, [onComplete]);

  // Artificially hit 100% if loading was successful but loader stream had no size header
  useEffect(() => {
    if (loadingDone) {
      setLoadingProgress(100);
    }
  }, [loadingDone]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0d0d0f] transition-opacity duration-500 ease-in-out">
      {/* Warm brand glow gradient backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,117,5,0.18)_0%,transparent_75%)] pointer-events-none" />
      
      {/* 3D Canvas Box */}
      <div ref={containerRef} className="w-80 h-80 relative flex items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Brand Title & Info Overlay */}
      <div className="flex flex-col items-center text-center space-y-4 z-10 -mt-4">
        <div className="flex flex-col items-center space-y-1 animate-pulse">
          <h2 className="text-3xl font-black uppercase tracking-widest text-white">Wekelea</h2>
          <div className="kenya-accent w-24 rounded" style={{ height: '3px' }} />
        </div>
        <p className="text-gray-400 text-[10px] tracking-wider uppercase font-extrabold">Peer-to-Peer Escrow Platform</p>
        
        {/* High-fidelity sunset gradient loading bar */}
        <div className="w-44 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 mt-4 relative">
          <div 
            className="h-full bg-gradient-to-r from-[#EC7505] via-[#E89005] to-[#E70E02] rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(236,117,5,0.5)]"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
        <span className="text-[9px] font-bold text-gray-500 font-mono tracking-widest uppercase">
          {loadingProgress < 100 ? `Loading Asset... ${loadingProgress}%` : 'Vault Escrow Ready'}
        </span>
      </div>
    </div>
  );
}
