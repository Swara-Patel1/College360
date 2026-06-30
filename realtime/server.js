const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

const SECRET = 'django-insecure-college-management-secret-key-2024-change-in-production';

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// In-memory store for connected users and chat messages
const connectedUsers = new Map();
const chatMessages = [];
const notifications = [];

// JWT Auth middleware for Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: No token'));
  }
  try {
    // We verify with the JWT secret from Django's SimpleJWT
    // SimpleJWT uses HS256 by default
    const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    socket.user = decoded;
    next();
  } catch (err) {
    // Allow connection anyway in dev mode
    console.log('JWT verification failed (dev mode - allowing):', err.message);
    socket.user = { user_id: 'guest', role: 'guest' };
    next();
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} | User: ${socket.user?.user_id}`);
  
  // Store user connection
  connectedUsers.set(socket.id, {
    socketId: socket.id,
    userId: socket.user?.user_id,
    role: socket.user?.role,
    connectedAt: new Date(),
  });

  // Broadcast online count
  io.emit('online_count', connectedUsers.size);

  // Send existing notifications to newly connected user
  socket.emit('notifications_history', notifications.slice(-20));
  
  // Send recent chat messages
  socket.emit('chat_history', chatMessages.slice(-50));

  // Join role-based room
  if (socket.user?.role) {
    socket.join(socket.user.role);
  }

  // ==================== ATTENDANCE ====================
  socket.on('attendance:mark', (data) => {
    console.log('Attendance marked:', data);
    const event = {
      type: 'attendance',
      ...data,
      timestamp: new Date().toISOString(),
      markedBy: socket.user?.user_id,
    };
    // Broadcast to all students in the course
    io.emit('attendance:updated', event);
    
    // Add notification
    const notif = {
      id: Date.now(),
      title: 'Attendance Marked',
      message: `Attendance for ${data.courseName || 'your course'} has been marked for ${data.date}`,
      type: 'attendance',
      audience: 'students',
      timestamp: new Date().toISOString(),
    };
    notifications.push(notif);
    io.to('student').emit('notification:new', notif);
  });

  // ==================== NOTIFICATIONS ====================
  socket.on('notification:send', (data) => {
    const notif = {
      id: Date.now(),
      ...data,
      timestamp: new Date().toISOString(),
      sentBy: socket.user?.user_id,
    };
    notifications.push(notif);
    
    // Send to target audience
    if (data.audience === 'all') {
      io.emit('notification:new', notif);
    } else {
      io.to(data.audience).emit('notification:new', notif);
    }
    console.log('Notification sent:', notif);
  });

  // ==================== CHAT ====================
  socket.on('chat:message', (data) => {
    const message = {
      id: Date.now(),
      ...data,
      senderId: socket.user?.user_id,
      timestamp: new Date().toISOString(),
    };
    chatMessages.push(message);
    
    // Broadcast to everyone or specific room
    if (data.to) {
      io.to(data.to).emit('chat:new_message', message);
      socket.emit('chat:new_message', message); // echo to sender
    } else {
      io.emit('chat:new_message', message);
    }
  });

  // ==================== GRADE POSTED ====================
  socket.on('grade:posted', (data) => {
    const notif = {
      id: Date.now(),
      title: 'New Grade Posted',
      message: `Your grade for ${data.courseName} has been posted. You scored ${data.grade}.`,
      type: 'grade',
      studentId: data.studentId,
      timestamp: new Date().toISOString(),
    };
    notifications.push(notif);
    io.emit('grade:new', { ...data, ...notif });
    io.to('student').emit('notification:new', notif);
  });

  // ==================== FEE REMINDER ====================
  socket.on('fee:reminder', (data) => {
    const notif = {
      id: Date.now(),
      title: 'Fee Payment Reminder',
      message: `Your ${data.feeType} fee of Rs. ${data.amount} is due on ${data.dueDate}. Please pay before the deadline.`,
      type: 'fee',
      timestamp: new Date().toISOString(),
    };
    notifications.push(notif);
    io.to('student').emit('notification:new', notif);
  });

  // ==================== NOTICE POSTED ====================
  socket.on('notice:posted', (data) => {
    const notif = {
      id: Date.now(),
      title: 'New Notice',
      message: data.title,
      type: 'notice',
      noticeId: data.id,
      timestamp: new Date().toISOString(),
    };
    notifications.push(notif);
    io.emit('notice:new', data);
    io.emit('notification:new', notif);
  });

  // ==================== DISCONNECT ====================
  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    io.emit('online_count', connectedUsers.size);
    console.log(`User disconnected: ${socket.id}`);
  });
});

// REST endpoints for health check and stats
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected_users: connectedUsers.size,
    total_notifications: notifications.length,
    total_messages: chatMessages.length,
    uptime: process.uptime(),
  });
});

app.get('/online-users', (req, res) => {
  res.json({
    count: connectedUsers.size,
    users: Array.from(connectedUsers.values()),
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Real-time server running on http://localhost:${PORT}`);
  console.log(`Socket.io ready for connections`);
});
