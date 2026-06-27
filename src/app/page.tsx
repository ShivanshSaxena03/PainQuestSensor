"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";

// Dynamically import the Stickman component to avoid SSR issues
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

interface StrictSensorValue {
  x: number;
  y: number;
  z: number;
}

interface StrictGyroValue {
  alpha: number;
  beta: number;
  gamma: number;
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

interface MotionFeatures {
  meanAcc: number;
  varAcc: number;
  maxAcc: number;
  meanRot: number;
  varRot: number;
  freq: number;
}

interface BenchmarkProfile {
  name: string;
  features: MotionFeatures;
  isSystem?: boolean;
}

// Default baseline profiles
const DEFAULT_BENCHMARKS: BenchmarkProfile[] = [
  {
    name: "walking",
    isSystem: true,
    features: {
      meanAcc: 10.8,
      varAcc: 3.5,
      maxAcc: 14.5,
      meanRot: 1.8,
      varRot: 0.9,
      freq: 2.2,
    },
  },
  {
    name: "hand_raise",
    isSystem: true,
    features: {
      meanAcc: 9.8,
      varAcc: 0.8,
      maxAcc: 11.8,
      meanRot: 3.2,
      varRot: 2.4,
      freq: 0.4,
    },
  },
  {
    name: "sitting",
    isSystem: true,
    features: {
      meanAcc: 9.8,
      varAcc: 0.05,
      maxAcc: 9.9,
      meanRot: 0.05,
      varRot: 0.01,
      freq: 0.0,
    },
  },
];

export default function Home() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Telemetry state for UI
  const [accelerometer, setAccelerometer] = useState<StrictSensorValue>({ x: 0, y: 0, z: 0 });
  const [gyroscope, setGyroscope] = useState<StrictGyroValue>({ alpha: 0, beta: 0, gamma: 0 });
  const [orientation, setOrientation] = useState<OrientationData>({ alpha: 0, beta: 0, gamma: 0, absolute: false });
  const [motionMagnitude, setMotionMagnitude] = useState<number>(0);

  // Classification & Benchmark state
  const [benchmarks, setBenchmarks] = useState<BenchmarkProfile[]>(DEFAULT_BENCHMARKS);
  const [detectedActivity, setDetectedActivity] = useState<DetectedActivity>({ activity: "unknown", confidence: 100 });
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [newActivityName, setNewActivityName] = useState<string>("");

  // Pose data driven by sensors
  const [pose, setPose] = useState<PoseData>({
    headRotation: 0,
    bodyTilt: 0,
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0,
  });

