"use client";

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface PoseProps {
  headRotation: number;
  bodyTilt: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

// Internal model wrapper that responds to frame updates
function StickmanModel({ pose }: { pose: PoseProps }) {
  const headRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  // Smoothly interpolate current angles to target angles in the R3F loop
  useFrame(() => {
    const targetBodyTilt = (pose.bodyTilt * Math.PI) / 180;
    if (torsoRef.current) {
      torsoRef.current.rotation.z = THREE.MathUtils.lerp(
        torsoRef.current.rotation.z,
        targetBodyTilt,
        0.15
      );
    }

    const targetHeadRot = (pose.headRotation * Math.PI) / 180;
    if (headRef.current) {
      headRef.current.rotation.y = THREE.MathUtils.lerp(
        headRef.current.rotation.y,
        targetHeadRot,
        0.15
      );
    }

    // Arms angle offset relative to spine rotation
    const targetLeftArm = (pose.leftArm * Math.PI) / 180;
    const targetRightArm = (pose.rightArm * Math.PI) / 180;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.z,
        targetLeftArm,
        0.15
      );
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
        rightArmRef.current.rotation.z,
        targetRightArm,
        0.15
      );
    }

    // Legs angles
    const targetLeftLeg = (pose.leftLeg * Math.PI) / 180;
    const targetRightLeg = (pose.rightLeg * Math.PI) / 180;
    if (leftLegRef.current) {
      leftLegRef.current.rotation.z = THREE.MathUtils.lerp(
        leftLegRef.current.rotation.z,
        targetLeftLeg,
        0.15
      );
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.z = THREE.MathUtils.lerp(
        rightLegRef.current.rotation.z,
        targetRightLeg,
        0.15
      );
    }
  });

  return (
    <group position={[0, -0.6, 0]}>
      {/* Spine / Torso group */}
      <group ref={torsoRef}>
        {/* Core Spine */}
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 1.2, 16]} />
          <meshStandardMaterial color="#06b6d4" roughness={0.3} metalness={0.1} />
        </mesh>

        {/* Head */}
        <mesh ref={headRef} position={[0, 2.0, 0]}>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial color="#f472b6" roughness={0.3} />
        </mesh>

        {/* Shoulders */}
        <mesh position={[0, 1.7, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 16]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>

        {/* Left Arm Pivot at shoulder */}
        <group ref={leftArmRef} position={[-0.4, 1.7, 0]}>
          <mesh position={[0, -0.4, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.8, 16]} />
            <meshStandardMaterial color="#f43f5e" />
          </mesh>
          <mesh position={[0, -0.8, 0]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color="#fda4af" />
          </mesh>
        </group>

        {/* Right Arm Pivot at shoulder */}
        <group ref={rightArmRef} position={[0.4, 1.7, 0]}>
          <mesh position={[0, -0.4, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.8, 16]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
          <mesh position={[0, -0.8, 0]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color="#a7f3d0" />
          </mesh>
        </group>
      </group>

      {/* Hip joint */}
      <mesh position={[0, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>

      {/* Left Leg Pivot at hip */}
      <group ref={leftLegRef} position={[-0.25, 0.6, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.04, 1.0, 16]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
        <mesh position={[0, -1.0, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 16]} />
          <meshStandardMaterial color="#93c5fd" />
        </mesh>
      </group>

      {/* Right Leg Pivot at hip */}
      <group ref={rightLegRef} position={[0.25, 0.6, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.04, 1.0, 16]} />
          <meshStandardMaterial color="#8b5cf6" />
        </mesh>
        <mesh position={[0, -1.0, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 16]} />
          <meshStandardMaterial color="#c084fc" />
        </mesh>
      </group>
    </group>
  );
}

interface StickmanProps {
  pose: PoseProps;
}

export default function Stickman({ pose }: StickmanProps) {
  const cameraRef = useRef<any>(null);

  const resetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.reset();
    }
  };

  return (
    <div className="w-full h-80 md:h-[450px] relative rounded-2xl overflow-hidden bg-slate-950/70 border border-white/10 shadow-inner">
      <Canvas camera={{ position: [0, 1, 4.5], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
        <pointLight position={[0, -2, 2]} intensity={0.5} color="#06b6d4" />
        
        <StickmanModel pose={pose} />
        
        <gridHelper args={[20, 20, "#1e293b", "#0f172a"]} position={[0, -1.2, 0]} />
        
        <OrbitControls 
          ref={cameraRef}
          enablePan={true}
          enableZoom={true}
          minDistance={2}
          maxDistance={8}
          target={[0, 0.5, 0]}
        />
      </Canvas>

      <button
        onClick={resetCamera}
        className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-900/90 border border-white/10 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition active:scale-95 shadow-md"
      >
        Reset Camera
      </button>
      
      <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-400 pointer-events-none shadow-md">
        3D Stickman (Drag to Rotate)
      </div>
    </div>
  );
}
