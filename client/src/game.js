// Game client implementation
class FootballGame {
    constructor() {
        this.socket = io();
        this.canvas = null;
        this.ctx = null;
        this.gameState = {
            players: {},
            ball: { x: 500, y: 300, vx: 0, vy: 0 },
            teamAScore: 0,
            teamBScore: 0,
            gameTime: 300 // 5 minutes in seconds
        };
        this.myPlayerId = null;
        this.myTeam = null;
        this.keys = {};
        this.lastUpdateTime = 0;
        
        // Field boundary constants
        this.FIELD = {
            LEFT: 20,
            RIGHT: 980,    // Assuming canvas width of 1000px
            TOP: 20,
            BOTTOM: 580,   // Assuming canvas height of 600px
            LINE_WIDTH: 3,
            GOAL_WIDTH: 120,
            GOAL_DEPTH: 20,
            PLAYER_RADIUS: 15,
            BALL_RADIUS: 10,
            PLAYER_SPEED: 5
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    setupEventListeners() {
        // Team selection
        document.getElementById('teamA').addEventListener('click', () => {
            this.joinTeam('A');
        });

        document.getElementById('teamB').addEventListener('click', () => {
            this.joinTeam('B');
        });

        // Chat functionality
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendChat');
        const chatMode = document.getElementById('chatMode');

        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message) {
                const messageData = {
                    message: message,
                    mode: chatMode.value,
                    team: this.myTeam
                };
                this.socket.emit('chatMessage', messageData);
                chatInput.value = '';
            }
        };

        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                this.keys[e.code] = true;
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                this.keys[e.code] = false;
                e.preventDefault();
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('playerJoined', (data) => {
            this.myPlayerId = data.playerId;
            this.myTeam = data.team;
            this.showGameScreen();
        });

        this.socket.on('gameState', (state) => {
            // Apply boundary constraints to received game state
            const constrainedState = this.constrainGameState(state);
            this.gameState = constrainedState;
            this.updateUI();
        });

        this.socket.on('chatMessage', (data) => {
            this.displayChatMessage(data);
        });

        this.socket.on('playerList', (players) => {
            this.updatePlayerList(players);
        });

        this.socket.on('goal', (data) => {
            this.displayGoalMessage(data.team);
        });

        this.socket.on('gameEnd', (data) => {
            this.displayGameEnd(data);
        });
    }

    constrainGameState(state) {
        // Constrain ball position
        state.ball = this.constrainBallPosition(state.ball);
        
        // Constrain all players' positions
        Object.keys(state.players).forEach(playerId => {
            const player = state.players[playerId];
            const constrainedPos = this.constrainPlayerPosition(player.x, player.y);
            player.x = constrainedPos.x;
            player.y = constrainedPos.y;
        });
        
        return state;
    }

    joinTeam(team) {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('Please enter your name!');
            return;
        }