  const socketRef = useRef<Socket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);

  // Sliding window parameters (~2 seconds of data at 30-40 Hz = ~60 samples)
  const windowSize = 60;
  const historyRef = useRef<{ accMag: number; rotMag: number; time: number }[]>([]);
  
  // Recording buffer for training custom profiles
  const recordBufferRef = useRef<{ accMag: number; rotMag: number }[]>([]);
  const isRecordingRef = useRef<boolean>(false);

  // Load custom benchmarks from localStorage
  useEffect(() => {
    let id = localStorage.getItem("motion_sensor_device_id");
    if (!id) {
      id = uuidv4();
      localStorage.setItem("motion_sensor_device_id", id);
    }
    setDeviceId(id);

    const saved = localStorage.getItem("custom_motion_benchmarks");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BenchmarkProfile[];
        setBenchmarks([...DEFAULT_BENCHMARKS, ...parsed]);
      } catch (e) {
        console.error("Error reading saved benchmarks", e);
      }
    }
  }, []);

  // Socket connection and streaming loop
  useEffect(() => {
    if (!deviceId) return;

    const socket = io({
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("register_device", deviceId);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("disconnected");
    });

    // Handle latency pong from server
    socket.on("pong_latency", (clientTime: number) => {
      setLatency(Date.now() - clientTime);
    });

    // Latency check interval
    const latencyInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("ping_latency", Date.now());
      }
    }, 2000);

    lastFpsUpdateRef.current = performance.now();

    // Stream sensor, activity and pose state at 40 FPS (25ms)
    const streamInterval = setInterval(() => {
      if (socket.connected && isStreaming) {
        const payload = {
          sensorData: {
            accelerometer: {
              x: historyRef.current.length > 0 ? accelerometer.x : null,
              y: historyRef.current.length > 0 ? accelerometer.y : null,
              z: historyRef.current.length > 0 ? accelerometer.z : null,
            },
            gyroscope: {
              alpha: historyRef.current.length > 0 ? gyroscope.alpha : null,
              beta: historyRef.current.length > 0 ? gyroscope.beta : null,
              gamma: historyRef.current.length > 0 ? gyroscope.gamma : null,
            },
            orientation: orientation,
          },
          detectedActivity: {
            activity: detectedActivity.activity,
            confidence: detectedActivity.confidence,
          },
          pose: pose,
        };

        socket.emit("sensor_data", payload);
        frameCountRef.current += 1;

        const now = performance.now();
        const delta = now - lastFpsUpdateRef.current;
        if (delta >= 1000) {
          setFps(Math.round((frameCountRef.current * 1000) / delta));
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = now;
        }
      }
    }, 25);

    return () => {
      clearInterval(latencyInterval);
      clearInterval(streamInterval);
      socket.disconnect();
    };
  }, [deviceId, isStreaming, accelerometer, gyroscope, orientation, detectedActivity, pose]);

  // Request browser sensors permission
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSensorSupport = "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window;
      if (!hasSensorSupport) {
        setErrorMsg("Device sensors are not supported by this browser.");
        setPermissionGranted(false);
        return;
      }

      const requiresPermissionRequest =
        typeof DeviceOrientationEvent !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (DeviceOrientationEvent as any).requestPermission === "function";

      if (!requiresPermissionRequest) {
        setPermissionGranted(true);
        registerListeners();
      } else {
        setPermissionGranted(false);
      }
    }

    let frameId: number;

    // Run classification and pose calculations in standard RAF loop for maximum performance
    function tick() {
      processSensorWindow();
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("devicemotion", handleMotion);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [benchmarks, detectedActivity.activity]);

  // Global variables to capture high-rate sensor readings
  const rawAcc = useRef<StrictSensorValue>({ x: 0, y: 0, z: 0 });
  const rawGyro = useRef<StrictGyroValue>({ alpha: 0, beta: 0, gamma: 0 });
  const rawOrient = useRef<OrientationData>({ alpha: 0, beta: 0, gamma: 0, absolute: false });

  function registerListeners() {
    window.addEventListener("devicemotion", handleMotion);
    window.addEventListener("deviceorientation", handleOrientation);
  }

  function handleMotion(event: DeviceMotionEvent) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    const rot = event.rotationRate;

    if (acc) {
      rawAcc.current = {
        x: acc.x !== null ? acc.x : 0,
        y: acc.y !== null ? acc.y : 0,
        z: acc.z !== null ? acc.z : 0,
      };
    }

    if (rot) {
      rawGyro.current = {
        alpha: rot.alpha !== null ? rot.alpha : 0,
        beta: rot.beta !== null ? rot.beta : 0,
        gamma: rot.gamma !== null ? rot.gamma : 0,
      };
    }
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    rawOrient.current = {
      alpha: event.alpha !== null ? event.alpha : 0,
      beta: event.beta !== null ? event.beta : 0,
      gamma: event.gamma !== null ? event.gamma : 0,
      absolute: event.absolute ?? false,
    };
  }

  // Feature extraction and classification engine
  function processSensorWindow() {
    const acc = rawAcc.current;
    const gyro = rawGyro.current;
    const orient = rawOrient.current;

    setAccelerometer(acc);
    setGyroscope(gyro);
    setOrientation(orient);

    const accMag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    const gyroMag = Math.sqrt(gyro.alpha * gyro.alpha + gyro.beta * gyro.beta + gyro.gamma * gyro.gamma);
    
    setMotionMagnitude(Number(accMag.toFixed(2)));

    // Push to sliding window
    historyRef.current.push({ accMag, rotMag: gyroMag, time: Date.now() });
    if (historyRef.current.length > windowSize) {
      historyRef.current.shift();
    }

    // Push to recording buffer if active
    if (isRecordingRef.current) {
      recordBufferRef.current.push({ accMag, rotMag: gyroMag });
    }

    // If window is not full, skip classification
    if (historyRef.current.length < 15) return;

    // Feature calculation
    const features = calculateFeatures(historyRef.current);
    
    // Classify against benchmarks
    classifyActivity(features);

    // Compute Stickman joint rotations based on orientation & current activity
    computePose(orient, detectedActivity.activity);
  }

  function calculateFeatures(windowData: { accMag: number; rotMag: number }[]): MotionFeatures {
    const n = windowData.length;
    let sumAcc = 0;
    let sumRot = 0;
    let maxAcc = 0;

    for (const d of windowData) {
      sumAcc += d.accMag;
      sumRot += d.rotMag;
      if (d.accMag > maxAcc) maxAcc = d.accMag;
    }

    const meanAcc = sumAcc / n;
    const meanRot = sumRot / n;

    let varAccSum = 0;
    let varRotSum = 0;
    for (const d of windowData) {
      varAccSum += Math.pow(d.accMag - meanAcc, 2);
      varRotSum += Math.pow(d.rotMag - meanRot, 2);
    }

    // Frequency of peaks (above simple threshold)
    let peakCount = 0;
    for (let i = 1; i < n - 1; i++) {
      if (
        windowData[i].accMag > windowData[i - 1].accMag &&
        windowData[i].accMag > windowData[i + 1].accMag &&
        windowData[i].accMag > 11.2 // slightly above gravity threshold
      ) {
        peakCount++;
      }
    }
    const freq = (peakCount / (n * 0.025)) * 1.5; // normalized

    return {
      meanAcc: Number(meanAcc.toFixed(3)),
      varAcc: Number((varAccSum / n).toFixed(3)),
      maxAcc: Number(maxAcc.toFixed(3)),
      meanRot: Number(meanRot.toFixed(3)),
      varRot: Number((varRotSum / n).toFixed(3)),
      freq: Number(freq.toFixed(3)),
    };
  }

  function classifyActivity(features: MotionFeatures) {
    let bestMatchName = "unknown";
    let maxSimilarity = 0;

    for (const b of benchmarks) {
      // Calculate weighted similarity score
      const dMeanAcc = Math.abs(features.meanAcc - b.features.meanAcc) / (b.features.meanAcc || 1);
      const dVarAcc = Math.abs(features.varAcc - b.features.varAcc) / (b.features.varAcc + 0.1);
      const dMeanRot = Math.abs(features.meanRot - b.features.meanRot) / (b.features.meanRot + 0.1);
      const dFreq = Math.abs(features.freq - b.features.freq) / (b.features.freq + 0.1);

      // Distance score (smaller is closer)
      const distance = dMeanAcc * 0.3 + dVarAcc * 0.3 + dMeanRot * 0.2 + dFreq * 0.2;
      const similarity = Math.max(0, 100 - distance * 100);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatchName = b.name;
      }
    }

    // Apply lower boundary confidence threshold
    const confidence = Math.round(maxSimilarity);
    if (confidence > 55) {
      setDetectedActivity({ activity: bestMatchName, confidence });
    } else {
      setDetectedActivity({ activity: "unknown", confidence });
    }
  }

  function computePose(orient: OrientationData, activity: string) {
    // Basic joints
    let head = 0;
    let tilt = 0;
    let lArm = 0;
    let rArm = 0;
    let lLeg = 0;
    let rLeg = 0;

    // Use device orientation gamma (roll) and beta (pitch) to drive basic body tilt and head look angle
    if (orient.gamma !== null) {
      tilt = -orient.gamma; // tilt left/right
    }
    if (orient.beta !== null) {
      // Limit pitch to natural head tilt range
      head = Math.max(-45, Math.min(45, orient.beta - 60));
    }

    if (activity === "walking") {
      // Leg swing cycles
      const cycle = Date.now() / 120;
      lLeg = Math.sin(cycle) * 35;
      rLeg = -Math.sin(cycle) * 35;
      lArm = -Math.sin(cycle) * 20;
      rArm = Math.sin(cycle) * 20;
    } else if (activity === "hand_raise") {
      // Arms raised high
      lArm = -140;
      rArm = -140;
      lLeg = 0;
      rLeg = 0;
    } else if (activity === "sitting") {
      // Hip/knee bend
      lLeg = 45;
      rLeg = 45;
      lArm = 10;
      rArm = 10;
    } else {
      // Unknown or standing state
      lArm = 5;
      rArm = -5;
    }

    setPose({
      headRotation: head,
      bodyTilt: tilt,
      leftArm: lArm,
      rightArm: rArm,
      leftLeg: lLeg,
      rightLeg: rLeg,
    });
  }

  // Trigger permission request explicitly (important for iOS)
  const requestSensorsPermission = async () => {
    try {
      const reqOrientation =
        typeof DeviceOrientationEvent !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (DeviceOrientationEvent as any).requestPermission === "function";

      const reqMotion =
        typeof DeviceMotionEvent !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (DeviceMotionEvent as any).requestPermission === "function";

      let orientationPermission = "granted";
      let motionPermission = "granted";

      if (reqOrientation) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orientationPermission = await (DeviceOrientationEvent as any).requestPermission();
      }
      if (reqMotion) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        motionPermission = await (DeviceMotionEvent as any).requestPermission();
      }

      if (orientationPermission === "granted" && motionPermission === "granted") {
        setPermissionGranted(true);
        setErrorMsg("");
        registerListeners();
      } else {
        setPermissionGranted(false);
        setErrorMsg("Permission to access motion sensors was denied.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to request permission. Make sure to use HTTPS.");
    }
  };

  // Record custom benchmark profile
  const startRecordingBenchmark = () => {
    if (!newActivityName.trim()) {
      alert("Please enter a name for the new activity.");
      return;
    }

    setRecordingStatus("Hold your phone and perform the motion for 3 seconds...");
    recordBufferRef.current = [];
    isRecordingRef.current = true;

    setTimeout(() => {
      isRecordingRef.current = false;
      saveRecordedBenchmark();
    }, 3000);
  };

  const saveRecordedBenchmark = () => {
    const buffer = recordBufferRef.current;
    if (buffer.length < 10) {
      setRecordingStatus("Recording failed: Not enough sensor samples.");
      return;
    }

    // Compute average features over the recorded buffer
    const features = calculateFeatures(buffer);
    const newProfile: BenchmarkProfile = {
      name: newActivityName.trim().toLowerCase(),
      features,
    };

    const saved = localStorage.getItem("custom_motion_benchmarks");
    let currentCustom: BenchmarkProfile[] = [];
    if (saved) {
      try {
        currentCustom = JSON.parse(saved);
      } catch (e) {}
    }

    // Remove existing custom profile with same name
    currentCustom = currentCustom.filter((b) => b.name !== newProfile.name);
    currentCustom.push(newProfile);

    localStorage.setItem("custom_motion_benchmarks", JSON.stringify(currentCustom));
    setBenchmarks([...DEFAULT_BENCHMARKS, ...currentCustom]);
    setRecordingStatus(`Success! Trained motion profile: "${newProfile.name}"`);
    setNewActivityName("");
  };

  const clearCustomBenchmarks = () => {
    localStorage.removeItem("custom_motion_benchmarks");
    setBenchmarks(DEFAULT_BENCHMARKS);
    setRecordingStatus("Custom benchmarks cleared.");
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/40 backdrop-blur-md sticky top-0 z-50 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-black font-black text-sm">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Motion Pro</h1>
              <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Recognition & Stickman Sync</p>
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
              {connectionStatus}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-grow p-4 md:p-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: controls and visualization (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* Main Activity Monitor (Glass Card) */}
          <section className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl -z-10"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Current Detected Activity</label>
                <div className="flex items-baseline space-x-2 mt-1">
                  <h2 className="text-3xl font-black tracking-tight text-white capitalize">
                    {detectedActivity.activity}
                  </h2>
                  <span className="text-sm font-mono text-cyan-400 font-bold">
                    {detectedActivity.confidence}% Match
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">Rate:</span>
                <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono font-bold text-cyan-400">
                  {fps} FPS
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">Latency:</span>
                <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono font-bold text-violet-400">
                  {latency}ms
                </span>
              </div>
            </div>

            {/* Confidence Gauge */}
            <div className="mt-4">
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${detectedActivity.confidence}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-white/5 pt-4">
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Device ID</span>
                <p className="font-mono text-xs font-semibold text-white truncate mt-0.5" title={deviceId}>
                  {deviceId || "Loading..."}
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Magnitude</span>
                <p className="font-mono text-xs font-semibold text-cyan-400 mt-0.5">
                  {motionMagnitude} m/s²
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Streaming</span>
                <p className="font-mono text-xs font-semibold text-white mt-0.5">
                  {isStreaming ? "Active" : "Paused"}
                </p>
              </div>
              <div>
                <span className="text-[9px] uppercase font-mono text-slate-400">Active Profiles</span>
                <p className="font-mono text-xs font-semibold text-white mt-0.5">
                  {benchmarks.length} Trained
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
                {errorMsg}
              </div>
            )}
          </section>

          {/* Core Settings / Perms */}
          <section className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 flex flex-wrap items-center gap-3">
            {permissionGranted === false && (
              <button
                onClick={requestSensorsPermission}
                className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-black font-semibold rounded-xl text-xs shadow-lg active:scale-95 transition"
              >
                Allow Motion Permission
              </button>
            )}

            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                isStreaming 
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20" 
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
              }`}
            >
              {isStreaming ? "Stop Live Sync" : "Resume Live Sync"}
            </button>

            <a
              href={`/device/${deviceId}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs font-semibold transition active:scale-95 flex items-center space-x-1"
            >
              <span>Open Remote Viewer ↗</span>
            </a>
          </section>

          {/* Benchmark Recorder (Future-ready engine training) */}
          <section className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 flex flex-col space-y-4">
            <div>
              <h3 className="font-bold text-sm text-white">Motion Benchmark Trainer</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Train the recognition engine with a new motion profile dynamically. Type a name and hold the motion.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                placeholder="e.g. jumping, waving, running"
                className="flex-grow px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={startRecordingBenchmark}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl text-xs active:scale-95 transition"
              >
                Record (3s)
              </button>
            </div>

            {recordingStatus && (
              <p className="text-xs font-mono text-cyan-400 bg-slate-950/50 p-2.5 border border-white/5 rounded-lg">
                {recordingStatus}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {benchmarks.map((b) => (
                <span 
                  key={b.name}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                    b.isSystem 
                      ? "bg-slate-950/80 border-white/5 text-slate-400" 
                      : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                  }`}
                >
                  {b.name} {b.isSystem ? "(System)" : "(Custom)"}
                </span>
              ))}
            </div>

            {benchmarks.some((b) => !b.isSystem) && (
              <button
                onClick={clearCustomBenchmarks}
                className="text-[10px] font-mono text-rose-400 hover:text-rose-300 self-start"
              >
                Clear Custom Saved Benchmarks
              </button>
            )}
          </section>

          {/* Raw Telemetry Panels */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Acc */}
            <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 font-mono text-[11px] space-y-2">
              <span className="text-slate-400 font-bold">Accelerometer</span>
              <div className="flex justify-between"><span>X:</span><span className="text-white">{accelerometer.x.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Y:</span><span className="text-white">{accelerometer.y.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Z:</span><span className="text-white">{accelerometer.z.toFixed(2)}</span></div>
            </div>

            {/* Gyro */}
            <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 font-mono text-[11px] space-y-2">
              <span className="text-slate-400 font-bold">Gyroscope</span>
              <div className="flex justify-between"><span>α (Z):</span><span className="text-white">{gyroscope.alpha.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>β (X):</span><span className="text-white">{gyroscope.beta.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>γ (Y):</span><span className="text-white">{gyroscope.gamma.toFixed(2)}</span></div>
            </div>

            {/* Orient */}
            <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 font-mono text-[11px] space-y-2">
              <span className="text-slate-400 font-bold">Orientation</span>
              <div className="flex justify-between"><span>Yaw:</span><span className="text-white">{orientation.alpha !== null ? `${orientation.alpha.toFixed(1)}°` : "0.0°"}</span></div>
              <div className="flex justify-between"><span>Pitch:</span><span className="text-white">{orientation.beta !== null ? `${orientation.beta.toFixed(1)}°` : "0.0°"}</span></div>
              <div className="flex justify-between"><span>Roll:</span><span className="text-white">{orientation.gamma !== null ? `${orientation.gamma.toFixed(1)}°` : "0.0°"}</span></div>
            </div>
          </section>

        </div>

        {/* Right Column: 3D Stickman Animation Visualizer (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <section className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col space-y-4 shadow-2xl">
            <div>
              <h3 className="font-bold text-sm text-white">3D Motion Capture</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Visualizing phone orientation and classified movement patterns.
              </p>
            </div>

            {/* Render 3D model */}
            <Stickman pose={pose} />

            <div className="p-4 bg-slate-950/60 border border-white/5 rounded-xl space-y-2 font-mono text-[10px] text-slate-400">
              <span className="font-bold text-slate-200">Real-time Pose Joint Angles:</span>
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
          Motion Sensor Pro PWA • Multi-Device Socket Sync
        </p>
      </footer>
    </div>
  );
}
