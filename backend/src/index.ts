import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { apiRouter } from './routes/api';
import { Database } from './db/db';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Enable CORS for frontend local development
const corsOptions = {
  origin: '*', // For development, allow all origins. In production, restrict to frontend domain.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// API Routes
app.use('/api', apiRouter);

// Basic health check
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'Wekelea Escrow Engine', version: '1.0.0' });
});

// Configure Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a room for a specific user to get direct push notifications
  socket.on('join_user_notifications', (userId: string) => {
    socket.join(`user_room_${userId}`);
    console.log(`👤 Socket ${socket.id} joined user_room_${userId}`);
  });

  // Join a room for a specific contract to get live state changes
  socket.on('join_contract', (contractId: string) => {
    socket.join(`contract_room_${contractId}`);
    console.log(`📄 Socket ${socket.id} joined contract_room_${contractId}`);
  });

  // Admin room
  socket.on('join_admin', () => {
    socket.join('admin_room');
    console.log(`👑 Socket ${socket.id} joined admin_room`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Setup a hook system on Database updates to broadcast real-time socket events
// We'll run a periodic sync check or extend our Database methods to emit events.
// For robust and simple real-time, we trigger broadcasts through simple middleware or helper emissions.
// We override express response methods or trigger them in our api routes by listening to events.

app.use((req, res, next) => {
  // Pass socket io to router context if needed
  req.app.set('io', io);
  next();
});

// Periodically check for updates or let routes invoke broadcasts
// Let's hook Express routes using an event emitter or directly via setting req.app.set('io', io)
// In our routing handlers, we can grab IO: req.app.get('io').emit(...)
// For example: 
// Whenever a contract status changes, emit `contract_updated` to its room
// Whenever a notification is created, emit `notification_received` to the user's room
// Let's modify api routes or implement a wrapper. Let's do it directly in the routing using an IO reference.

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Wekelea Escrow Engine running on http://localhost:${PORT}`);
  
  // Seed the DB file immediately on startup
  Database.getUsers().then(() => {
    console.log('📦 JSON Database successfully seeded and ready.');
  }).catch((err) => {
    console.error('⚠️ Database seeding failed:', err);
  });
});
