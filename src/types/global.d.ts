export interface AccelerometerData {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface GyroscopeData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export interface OrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
}

export interface SensorData {
  accelerometer: AccelerometerData;
  gyroscope: GyroscopeData;
  orientation: OrientationData;
}

export interface DetectedActivity {
  activity: string;
  confidence: number;
}

export interface PoseData {
  headRotation: number;
  bodyTilt: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

export interface DeviceInfo {
  id: string;
  connected: boolean;
  connectedAt: string;
  lastUpdate: string | null;
  sensorData: SensorData | null;
  detectedActivity: DetectedActivity | null;
  pose: PoseData | null;
}

declare global {
  // eslint-disable-next-line no-var
  var deviceDataStore: Map<string, DeviceInfo> | undefined;
}
