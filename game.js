// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun'],
    localStorage: false // 禁用 localStorage 以提升性能
});

const BOARD_SIZE = 15;
let gameBoard = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
let currentPlayer = '';
let myName = '';
let isMyTurn = false;
let lastUpdateTime = 0;
const THROTTLE_DELAY = 100; // 節流延遲時間（毫秒）

// 遊戲狀態管理
const game = gun.get('gomoku-game');
const players = game.get('players');
const moves = game.get('moves');
const chat = game.get('chat');

// DOM 元素快取
const board = document.getElementById('board');
const gameStatus = document.getElementById('gameStatus');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGame');
const playersList = document.getElementById('players');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMsgBtn = document.getElementById('sendMsg');
const restartBtn = document.getElementById('restartBtn');
const undoBtn = document.getElementById('undoBtn');
const timerElement = document.getElementById('timer');

// 計時器相關變數
const TURN_TIME = 30; // 每回合30秒
let timeRemaining = TURN_TIME;
let timerInterval = null;

// 節流函數
function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            func.apply(this, args);
            lastCall = now;
        }
    };
}

// 初始化棋盤（使用文檔片段優化）
function initializeBoard() {
    const fragment = document.createDocumentFragment();
    board.innerHTML = '';
    
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', handleCellClick);
            fragment.appendChild(cell);
        }
    }
    
    board.appendChild(fragment);
    gameBoard = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
}

// 處理加入遊戲
joinGameBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim();
    if (!myName) {
        alert('請輸入您的名字！');
        return;
    }
    
    players.set({
        name: myName,
        timestamp: Date.now()
    });
    
    playerNameInput.disabled = true;
    joinGameBtn.disabled = true;
    
    updateGameStatus();
    
    if (isMyTurn) {
        startTimer();
    }
});

