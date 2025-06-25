import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';
import { GameStateManager, Player } from './gameState';

interface ChatMessage {
  playerName: string;
  message: string;
  team: 'A' | 'B';
  timestamp: number;
  isTeamMessage?: boolean;
}

export class GameServer {
  private io: SocketIOServer;
  private gameState: GameStateManager;
  private updateInterval: NodeJS.Timeout | null = null;
  private connectedPlayers: Map<string, Player> = new Map();

  constructor(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.gameState = new GameStateManager();
    this.setupSocketHandlers();
    this.startGameLoop();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('joinTeam', (data) => {
        const { team, name } = data;
        
        if (!name || name.length === 0) {
          socket.emit('error', 'Invalid player name');
          return;
        }

        try {
          const player = this.gameState.addPlayer(socket.id, name, team);
          this.connectedPlayers.set(socket.id, player);
          
          socket.emit('playerJoined', {
            playerId: socket.id,
            team: team,
            player: player
          });

          // Broadcast player list update
          this.broadcastPlayerList();
          
          // Send system message
          this.broadcastChatMessage({
            playerName: '',
            message: `${name} joined Team ${team}`,
            team: team,
            timestamp: Date.now()
          }, true);

          console.log(`Player ${name} joined Team ${team}`);
        } catch (error) {
          socket.emit('error', 'Failed to join team');
          console.error('Error adding player:', error);
        }
      });

      socket.on('playerInput', (data) => {
        const { movement, kick } = data;
        this.gameState.updatePlayer(socket.id, movement, kick);
      });

      socket.on('chatMessage', (data) => {
        const player = this.connectedPlayers.get(socket.id);
        if (player && data.message && data.message.trim().length > 0) {
          const chatMessage: ChatMessage = {
            playerName: player.name,
            message: data.message.trim().substring(0, 100), // Limit message length
            team: player.team,
            timestamp: Date.now()
          };
          
          // Check if it's team-only message
          if (data.mode === 'team') {
            // Send only to team members
            this.io.sockets.sockets.forEach((socket, socketId) => {
              const socketPlayer = this.connectedPlayers.get(socketId);
              if (socketPlayer && socketPlayer.team === player.team) {
                socket.emit('chatMessage', {
                  playerName: chatMessage.playerName,
                  message: chatMessage.message,
                  team: chatMessage.team,
                  timestamp: chatMessage.timestamp,
                  isTeamMessage: true
                });
              }
            });
          } else {
            // Send to all players
            this.broadcastChatMessage(chatMessage);
          }
        }
      });

      socket.on('disconnect', () => {
        const player = this.connectedPlayers.get(socket.id);
        if (player) {
          this.gameState.removePlayer(socket.id);
          this.connectedPlayers.delete(socket.id);
          
          // Broadcast player list update
          this.broadcastPlayerList();
          
          // Send system message
          this.broadcastChatMessage({
            playerName: '',
            message: `${player.name} left the game`,
            team: player.team,
            timestamp: Date.now()
          }, true);

          console.log(`Player ${player.name} disconnected`);
        }
      });
    });
  }

  private startGameLoop(): void {
    const TICK_RATE = 60; // 60 FPS
    this.updateInterval = setInterval(() => {
      // Update game physics
      this.gameState.updatePhysics();
      
      // Check for goals and game end
      const currentState = this.gameState.getGameState();
      
      // Broadcast game state to all clients
      this.io.emit('gameState', currentState);
      
      // Check if game has ended
      if (this.gameState.isGameEnded()) {
        this.handleGameEnd();
      }
    }, 1000 / TICK_RATE);
  }

  private broadcastPlayerList(): void {
    const players: { [id: string]: { name: string; team: 'A' | 'B' } } = {};
    
    this.connectedPlayers.forEach((player, id) => {
      players[id] = {
        name: player.name,
        team: player.team
      };
    });

    this.io.emit('playerList', players);
  }

  private broadcastChatMessage(message: ChatMessage, isSystem = false): void {
    this.io.emit('chatMessage', {
      playerName: message.playerName,
      message: message.message,
      team: isSystem ? null : message.team,
      timestamp: message.timestamp,
      isTeamMessage: false
    });
  }

  private handleGameEnd(): void {
    const finalState = this.gameState.getGameState();
    const winner = this.gameState.getWinner();
    
    this.io.emit('gameEnd', {
      winner,
      teamAScore: finalState.teamAScore,
      teamBScore: finalState.teamBScore
    });

    // Broadcast final message
    let endMessage = '';
    if (winner === 'draw') {
      endMessage = `Game Over! It's a draw! Final Score: ${finalState.teamAScore} - ${finalState.teamBScore}`;
    } else {
      endMessage = `Game Over! Team ${winner} wins! Final Score: ${finalState.teamAScore} - ${finalState.teamBScore}`;
    }

    this.broadcastChatMessage({
      playerName: '',
      message: endMessage,
      team: 'A', // Doesn't matter for system messages
      timestamp: Date.now()
    }, true);

    // Reset game after 10 seconds
    setTimeout(() => {
      this.resetGame();
    }, 10000);
  }

  private resetGame(): void {
    // Create new game state
    this.gameState = new GameStateManager();
    
    // Clear all players from game state but keep connections
    this.connectedPlayers.clear();
    
    // Broadcast reset message
    this.broadcastChatMessage({
      playerName: '',
      message: 'New game starting! Please select your teams again.',
      team: 'A',
      timestamp: Date.now()
    }, true);

    // Force all clients to return to team selection
    this.io.emit('gameReset');
  }

  public shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.io.close();
  }
}