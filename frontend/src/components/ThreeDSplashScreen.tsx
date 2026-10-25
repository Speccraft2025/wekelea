'use client';

import React, { useEffect, useState } from 'react';

interface ThreeDSplashScreenProps {
  onComplete: () => void;
}

/**
 * Lightweight brand splash. Previously this rendered a 16 MB 3D model via
 * Three.js (which failed to fetch and made loading janky); it's now a smooth
 * CSS/image intro using the lightweight haddy promise mark — no WebGL or heavy assets.
 */
export default function ThreeDSplashScreen({ onComplete }: ThreeDSplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), 1400);
    const done = setTimeout(onComplete, 1800);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0d0d0f] transition-opacity duration-500 ease-in-out ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Warm brand glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,117,5,0.18)_0%,transparent_70%)] pointer-events-none" />

      <div className="flex flex-col items-center text-center space-y-5 z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/haddy-mark.svg"
          alt="haddy promise mark"
          className="w-24 h-24 object-contain drop-shadow-[0_0_25px_rgba(236,117,5,0.45)] wk-logo-in"
        />

        <div className="flex flex-col items-center space-y-1.5">
          <h2 className="text-3xl font-black tracking-wide text-white">haddy</h2>
          <div className="kenya-accent w-24 rounded" style={{ height: '3px' }} />
        </div>

        <p className="text-gray-400 text-[10px] tracking-wider uppercase font-extrabold">
          Put your money where your mouth is.
        </p>

        {/* Smooth CSS-driven progress bar (purely cosmetic) */}
        <div className="w-44 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5 mt-2">
          <div className="h-full bg-gradient-to-r from-[#EC7505] via-[#E89005] to-[#E70E02] rounded-full wk-bar" />
        </div>
      </div>

      <style jsx>{`
        @keyframes wkLogoIn {
          0% {
            opacity: 0;
            transform: scale(0.82) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .wk-logo-in {
          animation: wkLogoIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both,
            wkFloat 2.4s ease-in-out 0.6s infinite;
        }
        @keyframes wkFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        @keyframes wkBar {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
        .wk-bar {
          animation: wkBar 1.4s ease-out both;
        }
      `}</style>
    </div>
  );
}