// 優化的玩家列表更新
const updatePlayersList = throttle(() => {
    const fragment = document.createDocumentFragment();
    let playerArray = [];
    
    players.map().once((player) => {
        if (player) {
            playerArray.push(player);
        }
    });
    
    playerArray.sort((a, b) => a.timestamp - b.timestamp);
    playersList.innerHTML = '';
    
    playerArray.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${player.name}${index === 0 ? ' (黑子)' : index === 1 ? ' (白子)' : ' (觀察者)'}`;
        if (player.name === myName) {
            li.style.fontWeight = 'bold';
        }
        fragment.appendChild(li);
    });
    
    playersList.appendChild(fragment);
}, THROTTLE_DELAY);

// 優化的落子處理
function handleCellClick(e) {
    if (!isMyTurn) return;
    
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    
    if (gameBoard[row][col]) return;
    
    moves.set({
        row,
        col,
        player: myName,
        timestamp: Date.now()
    });
}

// 監聽落子
moves.map().on(function(move) {
    if (!move) return;
    placePiece(move.row, move.col, move.player);
    updateGameStatus();
    
    // 重置計時器
    if (isMyTurn) {
        startTimer();
    }
});

// 優化的棋子放置
function placePiece(row, col, playerName) {
    const cell = board.children[row * BOARD_SIZE + col];
    if (!cell) return;

    // 檢查是否已經有棋子
    if (cell.querySelector('.piece')) return;

    const piece = document.createElement('div');
    const isBlack = getPlayerIndex(playerName) === 0;
    
    piece.className = `piece ${isBlack ? 'black' : 'white'}`;
    cell.appendChild(piece);
    gameBoard[row][col] = isBlack ? 'black' : 'white';
    
    if (checkWin(row, col)) {
        requestAnimationFrame(() => {
            gameStatus.textContent = `遊戲結束！${playerName} 獲勝！`;
            disableBoard();
        });
    }
}

// 檢查獲勝
function checkWin(row, col) {
    const directions = [
        [[0, 1], [0, -1]],  // 水平
        [[1, 0], [-1, 0]],  // 垂直
        [[1, 1], [-1, -1]], // 對角線
        [[1, -1], [-1, 1]]  // 反對角線
    ];
    
    const currentColor = gameBoard[row][col];
    
    return directions.some(direction => {
        const count = 1 + 
            countPieces(row, col, direction[0][0], direction[0][1], currentColor) +
            countPieces(row, col, direction[1][0], direction[1][1], currentColor);
        return count >= 5;
    });
}

// 數連續棋子
function countPieces(row, col, deltaRow, deltaCol, color) {
    let count = 0;
    let currentRow = row + deltaRow;
    let currentCol = col + deltaCol;
    
    while (
        currentRow >= 0 && 
        currentRow < BOARD_SIZE && 
        currentCol >= 0 && 
        currentCol < BOARD_SIZE && 
        gameBoard[currentRow][currentCol] === color
    ) {
        count++;
        currentRow += deltaRow;
        currentCol += deltaCol;
    }
    
    return count;
}

// 優化的遊戲狀態更新
const updateGameStatus = throttle(() => {
    const playerIndex = getPlayerIndex(myName);
    if (playerIndex === -1) {
        gameStatus.textContent = '您正在觀戰';
        isMyTurn = false;
        clearInterval(timerInterval);
    } else {
        const currentTurn = getCurrentTurn();
        const wasMyTurn = isMyTurn;
        isMyTurn = playerIndex === currentTurn;
        
        if (isMyTurn && !wasMyTurn) {
            startTimer();
        } else if (!isMyTurn && wasMyTurn) {
            clearInterval(timerInterval);
        }
        
        gameStatus.textContent = isMyTurn ? '輪到你下棋了！' : '等待對手下棋...';
    }
}, THROTTLE_DELAY);

// 取得玩家索引
function getPlayerIndex(playerName) {
    let index = -1;
    let i = 0;
    players.map().once(function(player) {
        if (player && player.name === playerName) {
            index = i;
        }
        i++;
    });
    return index;
}

// 取得當前回合
function getCurrentTurn() {
    let moveCount = 0;
    moves.map().once(function() {
        moveCount++;
    });
    return moveCount % 2;
}

// 聊天功能
sendMsgBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !myName) return;
    
    chat.set({
        name: myName,
        message: message,
        timestamp: Date.now()
    });
    
    chatInput.value = '';
}

// 優化的聊天訊息處理
const addChatMessage = (() => {
    const messageQueue = [];
    let isProcessing = false;

    function processMessageQueue() {
        if (isProcessing || messageQueue.length === 0) return;
        
        isProcessing = true;
        const fragment = document.createDocumentFragment();
        
        while (messageQueue.length > 0 && fragment.childNodes.length < 10) {
            const msg = messageQueue.shift();
            const msgDiv = document.createElement('div');
            msgDiv.textContent = `${msg.name}: ${msg.message}`;
            fragment.appendChild(msgDiv);
        }
        
        chatMessages.appendChild(fragment);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        isProcessing = false;
        if (messageQueue.length > 0) {
            requestAnimationFrame(processMessageQueue);
        }
    }

    return (msg) => {
        if (!msg) return;
        messageQueue.push(msg);
        requestAnimationFrame(processMessageQueue);
    };
})();

// 優化的事件監聽
chat.map().on(addChatMessage);

// 重新開始遊戲
restartBtn.addEventListener('click', () => {
    if (getPlayerIndex(myName) !== 0) {
        alert('只有黑方可以重新開始遊戲！');
        return;
    }
    
    if (confirm('確定要重新開始遊戲嗎？')) {
        moves.set(null);
        initializeBoard();
        gameStatus.textContent = '遊戲已重新開始！';
        clearInterval(timerInterval);
        if (isMyTurn) {
            startTimer();
        }
    }
});

// 悔棋功能
undoBtn.addEventListener('click', () => {
    if (!isMyTurn) {
        alert('不是你的回合！');
        return;
    }
    
    let lastMove = null;
    moves.map().once(function(move) {
        if (move) lastMove = move;
    });
    
    if (lastMove && lastMove.player !== myName) {
        if (confirm('確定要悔棋嗎？')) {
            moves.set(null);
            initializeBoard();
            // 重新播放除了最後一手之外的所有移動
            moves.map().once(function(move) {
                if (move && move !== lastMove) {
                    placePiece(move.row, move.col, move.player);
                }
            });
            clearInterval(timerInterval);
            if (isMyTurn) {
                startTimer();
            }
        }
    } else {
        alert('無法悔棋！');
    }
});

// 禁用棋盤
function disableBoard() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => cell.removeEventListener('click', handleCellClick));
}

// 開始計時
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeRemaining = TURN_TIME;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            handleTimeUp();
        } else if (timeRemaining <= 10) {
            timerElement.classList.add('warning');
        } else {
            timerElement.classList.remove('warning');
        }
    }, 1000);
}

// 更新計時器顯示
function updateTimerDisplay() {
    timerElement.textContent = `剩餘時間: ${timeRemaining}秒`;
}

// 處理時間用完
function handleTimeUp() {
    clearInterval(timerInterval);
    if (isMyTurn) {
        // 自動下一個合法棋步
        makeRandomMove();
    }
}

// 自動下棋
function makeRandomMove() {
    const emptyCells = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (!gameBoard[i][j]) {
                emptyCells.push({row: i, col: j});
            }
        }
    }
    
    if (emptyCells.length > 0) {
        const randomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        moves.set({
            row: randomMove.row,
            col: randomMove.col,
            player: myName,
            timestamp: Date.now()
        });
    }
}

// 初始化遊戲
initializeBoard();