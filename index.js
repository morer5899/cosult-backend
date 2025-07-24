import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import connectDB from "./database/connectDB.js"
import passport from "passport"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import path from "path"
import fs from "fs"
import { createServer } from "http"
import { Server } from "socket.io"

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Define the path for the uploads directory
const uploadsDir = path.join(__dirname, "uploads")

// Import route handlers
import authRoutes from "./routes/auth.js"
import userRoutes from "./routes/users.js"
import appointmentRoutes from "./routes/appointments.js"
import availabilityRoutes from "./routes/availability.js"
import paymentRoutes from "./routes/payments.js"

// Load environment variables
dotenv.config({ path: resolve(__dirname, "./.env") })

// --- DIAGNOSTIC LOGS ---
console.log("--- Environment Variables Loaded (backend/server.js) ---")
console.log("Current directory (__dirname):", __dirname)
console.log("PORT:", process.env.PORT)
console.log("FRONTEND_URL:", process.env.FRONTEND_URL)
console.log("BACKEND_URL:", process.env.BACKEND_URL)
console.log("----------------------------------------------------")

const app = express()
const httpServer = createServer(app)

// Enhanced Socket.IO server configuration
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173"  ,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
  allowEIO3: true,
  // Enhanced connection handling
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
})

// Enhanced room and user management
const rooms = new Map() // roomId -> { participants: Map(sessionId -> socketId), connections: Map(socketId -> sessionId) }
const userSockets = new Map() // sessionId -> socketId
const socketUsers = new Map() // socketId -> sessionId

// Helper functions with improved logic
function addUserToRoom(roomId, sessionId, socketId) {
  console.log(`🏠 Adding user ${sessionId} to room ${roomId} with socket ${socketId}`)

  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      participants: new Map(),
      connections: new Map(),
    })
  }

  const room = rooms.get(roomId)

  // Remove user from previous socket if exists
  if (room.participants.has(sessionId)) {
    const oldSocketId = room.participants.get(sessionId)
    room.connections.delete(oldSocketId)
    console.log(`🔄 Replaced old socket ${oldSocketId} for session ${sessionId}`)
  }

  // Add user with new socket
  room.participants.set(sessionId, socketId)
  room.connections.set(socketId, sessionId)
  userSockets.set(sessionId, socketId)
  socketUsers.set(socketId, sessionId)

  console.log(`✅ Session ${sessionId} added to room ${roomId} with socket ${socketId}`)
  console.log(`📊 Room ${roomId} now has ${room.participants.size} unique participants`)

  return room.participants.size
}

function removeUserFromRoom(socketId) {
  const sessionId = socketUsers.get(socketId)
  if (!sessionId) {
    console.log(`⚠️ No session found for socket ${socketId}`)
    return
  }

  console.log(`🚪 Removing session ${sessionId} (socket ${socketId}) from rooms`)

  // Find and clean up from all rooms
  for (const [roomId, room] of rooms.entries()) {
    if (room.connections.has(socketId)) {
      room.participants.delete(sessionId)
      room.connections.delete(socketId)

      console.log(`✅ Session ${sessionId} removed from room ${roomId}`)

      // Notify others in room about user leaving
      const remainingParticipants = Array.from(room.participants.values())
      remainingParticipants.forEach((remainingSocketId) => {
        if (remainingSocketId !== socketId) {
          io.to(remainingSocketId).emit("user-left", sessionId, socketId)
        }
      })

      console.log(`📊 Room ${roomId} now has ${room.participants.size} participants`)

      // Clean up empty rooms
      if (room.participants.size === 0) {
        rooms.delete(roomId)
        console.log(`🗑️ Room ${roomId} deleted (empty)`)
      }
    }
  }

  // Clean up global maps
  userSockets.delete(sessionId)
  socketUsers.delete(socketId)
}

function getRoomParticipants(roomId) {
  const room = rooms.get(roomId)
  if (!room) return []

  return Array.from(room.participants.entries()).map(([sessionId, socketId]) => ({
    sessionId,
    socketId,
  }))
}

