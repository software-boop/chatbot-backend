require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Routes
const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const uploadRoutes = require("./routes/upload");

// Models
const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

// ================= ENV =================
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in environment variables");
  process.exit(1);
}

// ================= SOCKET =================
const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT"],
    credentials: true,
  },
});

// ================= FILE STORAGE =================
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ================= MIDDLEWARE =================
app.use(
  cors({
    origin: [CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// ================= ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// ================= HEALTH CHECK =================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ================= SERVE FRONTEND =================
const clientBuildPath = path.join(__dirname, "..", "client", "dist");

if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// ================= SOCKET EVENTS =================
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // User joins
  socket.on("user:join", async ({ userId, username }) => {
    try {
      onlineUsers.set(socket.id, { userId, username });

      await User.findByIdAndUpdate(userId, { online: true });

      io.emit("user:online", {
        userId,
        username,
        online: true,
      });

      console.log(`✅ ${username} is online`);
    } catch (err) {
      console.error("Join error:", err);
    }
  });

  // Send message
  socket.on("message:send", async (data) => {
    try {
      const message = new Message({
        sender: data.senderId,
        text: data.text || "",
        image: data.image || "",
      });

      await message.save();
      await message.populate("sender", "username avatar");

      io.emit("message:receive", message);
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  // Typing indicator
  socket.on("typing:start", ({ username }) => {
    socket.broadcast.emit("typing:start", { username });
  });

  socket.on("typing:stop", ({ username }) => {
    socket.broadcast.emit("typing:stop", { username });
  });

  // Message reaction
  socket.on("message:react", async ({ messageId, emoji, userId }) => {
    try {
      const message = await Message.findById(messageId);

      if (!message) return;

      message.reactions = message.reactions.filter(
        (r) => r.userId.toString() !== userId
      );

      message.reactions.push({ emoji, userId });

      await message.save();

      await message.populate("sender", "username avatar");
      await message.populate("reactions.userId", "username");

      io.emit("message:reacted", message);
    } catch (err) {
      console.error("Reaction error:", err);
    }
  });

  // Messages seen
  socket.on("messages:seen", async ({ userId }) => {
    try {
      await Message.updateMany(
        { sender: { $ne: userId }, seen: false },
        { seen: true }
      );

      socket.broadcast.emit("messages:seen", { userId });
    } catch (err) {
      console.error("Seen error:", err);
    }
  });

  // Disconnect
  socket.on("disconnect", async () => {
    try {
      const user = onlineUsers.get(socket.id);

      if (user) {
        await User.findByIdAndUpdate(user.userId, {
          online: false,
          lastSeen: new Date(),
        });

        io.emit("user:online", {
          userId: user.userId,
          username: user.username,
          online: false,
        });

        onlineUsers.delete(socket.id);

        console.log(`❌ ${user.username} went offline`);
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
});

// ================= DATABASE + SERVER START =================
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });