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
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Connect MongoDB
connectDB();

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Socket.io Events
const activeUsers = new Map();
const callRooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User comes online
  socket.on('user-online', (userId) => {
    activeUsers.set(userId, {
      socketId: socket.id,
      onlineAt: new Date()
    });
    io.emit('user-status', { userId, status: 'online' });
    console.log('Active users:', activeUsers.size);
  });
  

  // Send real-time message
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

  // Typing indicator
  socket.on('user-typing', (data) => {
    const receiver = activeUsers.get(data.receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('user-typing', {
        userId: data.senderId
      });
    }
  });

  // Stop typing
  socket.on('user-stop-typing', (data) => {
    const receiver = activeUsers.get(data.receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('user-stop-typing', {
        userId: data.senderId
      });
    }
  });

  // Call initiation
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

  // Call acceptance
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

  // WebRTC Offer
  socket.on('send-offer', (data) => {
    const { receiverId, offer, roomId } = data;
    const receiver = activeUsers.get(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit('receive-offer', { offer, roomId });
    }
  });

  // WebRTC Answer
  socket.on('send-answer', (data) => {
    const { callerId, answer, roomId } = data;
    const caller = activeUsers.get(callerId);
    if (caller) {
      io.to(caller.socketId).emit('receive-answer', { answer, roomId });
    }
  });

  // ICE Candidates
  socket.on('send-ice-candidate', (data) => {
    const { toUserId, candidate, roomId } = data;
    const user = activeUsers.get(toUserId);
    if (user) {
      io.to(user.socketId).emit('ice-candidate', { candidate, roomId });
    }
  });

  // Call rejection
  socket.on('reject-call', (data) => {
    const { roomId, callerId } = data;
    const caller = activeUsers.get(callerId);
    if (caller) {
      io.to(caller.socketId).emit('call-rejected', { roomId });
    }
    callRooms.delete(roomId);
  });

  // Call end
  socket.on('end-call', (data) => {
    const { roomId, otherUserId } = data;
    const user = activeUsers.get(otherUserId);
    if (user) {
      io.to(user.socketId).emit('call-ended', { roomId });
    }
    callRooms.delete(roomId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    for (let [userId, userData] of activeUsers.entries()) {
      if (userData.socketId === socket.id) {
        activeUsers.delete(userId);
        io.emit('user-status', { userId, status: 'offline' });
        console.log(`User ${userId} went offline`);
        break;
      }
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});
const groupSocket = require('./socket/groupSocket');

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Existing socket handlers
  require('./socket/socketHandler')(io, socket);
  
  // Group socket handlers
  groupSocket(io, socket);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
