export interface Player {
  id: string;
  name: string;
  team: 'A' | 'B';
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GameState {
  players: { [id: string]: Player };
  ball: Ball;
  teamAScore: number;
  teamBScore: number;
  gameTime: number;
  gameStarted: boolean;
}

export class GameStateManager {
  private gameState: GameState;
  private gameStartTime: number;
  private gameTimer: NodeJS.Timeout | null = null;
  private readonly GAME_DURATION = 300; // 5 minutes in seconds
  private readonly FIELD_WIDTH = 1000;
  private readonly FIELD_HEIGHT = 600;
  private readonly GOAL_WIDTH = 120;
  private readonly GOAL_HEIGHT = 20;

  constructor() {
    this.gameState = {
      players: {},
      ball: { x: 500, y: 300, vx: 0, vy: 0 },
      teamAScore: 0,
      teamBScore: 0,
      gameTime: this.GAME_DURATION,
      gameStarted: false
    };
    this.gameStartTime = Date.now();
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }

  addPlayer(id: string, name: string, team: 'A' | 'B'): Player {
    // Spawn positions
    const spawnX = team === 'A' ? 150 : 850;
    const spawnY = 200 + Math.random() * 200;

    const player: Player = {
      id,
      name,
      team,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0
    };

    this.gameState.players[id] = player;
    
    // Start game timer if this is the first player
    if (!this.gameState.gameStarted && Object.keys(this.gameState.players).length >= 2) {
      this.startGame();
    }

    return player;
  }

  removePlayer(id: string): void {
    delete this.gameState.players[id];
  }

  updatePlayer(id: string, movement: { x: number; y: number }, kick: boolean): void {
    const player = this.gameState.players[id];
    if (!player) return;

    // Apply movement with speed limiting
    const speed = 3;
    player.vx = movement.x * speed;
    player.vy = movement.y * speed;

    // Update position with boundary checking
    player.x = Math.max(30, Math.min(this.FIELD_WIDTH - 30, player.x + player.vx));
    player.y = Math.max(30, Math.min(this.FIELD_HEIGHT - 30, player.y + player.vy));

    // Handle ball kicking
    if (kick) {
      this.handleKick(player);
    }
  }

  private handleKick(player: Player): void {
    const ball = this.gameState.ball;
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if player is close enough to kick
    if (distance < 30) {
      const kickPower = 8;
      const angle = Math.atan2(dy, dx);
      
      ball.vx = Math.cos(angle) * kickPower;
      ball.vy = Math.sin(angle) * kickPower;
    }
  }

  updatePhysics(): void {
    this.updateBallPhysics();
    this.checkGoals();
  }

  private updateBallPhysics(): void {
    const ball = this.gameState.ball;
    
    // Apply velocity
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Apply friction
    ball.vx *= 0.98;
    ball.vy *= 0.98;

    // Boundary collision (walls)
    if (ball.x <= 20 || ball.x >= this.FIELD_WIDTH - 20) {
      // Check if it's a goal
      const goalTop = (this.FIELD_HEIGHT - this.GOAL_WIDTH) / 2;
      const goalBottom = goalTop + this.GOAL_WIDTH;
      
      if (ball.y >= goalTop && ball.y <= goalBottom) {
        // Goal scored, don't bounce
        return;
      } else {
        ball.vx = -ball.vx * 0.8;
        ball.x = ball.x <= 20 ? 20 : this.FIELD_WIDTH - 20;
      }
    }

    if (ball.y <= 20 || ball.y >= this.FIELD_HEIGHT - 20) {
      ball.vy = -ball.vy * 0.8;
      ball.y = ball.y <= 20 ? 20 : this.FIELD_HEIGHT - 20;
    }

    // Stop very slow movement
    if (Math.abs(ball.vx) < 0.1) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.1) ball.vy = 0;
  }

  private checkGoals(): boolean {
    const ball = this.gameState.ball;
    const goalTop = (this.FIELD_HEIGHT - this.GOAL_WIDTH) / 2;
    const goalBottom = goalTop + this.GOAL_WIDTH;

    // Team A goal (left side)
    if (ball.x <= this.GOAL_HEIGHT && ball.y >= goalTop && ball.y <= goalBottom) {
      this.gameState.teamBScore++;
      this.resetBall();
      return true;
    }

    // Team B goal (right side)
    if (ball.x >= this.FIELD_WIDTH - this.GOAL_HEIGHT && ball.y >= goalTop && ball.y <= goalBottom) {
      this.gameState.teamAScore++;
      this.resetBall();
      return true;
    }

    return false;
  }

  private resetBall(): void {
    this.gameState.ball = {
      x: this.FIELD_WIDTH / 2,
      y: this.FIELD_HEIGHT / 2,
      vx: 0,
      vy: 0
    };
  }

  private startGame(): void {
    this.gameState.gameStarted = true;
    this.gameStartTime = Date.now();
    
    this.gameTimer = setInterval(() => {
      this.gameState.gameTime--;
      if (this.gameState.gameTime <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  private endGame(): void {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
    this.gameState.gameStarted = false;
    this.gameState.gameTime = 0;
  }

  isGameEnded(): boolean {
    return this.gameState.gameTime <= 0;
  }

  getWinner(): 'A' | 'B' | 'draw' {
    if (this.gameState.teamAScore > this.gameState.teamBScore) return 'A';
    if (this.gameState.teamBScore > this.gameState.teamAScore) return 'B';
    return 'draw';
  }
}