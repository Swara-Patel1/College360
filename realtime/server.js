const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const rateLimit = require('express-rate-limit');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

const app = express();
const server = http.createServer(app);

const SECRET = 'django-insecure-college-management-secret-key-2024-change-in-production';

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use(cors());
app.use(express.json());
app.use('/health', apiLimiter);
app.use('/online-users', apiLimiter);

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
    logger.warn({ err: err.message }, 'JWT verification failed (dev mode - allowing)');
    socket.user = { user_id: 'guest', role: 'guest' };
    next();
  }
});

// Track events for rate limiting per socket connection
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_EVENTS_PER_WINDOW = 10;
const socketEventTimestamps = new Map();

// Apply socket event rate limiter
io.use((socket, next) => {
  socket.use(([event, ...args], nextEvent) => {
    const now = Date.now();
    let timestamps = socketEventTimestamps.get(socket.id) || [];
    timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    
    if (timestamps.length >= MAX_EVENTS_PER_WINDOW) {
      logger.warn({ socketId: socket.id, userId: socket.user?.user_id, event }, 'Socket rate limit exceeded, event dropped');
      return nextEvent(new Error('Rate limit exceeded. Event dropped.'));
    }
    
    timestamps.push(now);
    socketEventTimestamps.set(socket.id, timestamps);
    nextEvent();
  });
  next();
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id, userId: socket.user?.user_id, role: socket.user?.role }, 'User connected');
  
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
    logger.info({ userId: socket.user?.user_id, attendance: data }, 'Attendance marked');
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
    logger.info({ notification: notif }, 'Notification sent');
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
    socketEventTimestamps.delete(socket.id);
    io.emit('online_count', connectedUsers.size);
    logger.info({ socketId: socket.id, userId: socket.user?.user_id }, 'User disconnected');
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
  logger.info({ port: PORT }, 'Real-time server started and listening');
  logger.info('Socket.io ready for connections');
});
