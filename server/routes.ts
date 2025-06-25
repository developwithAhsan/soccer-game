import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Game status API endpoint
  app.get('/api/status', (req, res) => {
    res.json({ 
      status: 'online',
      game: 'Football Shooting Game',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}