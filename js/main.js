/**
 * Phaser.js Main Configuration
 * Word Puzzle Master - 메인 게임 설정
 */

// 게임 설정
const gameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#ffffff',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 800,
        height: 800,
        min: {
            width: 320,
            height: 320
        },
        max: {
            width: 1200,
            height: 1200
        }
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [GameScene]
};

// 전역 게임 상태
const gameState = {
    score: 0,
    multiplier: 1.0,
    foundWords: [],
    isGameActive: false,
    currentUser: null
};

// Phaser 게임 인스턴스 생성
let game;

// DOM이 로드된 후 게임 시작
window.addEventListener('DOMContentLoaded', () => {
    // Firebase 초기화 확인
    if (typeof initializeFirebase !== 'undefined') {
        initializeFirebase();
    }

    // Phaser 게임 생성
    game = new Phaser.Game(gameConfig);

    // UI 이벤트 리스너 설정
    setupUIListeners();
});

/**
 * UI 이벤트 리스너 설정
 */
function setupUIListeners() {
    // 구글 로그인 버튼
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleGoogleLogin);
    }

    // 로그아웃 버튼
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

/**
 * 구글 로그인 처리
 */
async function handleGoogleLogin() {
    if (typeof signInWithGoogle === 'function') {
        try {
            const user = await signInWithGoogle();
            updateUIForUser(user);
        } catch (error) {
            console.error('Login failed:', error);
            alert('로그인에 실패했습니다. 다시 시도해주세요.');
        }
    } else {
        alert('Firebase가 초기화되지 않았습니다.');
    }
}

/**
 * 로그아웃 처리
 */
async function handleLogout() {
    if (typeof signOut === 'function') {
        await signOut();
        updateUIForGuest();
    }
}

/**
 * 로그인된 사용자 UI 업데이트
 */
function updateUIForUser(user) {
    const loginBtn = document.getElementById('google-login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (loginBtn) loginBtn.style.display = 'none';
    if (userInfo) userInfo.style.display = 'flex';
    if (userAvatar) userAvatar.src = user.photoURL || '';
    if (userName) userName.textContent = user.displayName || 'User';

    gameState.currentUser = user;
}

/**
 * 게스트 사용자 UI 업데이트
 */
function updateUIForGuest() {
    const loginBtn = document.getElementById('google-login-btn');
    const userInfo = document.getElementById('user-info');

    if (loginBtn) loginBtn.style.display = 'block';
    if (userInfo) userInfo.style.display = 'none';

    gameState.currentUser = null;
}

/**
 * 점수 UI 업데이트
 */
function updateScoreUI() {
    const scoreElement = document.getElementById('current-score');
    const multiplierElement = document.getElementById('multiplier');
    const foundCountElement = document.getElementById('found-count');

    if (scoreElement) {
        scoreElement.textContent = Math.floor(gameState.score);
    }

    if (multiplierElement) {
        multiplierElement.textContent = gameState.multiplier.toFixed(2) + 'x';
    }

    if (foundCountElement) {
        foundCountElement.textContent = `${gameState.foundWords.length}/10`;
    }
}

/**
 * 단어 리스트 UI 업데이트
 */
function updateWordListUI(words) {
    const container = document.getElementById('words-to-find');
    if (!container) return;

    container.innerHTML = '';
    
    words.forEach(word => {
        const wordElement = document.createElement('div');
        wordElement.className = 'word-item';
        wordElement.textContent = word;
        wordElement.dataset.word = word;
        container.appendChild(wordElement);
    });
}

/**
 * 단어 찾았을 때 UI 업데이트
 */
function markWordAsFound(word) {
    const wordElements = document.querySelectorAll('.word-item');
    wordElements.forEach(element => {
        if (element.dataset.word === word) {
            element.classList.add('found');
        }
    });
}

/**
 * 리더보드 UI 업데이트
 */
function updateLeaderboardUI(leaderboardData) {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    container.innerHTML = '';

    if (!leaderboardData || leaderboardData.length === 0) {
        container.innerHTML = '<div class="loading">No records yet</div>';
        return;
    }

    leaderboardData.slice(0, 5).forEach((entry, index) => {
        const entryElement = document.createElement('div');
        entryElement.className = 'leaderboard-entry';
        
        if (gameState.currentUser && entry.userId === gameState.currentUser.uid) {
            entryElement.classList.add('highlight');
        }

        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        
        entryElement.innerHTML = `
            <span>${medal} ${entry.name}</span>
            <span>${entry.score}</span>
        `;
        
        container.appendChild(entryElement);
    });
}

/**
 * 게임 종료 처리
 */
async function handleGameEnd() {
    gameState.isGameActive = false;

    alert(`게임 종료!\n최종 점수: ${Math.floor(gameState.score)}\n찾은 단어: ${gameState.foundWords.length}/10`);

    // 점수를 Firestore에 저장
    if (gameState.currentUser && typeof saveScore === 'function') {
        await saveScore(gameState.currentUser.uid, gameState.currentUser.displayName, gameState.score);
    }

    // 리더보드 갱신
    if (typeof loadLeaderboard === 'function') {
        const leaderboard = await loadLeaderboard();
        updateLeaderboardUI(leaderboard);
    }
}

/**
 * 게임 리셋
 */
function resetGame() {
    gameState.score = 0;
    gameState.multiplier = 1.0;
    gameState.foundWords = [];
    gameState.isGameActive = true;
    updateScoreUI();
}
