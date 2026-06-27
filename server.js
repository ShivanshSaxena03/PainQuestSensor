const { createServer } = require("node:http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0"; // Allow external connections for testing on physical phone
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize the global device data store
global.deviceDataStore = new Map();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    let currentDeviceId = null;

    // A phone registers to stream data
    socket.on("register_device", (deviceId) => {
      if (!deviceId) return;
      currentDeviceId = deviceId;
      socket.join(deviceId);
      
      const existingDevice = global.deviceDataStore.get(deviceId);
      global.deviceDataStore.set(deviceId, {
        id: deviceId,
        connected: true,
        connectedAt: existingDevice ? existingDevice.connectedAt : new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        sensorData: existingDevice ? existingDevice.sensorData : null,
        detectedActivity: existingDevice ? existingDevice.detectedActivity : null,
        pose: existingDevice ? existingDevice.pose : null
      });
      
      console.log(`Device registered for streaming: ${deviceId}`);
      // Notify any viewers that device is connected
      io.to(deviceId).emit("device_update", global.deviceDataStore.get(deviceId));
    });

    // A remote viewer registers to watch a device
    socket.on("watch_device", (deviceId) => {
      if (!deviceId) return;
      socket.join(deviceId);
      console.log(`Socket ${socket.id} started watching device: ${deviceId}`);
      
      // If we already have data for this device, send it immediately
      const device = global.deviceDataStore.get(deviceId);
      if (device) {
        socket.emit("device_update", device);
      }
    });

    // Receive sensor data + activity + pose from phone
    socket.on("sensor_data", (payload) => {
      if (!currentDeviceId) return;
      
      const existingDevice = global.deviceDataStore.get(currentDeviceId);
      const updatedDevice = {
        id: currentDeviceId,
        connected: true,
        connectedAt: existingDevice ? existingDevice.connectedAt : new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        sensorData: payload.sensorData || null,
        detectedActivity: payload.detectedActivity || null,
        pose: payload.pose || null,
      };

      global.deviceDataStore.set(currentDeviceId, updatedDevice);

      // Broadcast update to all sockets watching this device ID
      io.to(currentDeviceId).emit("device_update", updatedDevice);
    });

    socket.on("disconnect", () => {
      if (currentDeviceId) {
        const existingDevice = global.deviceDataStore.get(currentDeviceId);
        if (existingDevice) {
          const updatedDevice = {
            ...existingDevice,
            connected: false,
            lastUpdate: new Date().toISOString()
          };
          global.deviceDataStore.set(currentDeviceId, updatedDevice);
          io.to(currentDeviceId).emit("device_update", updatedDevice);
        }
        console.log(`Device disconnected: ${currentDeviceId}`);
      }
    });
  });

  server.listen(port, (err) => {
    if (err) {
      console.error("Failed to start custom server:", err);
      process.exit(1);
    }
    console.log(`> Ready on http://localhost:${port}`);
  });
});
