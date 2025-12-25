const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Socket.IO with proper CORS for Railway
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

// 🔍 DEBUG ENDPOINT (Railway essential)
app.get('/api/debug', (req, res) => {
  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      MONGODB_URI: !!process.env.MONGODB_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      PORT: process.env.PORT
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Connect MongoDB FIRST
connectDB();

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

// GLOBAL STATE
const activeUsers = new Map();
const callRooms = new Map();

// ✅ SINGLE SOCKET CONNECTION HANDLER (Fixed!)
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // 1. User comes online
  socket.on('user-online', (userId) => {
    activeUsers.set(userId, {
      socketId: socket.id,
      onlineAt: new Date()
    });
    io.emit('user-status', { userId, status: 'online' });
    console.log('👥 Active users:', activeUsers.size);
  });

  // 2. Send real-time message
  socket.on('send-message', (data) => {
    const { senderId, receiverId, message, timestamp } = data;
    const receiver = activeUsers.get(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('receive-message', {
        senderId,
        message,
        timestamp,
        read: false
      });
    }
  });

  // 3. Typing indicator
  socket.on('user-typing', (data) => {
    const receiver = activeUsers.get(data.receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('user-typing', {
        userId: data.senderId
      });
    }
  });

  // 4. Stop typing
  socket.on('user-stop-typing', (data) => {
    const receiver = activeUsers.get(data.receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('user-stop-typing', {
        userId: data.senderId
      });
    }
  });

  // 5. Call initiation
  socket.on('initiate-call', (data) => {
    const { callerId, receiverId, callType } = data;
    const roomId = `${callerId}-${receiverId}-${Date.now()}`;
    
    const receiver = activeUsers.get(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('incoming-call', {
        callerId,
        roomId,
        callType,
        callerName: data.callerName,
        callerPhoto: data.callerPhoto
      });
      
      callRooms.set(roomId, {
        caller: callerId,
        receiver: receiverId,
        status: 'ringing',
        createdAt: Date.now()
      });
    } else {
      io.to(activeUsers.get(callerId)?.socketId).emit('user-offline', {
        receiverId
      });
    }
  });

  // 6. Call acceptance
  socket.on('accept-call', (data) => {
    const { roomId, receiverId, callerId } = data;
    const caller = activeUsers.get(callerId);
    
    if (caller) {
      io.to(caller.socketId).emit('call-accepted', {
        roomId,
        receiverId
      });
      
      if (callRooms.has(roomId)) {
        callRooms.get(roomId).status = 'active';
      }
    }
  });

  // 7. WebRTC Offer
  socket.on('send-offer', (data) => {
    const { receiverId, offer, roomId } = data;
    const receiver = activeUsers.get(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('receive-offer', { offer, roomId });
    }
  });

  // 8. WebRTC Answer
  socket.on('send-answer', (data) => {
    const { callerId, answer, roomId } = data;
    const caller = activeUsers.get(callerId);
    if (caller) {
      io.to(caller.socketId).emit('receive-answer', { answer, roomId });
    }
  });

  // 9. ICE Candidates
  socket.on('send-ice-candidate', (data) => {
    const { toUserId, candidate, roomId } = data;
    const user = activeUsers.get(toUserId);
    if (user) {
      io.to(user.socketId).emit('ice-candidate', { candidate, roomId });
    }
  });

  // 10. Call rejection
  socket.on('reject-call', (data) => {
    const { roomId, callerId } = data;
    const caller = activeUsers.get(callerId);
    if (caller) {
      io.to(caller.socketId).emit('call-rejected', { roomId });
    }
    callRooms.delete(roomId);
  });

  // 11. Call end
  socket.on('end-call', (data) => {
    const { roomId, otherUserId } = data;
    const user = activeUsers.get(otherUserId);
    if (user) {
      io.to(user.socketId).emit('call-ended', { roomId });
    }
    callRooms.delete(roomId);
  });

  // 12. Group socket handlers
  try {
    const groupSocket = require('./socket/groupSocket');
    groupSocket(io, socket);
  } catch (error) {
    console.log('⚠️ Group socket not found, skipping...');
  }

  // 13. Socket handler
  try {
    require('./socket/socketHandler')(io, socket);
  } catch (error) {
    console.log('⚠️ Socket handler not found, skipping...');
  }

  // 14. Disconnect
  socket.on('disconnect', () => {
    for (let [userId, userData] of activeUsers.entries()) {
      if (userData.socketId === socket.id) {
        activeUsers.delete(userId);
        io.emit('user-status', { userId, status: 'offline' });
        console.log(`❌ User ${userId} went offline`);
        break;
      }
    }
    console.log('🔌 Client disconnected:', socket.id);
  });

  // 15. Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// 🚀 RAILWAY-COMPATIBLE PORT BINDING
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Public URL: https://sendmebackend-production.up.railway.app`);
  console.log(`🔍 Debug: https://sendmebackend-production.up.railway.app/api/debug`);
});
