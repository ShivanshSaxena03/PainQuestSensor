"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import dynamic from "next/dynamic";

const Stickman = dynamic(() => import("@/components/Stickman"), { ssr: false });

interface AccelerometerData {
  x: number | null;
  y: number | null;
  z: number | null;
}

interface GyroscopeData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

interface OrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
}

interface SensorData {
  accelerometer: AccelerometerData;
  gyroscope: GyroscopeData;
  orientation: OrientationData;
}

interface DetectedActivity {
  activity: string;
  confidence: number;
}

interface PoseData {
  headRotation: number;
  bodyTilt: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

interface DeviceInfo {
  id: string;
  connected: boolean;
  connectedAt: string;
  lastUpdate: string | null;
  sensorData: SensorData | null;
  detectedActivity: DetectedActivity | null;
  pose: PoseData | null;
}

export default function DeviceViewer() {
  const params = useParams();
  const id = params.id as string;

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [fps, setFps] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);

  const socketRef = useRef<Socket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!id) return;

    // Connect to standard Socket.IO server
    const socket = io(typeof window !== "undefined" ? window.location.origin : "", {
      path: "/socket.io",
      transports: ["websocket"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      // Register interest in watching this device
      socket.emit("watch_device", id);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("disconnected");
    });

    // Handle latency check
    socket.on("pong_latency", (clientTime: number) => {
      setLatency(Date.now() - clientTime);
    });

    // Receive real-time updates from server
    socket.on("device_update", (updatedDevice: DeviceInfo) => {
      if (updatedDevice && updatedDevice.id === id) {
        setDeviceInfo(updatedDevice);
        frameCountRef.current += 1;
      }
    });

    // Latency checker loop
    const latencyInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("ping_latency", Date.now());
      }
    }, 2000);

    // Frame rate checker loop
    lastFpsUpdateRef.current = performance.now();
    const fpsInterval = setInterval(() => {
      const now = performance.now();
      const delta = now - lastFpsUpdateRef.current;
      if (delta >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / delta));
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }, 1000);

    return () => {
      clearInterval(latencyInterval);
      clearInterval(fpsInterval);
      socket.disconnect();
    };
  }, [id]);

  // Fallback defaults if no data has been received yet
  const sensorData = deviceInfo?.sensorData;
  const accelerometer = sensorData?.accelerometer || { x: 0, y: 0, z: 0 };
  const gyroscope = sensorData?.gyroscope || { alpha: 0, beta: 0, gamma: 0 };
  const orientation = sensorData?.orientation || { alpha: 0, beta: 0, gamma: 0, absolute: false };

  const accMag = Math.sqrt(
    (accelerometer.x || 0) ** 2 +
    (accelerometer.y || 0) ** 2 +
    (accelerometer.z || 0) ** 2
  );

  const detectedActivity = deviceInfo?.detectedActivity || { activity: "unknown", confidence: 0 };
  const pose = deviceInfo?.pose || {
    headRotation: 0,
    bodyTilt: 0,
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0,
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/40 backdrop-blur-md sticky top-0 z-50 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-black font-black text-sm">V</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Motion Pro Viewer</h1>
              <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Remote Monitoring Console</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionStatus === "connected" ? "bg-cyan-400" : "bg-rose-400"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                connectionStatus === "connected" ? "bg-cyan-500" : "bg-rose-500"
              }`}></span>
            </span>
            <span className="text-xs font-mono font-medium capitalize text-slate-300">
              {connectionStatus === "connected" ? (deviceInfo?.connected ? "Syncing" : "Device Idle") : "Connecting"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-grow p-4 md:p-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Metrics & Sensors */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* Active Device Info */}
          <section className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl -z-10"></div>
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Target Device</label>
              <h2 className="text-xl font-bold font-mono tracking-tight text-white mt-1 break-all select-all">
                {id}
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-white/5 pt-4">
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Device Status</span>
                <p className={`font-mono text-xs font-bold mt-0.5 ${deviceInfo?.connected ? "text-cyan-400" : "text-slate-400"}`}>
                  {deviceInfo?.connected ? "ONLINE" : "OFFLINE"}
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Sensor Rate</span>
                <p className="font-mono text-xs font-semibold text-white mt-0.5">
                  {fps} FPS
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Web Latency</span>
                <p className="font-mono text-xs font-semibold text-white mt-0.5">
                  {latency}ms
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Last Broadcast</span>
                <p className="font-mono text-xs font-semibold text-white mt-0.5">
                  {deviceInfo?.lastUpdate ? new Date(deviceInfo.lastUpdate).toLocaleTimeString() : "Never"}
                </p>
              </div>
            </div>
          </section>

          {/* Activity State Card */}
          <section className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 flex flex-col space-y-4">
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Recognized Activity</label>
              <div className="flex items-baseline space-x-2 mt-1">
                <h3 className="text-3xl font-black text-white capitalize">
                  {detectedActivity.activity}
                </h3>
                <span className="text-sm font-mono text-cyan-400 font-bold">
                  {detectedActivity.confidence}% Confidence
                </span>
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                style={{ width: `${detectedActivity.confidence}%` }}
              ></div>
            </div>
          </section>

          {/* Real-time Charts / Gauges */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Accelerometer */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs text-slate-200">Accelerometer</h4>
                <span className="text-[9px] font-mono text-slate-400">m/s²</span>
              </div>
              
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">X:</span>
                  <span className="text-white font-semibold">{accelerometer.x !== null ? accelerometer.x.toFixed(3) : "0.000"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Y:</span>
                  <span className="text-white font-semibold">{accelerometer.y !== null ? accelerometer.y.toFixed(3) : "0.000"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Z:</span>
                  <span className="text-white font-semibold">{accelerometer.z !== null ? accelerometer.z.toFixed(3) : "0.000"}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/5 font-bold">
                  <span className="text-slate-300">Magnitude:</span>
                  <span className="text-cyan-400">{accMag.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Gyroscope */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs text-slate-200">Gyroscope</h4>
                <span className="text-[9px] font-mono text-slate-400">rad/s</span>
              </div>
              
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Alpha:</span>
                  <span className="text-white font-semibold">{gyroscope.alpha !== null ? gyroscope.alpha.toFixed(3) : "0.000"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Beta:</span>
                  <span className="text-white font-semibold">{gyroscope.beta !== null ? gyroscope.beta.toFixed(3) : "0.000"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gamma:</span>
                  <span className="text-white font-semibold">{gyroscope.gamma !== null ? gyroscope.gamma.toFixed(3) : "0.000"}</span>
                </div>
              </div>
            </div>

            {/* Orientation */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs text-slate-200">Orientation</h4>
                <span className="text-[9px] font-mono text-slate-400">degrees</span>
              </div>
              
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Yaw:</span>
                  <span className="text-white font-semibold">{orientation.alpha !== null ? `${orientation.alpha.toFixed(1)}°` : "0.0°"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pitch:</span>
                  <span className="text-white font-semibold">{orientation.beta !== null ? `${orientation.beta.toFixed(1)}°` : "0.0°"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Roll:</span>
                  <span className="text-white font-semibold">{orientation.gamma !== null ? `${orientation.gamma.toFixed(1)}°` : "0.0°"}</span>
                </div>
              </div>
            </div>

          </section>

        </div>

        {/* Right Column: 3D Visualizer */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <section className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col space-y-4 shadow-2xl">
            <div>
              <h3 className="font-bold text-sm text-white">3D Motion Capture</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Visualizing phone orientation and pose state received via WebSocket.
              </p>
            </div>

            <Stickman pose={pose} />

            <div className="p-4 bg-slate-950/60 border border-white/5 rounded-xl space-y-2 font-mono text-[10px] text-slate-400">
              <span className="font-bold text-slate-200">Joint Configuration:</span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>Head Rot: <span className="text-cyan-400">{pose.headRotation}°</span></div>
                <div>Body Tilt: <span className="text-cyan-400">{pose.bodyTilt}°</span></div>
                <div>L-Arm Angle: <span className="text-cyan-400">{pose.leftArm}°</span></div>
                <div>R-Arm Angle: <span className="text-cyan-400">{pose.rightArm}°</span></div>
                <div>L-Leg Angle: <span className="text-cyan-400">{pose.leftLeg}°</span></div>
                <div>R-Leg Angle: <span className="text-cyan-400">{pose.rightLeg}°</span></div>
              </div>
            </div>
          </section>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-white/5 bg-slate-950/20 text-center">
        <p className="text-xs text-slate-500 font-mono">
          Motion Sensor Pro PWA • Remote Viewer Mode
        </p>
      </footer>
    </div>
  );
}