        this.socket.emit('joinTeam', { team, name: playerName });
    }

    showGameScreen() {
        document.getElementById('teamSelection').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas dimensions based on field boundaries
        this.canvas.width = this.FIELD.RIGHT + this.FIELD.LEFT;
        this.canvas.height = this.FIELD.BOTTOM + this.FIELD.TOP;
        
        this.startGameLoop();
    }

    startGameLoop() {
        const gameLoop = (timestamp) => {
            if (timestamp - this.lastUpdateTime > 16) { // ~60 FPS
                this.handleInput();
                this.render();
                this.lastUpdateTime = timestamp;
            }
            requestAnimationFrame(gameLoop);
        };
        requestAnimationFrame(gameLoop);
    }

    handleInput() {
        if (!this.myPlayerId) return;

        const movement = { x: 0, y: 0 };
        let shouldKick = false;

        // Movement controls
        if (this.keys['KeyW'] || this.keys['ArrowUp']) movement.y -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) movement.y += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) movement.x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) movement.x += 1;
        if (this.keys['Space']) shouldKick = true;

        // Apply boundary constraints to movement
        const player = this.gameState.players[this.myPlayerId];
        if (player) {
            const newX = player.x + movement.x * this.FIELD.PLAYER_SPEED;
            const newY = player.y + movement.y * this.FIELD.PLAYER_SPEED;
            const constrained = this.constrainPlayerPosition(newX, newY);
            
            movement.x = (constrained.x - player.x) / this.FIELD.PLAYER_SPEED;
            movement.y = (constrained.y - player.y) / this.FIELD.PLAYER_SPEED;
        }

        // Send input to server
        if (movement.x !== 0 || movement.y !== 0 || shouldKick) {
            this.socket.emit('playerInput', { movement, kick: shouldKick });
        }
    }

    constrainPlayerPosition(x, y) {
        const {
            LEFT, RIGHT, TOP, BOTTOM,
            GOAL_WIDTH, GOAL_DEPTH,
            PLAYER_RADIUS
        } = this.FIELD;

        // Calculate goal area boundaries
        const goalCenterY = (TOP + BOTTOM) / 2;
        const goalTop = goalCenterY - GOAL_WIDTH / 2;
        const goalBottom = goalCenterY + GOAL_WIDTH / 2;

        // Constrain X position
        let constrainedX = x;
        if (x - PLAYER_RADIUS < LEFT) {
            constrainedX = LEFT + PLAYER_RADIUS;
        } else if (x + PLAYER_RADIUS > RIGHT) {
            constrainedX = RIGHT - PLAYER_RADIUS;
        }

        // Constrain Y position
        let constrainedY = y;
        if (y - PLAYER_RADIUS < TOP) {
            constrainedY = TOP + PLAYER_RADIUS;
        } else if (y + PLAYER_RADIUS > BOTTOM) {
            constrainedY = BOTTOM - PLAYER_RADIUS;
        }

        return { x: constrainedX, y: constrainedY };
    }

    constrainBallPosition(ball) {
        const {
            LEFT, RIGHT, TOP, BOTTOM,
            GOAL_WIDTH, BALL_RADIUS
        } = this.FIELD;

        // Calculate goal area boundaries
        const goalCenterY = (TOP + BOTTOM) / 2;
        const goalTop = goalCenterY - GOAL_WIDTH / 2;
        const goalBottom = goalCenterY + GOAL_WIDTH / 2;

        // Check left boundary
        if (ball.x - BALL_RADIUS < LEFT) {
            if (ball.y >= goalTop && ball.y <= goalBottom) {
                // Ball is in goal area - let server handle goal detection
                ball.x = LEFT - BALL_RADIUS;
            } else {
                // Bounce off left wall
                ball.x = LEFT + BALL_RADIUS;
                ball.vx *= -0.8;
            }
        }
        // Check right boundary
        else if (ball.x + BALL_RADIUS > RIGHT) {
            if (ball.y >= goalTop && ball.y <= goalBottom) {
                // Ball is in goal area - let server handle goal detection
                ball.x = RIGHT + BALL_RADIUS;
            } else {
                // Bounce off right wall
                ball.x = RIGHT - BALL_RADIUS;
                ball.vx *= -0.8;
            }
        }

        // Check top and bottom boundaries
        if (ball.y - BALL_RADIUS < TOP) {
            ball.y = TOP + BALL_RADIUS;
            ball.vy *= -0.8;
        } else if (ball.y + BALL_RADIUS > BOTTOM) {
            ball.y = BOTTOM - BALL_RADIUS;
            ball.vy *= -0.8;
        }

        return ball;
    }

    render() {
        if (!this.ctx) return;

        const { ctx } = this;
        
        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw field with boundaries
        this.drawField();
        
        // Draw players
        this.drawPlayers();
        
        // Draw ball
        this.drawBall();
    }

    drawField() {
        const { ctx } = this;
        const {
            LEFT, RIGHT, TOP, BOTTOM,
            LINE_WIDTH, GOAL_WIDTH, GOAL_DEPTH
        } = this.FIELD;
        
        // Field background
        ctx.fillStyle = '#0f5132'; // Dark green
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Field boundary (white line)
        ctx.strokeStyle = 'white';
        ctx.lineWidth = LINE_WIDTH;
        ctx.strokeRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP);
        
        // Center line
        ctx.beginPath();
        ctx.moveTo(this.canvas.width / 2, TOP);
        ctx.lineTo(this.canvas.width / 2, BOTTOM);
        ctx.stroke();
        
        // Center circle
        ctx.beginPath();
        ctx.arc(this.canvas.width / 2, (TOP + BOTTOM) / 2, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        // Goals
        const goalTopY = (this.canvas.height - GOAL_WIDTH) / 2;
        
        // Left goal (Team A)
        ctx.fillStyle = '#e74c3c'; // Red
        ctx.fillRect(0, goalTopY, GOAL_DEPTH, GOAL_WIDTH);
        ctx.strokeRect(0, goalTopY, GOAL_DEPTH, GOAL_WIDTH);
        
        // Right goal (Team B)
        ctx.fillStyle = '#3498db'; // Blue
        ctx.fillRect(this.canvas.width - GOAL_DEPTH, goalTopY, GOAL_DEPTH, GOAL_WIDTH);
        ctx.strokeRect(this.canvas.width - GOAL_DEPTH, goalTopY, GOAL_DEPTH, GOAL_WIDTH);
        
        // Goal areas
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        const goalAreaWidth = 60;
        const goalAreaExtension = 40;
        ctx.strokeRect(LEFT, goalTopY - goalAreaExtension / 2, goalAreaWidth, GOAL_WIDTH + goalAreaExtension);
        ctx.strokeRect(RIGHT - goalAreaWidth, goalTopY - goalAreaExtension / 2, goalAreaWidth, GOAL_WIDTH + goalAreaExtension);
    }

    drawPlayers() {
        const { ctx } = this;
        
        Object.values(this.gameState.players).forEach(player => {
            // Player body
            ctx.fillStyle = player.team === 'A' ? '#e74c3c' : '#3498db';
            ctx.beginPath();
            ctx.arc(player.x, player.y, this.FIELD.PLAYER_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            
            // Player outline
            ctx.strokeStyle = player.id === this.myPlayerId ? '#f1c40f' : 'white';
            ctx.lineWidth = player.id === this.myPlayerId ? 3 : 2;
            ctx.stroke();
            
            // Player name
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.name, player.x, player.y - 25);
        });
    }

    drawBall() {
        const { ctx } = this;
        const ball = this.gameState.ball;
        
        // Ball shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(ball.x + 2, ball.y + 2, 10, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Ball
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, this.FIELD.BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // Ball pattern
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Pentagon pattern on ball
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            const x = ball.x + Math.cos(angle) * 6;
            const y = ball.y + Math.sin(angle) * 6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    updateUI() {
        // Update scores
        document.getElementById('teamAScore').textContent = this.gameState.teamAScore;
        document.getElementById('teamBScore').textContent = this.gameState.teamBScore;
        
        // Update timer
        const minutes = Math.floor(this.gameState.gameTime / 60);
        const seconds = this.gameState.gameTime % 60;
        document.getElementById('gameTimer').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    displayChatMessage(data) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${data.team ? `team-${data.team.toLowerCase()}` : 'system'}`;
        
        if (data.playerName) {
            messageElement.textContent = `${data.playerName}: ${data.message}`;
        } else {
            messageElement.textContent = data.message;
        }
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Auto-remove old messages to prevent overflow
        if (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    updatePlayerList(players) {
        const teamAList = document.getElementById('teamAPlayers');
        const teamBList = document.getElementById('teamBPlayers');
        
        teamAList.innerHTML = '';
        teamBList.innerHTML = '';
        
        Object.values(players).forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            
            if (player.team === 'A') {
                teamAList.appendChild(li);
            } else {
                teamBList.appendChild(li);
            }
        });
    }

    displayGoalMessage(team) {
        // Create goal notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${team === 'A' ? '#e74c3c' : '#3498db'};
            color: white;
            padding: 2rem 4rem;
            border-radius: 15px;
            font-size: 2rem;
            font-weight: bold;
            z-index: 1000;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            animation: goalAnimation 3s ease-in-out forwards;
        `;
        
        notification.textContent = `GOAL! Team ${team} Scores!`;
        document.body.appendChild(notification);
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes goalAnimation {
                0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        // Display goal message in chat
        this.displayChatMessage({
            playerName: '',
            message: `🚀 GOAL! Team ${team} scored!`,
            team: null
        });
        
        setTimeout(() => {
            document.body.removeChild(notification);
            document.head.removeChild(style);
        }, 3000);
    }

    displayGameEnd(data) {
        const winner = data.teamAScore > data.teamBScore ? 'Team A' : 
                      data.teamBScore > data.teamAScore ? 'Team B' : 'Draw';
        
        // Display in chat
        this.displayChatMessage({
            playerName: '',
            message: `🏆 Game Over! ${winner === 'Draw' ? 'It\'s a draw!' : `${winner} wins!`} Final Score: ${data.teamAScore} - ${data.teamBScore}`,
            team: null
        });
        
        alert(`Game Over!\n${winner === 'Draw' ? 'It\'s a draw!' : `${winner} wins!`}\nFinal Score: ${data.teamAScore} - ${data.teamBScore}`);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new FootballGame();
});