// Enhanced Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`)

  socket.on("join-room", (roomId, sessionId) => {
    try {
      console.log(`👤 Session ${sessionId} attempting to join room ${roomId}`)

      // Leave any existing rooms first
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room)
          console.log(`🚪 Left previous room: ${room}`)
        }
      })

      // Join the new room
      socket.join(roomId)
      const participantCount = addUserToRoom(roomId, sessionId, socket.id)

      // Get other participants in the room (excluding current user)
      const allParticipants = getRoomParticipants(roomId)
      const otherParticipants = allParticipants.filter((p) => p.sessionId !== sessionId)

      console.log(`📢 Notifying ${otherParticipants.length} other participants about new user`)

      // Notify others about the new user
      otherParticipants.forEach((participant) => {
        console.log(`📢 Notifying ${participant.sessionId} (${participant.socketId}) about new user ${sessionId}`)
        io.to(participant.socketId).emit("user-joined", sessionId, socket.id)
      })

      // Send current participants to the new user
      socket.emit(
        "current-participants",
        otherParticipants.map((p) => p.sessionId),
      )

      console.log(`✅ Session ${sessionId} successfully joined room ${roomId}`)
    } catch (error) {
      console.error("❌ Error in join-room:", error)
      socket.emit("error", "Failed to join room")
    }
  })

  // Enhanced offer handling
  socket.on("offer", (roomId, offer, senderSocketId) => {
    try {
      const senderSessionId = socketUsers.get(senderSocketId)
      console.log(`📤 Offer from session ${senderSessionId} (socket ${senderSocketId}) in room ${roomId}`)
      console.log(`📤 Offer type: ${offer.type}, SDP length: ${offer.sdp?.length || 0}`)

      // Send to all other participants in the room
      const room = rooms.get(roomId)
      if (room) {
        let forwardedCount = 0
        room.connections.forEach((sessionId, socketId) => {
          if (socketId !== senderSocketId) {
            console.log(`📤 Forwarding offer to session ${sessionId} (socket ${socketId})`)
            io.to(socketId).emit("offer", offer, senderSocketId)
            forwardedCount++
          }
        })
        console.log(`📤 Offer forwarded to ${forwardedCount} participants`)
      } else {
        console.log(`⚠️ Room ${roomId} not found for offer forwarding`)
      }
    } catch (error) {
      console.error("❌ Error handling offer:", error)
    }
  })

  // Enhanced answer handling
  socket.on("answer", (roomId, answer, senderSocketId) => {
    try {
      const senderSessionId = socketUsers.get(senderSocketId)
      console.log(`📤 Answer from session ${senderSessionId} (socket ${senderSocketId}) in room ${roomId}`)
      console.log(`📤 Answer type: ${answer.type}, SDP length: ${answer.sdp?.length || 0}`)

      // Send to all other participants in the room
      const room = rooms.get(roomId)
      if (room) {
        let forwardedCount = 0
        room.connections.forEach((sessionId, socketId) => {
          if (socketId !== senderSocketId) {
            console.log(`📤 Forwarding answer to session ${sessionId} (socket ${socketId})`)
            io.to(socketId).emit("answer", answer, senderSocketId)
            forwardedCount++
          }
        })
        console.log(`📤 Answer forwarded to ${forwardedCount} participants`)
      } else {
        console.log(`⚠️ Room ${roomId} not found for answer forwarding`)
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
    }
  })

  // Enhanced candidate handling
  socket.on("candidate", (roomId, candidate, senderSocketId) => {
    try {
      // Reduce logging for candidates to avoid spam, but keep essential info
      const candidateType = candidate.candidate ? candidate.candidate.split(" ")[7] || "unknown" : "end-of-candidates"

      // Send to all other participants in the room
      const room = rooms.get(roomId)
      if (room) {
        let forwardedCount = 0
        room.connections.forEach((sessionId, socketId) => {
          if (socketId !== senderSocketId) {
            io.to(socketId).emit("candidate", candidate, senderSocketId)
            forwardedCount++
          }
        })
        // Only log every 10th candidate to reduce spam
        if (Math.random() < 0.1) {
          console.log(`🧊 ICE candidate (${candidateType}) forwarded to ${forwardedCount} participants`)
        }
      }
    } catch (error) {
      console.error("❌ Error handling candidate:", error)
    }
  })

  // Add chat message handler
  socket.on("chat-message", (roomId, message) => {
    try {
      const senderSessionId = socketUsers.get(socket.id)
      console.log(`💬 Chat message in room ${roomId} from session ${senderSessionId}`)

      // Send to all other participants in the room
      const room = rooms.get(roomId)
      if (room) {
        room.connections.forEach((sessionId, socketId) => {
          if (socketId !== socket.id) {
            io.to(socketId).emit("chat-message", message)
          }
        })
      }
    } catch (error) {
      console.error("❌ Error handling chat message:", error)
    }
  })

  // Handle media state changes
  socket.on("media-state-change", (roomId, mediaState) => {
    try {
      const senderSessionId = socketUsers.get(socket.id)
      console.log(`🎥 Media state change in room ${roomId} from session ${senderSessionId}:`, mediaState)

      // Send to all other participants in the room
      const room = rooms.get(roomId)
      if (room) {
        room.connections.forEach((sessionId, socketId) => {
          if (socketId !== socket.id) {
            io.to(socketId).emit("media-state-change", mediaState, socket.id)
          }
        })
      }
    } catch (error) {
      console.error("❌ Error handling media state change:", error)
    }
  })

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    const sessionId = socketUsers.get(socket.id)
    console.log(`🔌 Socket disconnected: ${socket.id} (session: ${sessionId}), reason: ${reason}`)
    removeUserFromRoom(socket.id)
  })

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error)
  })
})

// Express middleware
app.use(express.json())
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  }),
)

// Ensure the uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
  console.log(`Created uploads directory at: ${uploadsDir}`)
}

// Serve static uploaded files
app.use("/uploads", express.static(uploadsDir))

// Initialize Passport
app.use(passport.initialize())

// Enhanced health check endpoint with detailed room information
app.get("/health", (req, res) => {
  const roomInfo = {}
  rooms.forEach((room, roomId) => {
    roomInfo[roomId] = {
      participants: room.participants.size,
      connections: Array.from(room.participants.keys()),
      socketIds: Array.from(room.connections.keys()),
    }
  })

  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
    totalConnections: userSockets.size,
    roomDetails: roomInfo,
    serverInfo: {
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
  })
})

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB()

    // Register routes
    app.use("/api/auth", authRoutes)
    app.use("/api/users", userRoutes)
    app.use("/api/appointments", appointmentRoutes)
    app.use("/api/availability", availabilityRoutes)
    app.use("/api/payments", paymentRoutes)

    app.get("/", (req, res) => {
      res.send("Video Consultation API is running...")
    })

    const PORT = process.env.PORT || 8000
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server started on port ${PORT}`)
      console.log(`🔌 Socket.IO server ready for connections`)
      console.log(`🏥 Health check available at: http://localhost:${PORT}/health`)
    })
  } catch (err) {
    console.error("❌ Failed to start server:", err.message)
    process.exit(1)
  }
}

startServer()
