/**
 * Phaser.js Main Configuration
 * Word Puzzle Master - 메인 게임 설정
 */

// ━━━━━ 1. FALLBACK_WORDS: 서버 연결 없이도 즉시 게임 시작 가능 ━━━━━
const FALLBACK_WORDS = [
    'APPLE', 'BANANA', 'CHERRY', 'DRAGON', 'EAGLE',
    'FOREST', 'GUITAR', 'HARBOR', 'ISLAND', 'JUNGLE',
    'KNIGHT', 'LEMON', 'MANGO', 'NORTH', 'OCEAN',
    'PLANET', 'QUEEN', 'RIVER', 'STORM', 'TIGER',
    'ULTRA', 'VIVID', 'WHALE', 'XENON', 'ZEBRA',
    'ALPHA', 'BRAVE', 'CROWN', 'DELTA', 'EMBER',
    'FLAME', 'GHOST', 'HAVEN', 'IVORY', 'JOKER',
    'KARMA', 'LUNAR', 'MAGIC', 'NOBLE', 'ORBIT'
];

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
    timeLeft: 180,
    isGameActive: false,
    currentUser: null,
    wordList: [...FALLBACK_WORDS] // 항상 기본값 보장
};

// Phaser 게임 인스턴스 생성
let game;

/**
 * Grid 컨테이너 크기 계산 및 적용
 * CSS Grid의 중앙 셀 크기를 Phaser가 인식할 수 있도록 명시적으로 설정
 */
function calculateGameContainerSize() {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    // Grid 중앙 셀의 사용 가능한 공간 계산
    const mainArea = document.querySelector('.game-main-area');
    if (mainArea) {
        const mainRect = mainArea.getBoundingClientRect();
        const leftPanel = document.querySelector('.left-panel');
        const rightPanel = document.querySelector('.right-panel');
        
        // 패널 너비 + gap 계산
        const leftWidth = leftPanel ? leftPanel.offsetWidth : 260;
        const rightWidth = rightPanel ? rightPanel.offsetWidth : 280;
        const gap = 32; // var(--spacing-xl) 기본값
        
        // 사용 가능한 너비/높이
        const availableWidth = mainRect.width - leftWidth - rightWidth - (gap * 2);
        const availableHeight = mainRect.height - 48; // 상하 padding
        
        // 정사각형 유지 (작은 쪽에 맞춤)
        const size = Math.min(availableWidth, availableHeight, 800);
        
        // 컨테이너 크기 명시적 설정
        gameContainer.style.width = `${size}px`;
        gameContainer.style.height = `${size}px`;
        
        console.log(`📐 Game container size calculated: ${size}x${size}px`);
    }
}

// ━━━━━ 2. 비동기 부트스트래퍼 (Bootstrapper Pattern) ━━━━━

/**
 * 서버 데이터 로딩 (3초 타임아웃)
 * 실패 시 FALLBACK_WORDS 자동 사용
 */
async function loadServerData() {
    if (typeof getTodaysWords !== 'function') {
        console.log('ℹ️ 서버 연동 없음, FALLBACK_WORDS 사용');
        return [...FALLBACK_WORDS];
    }
    try {
        const result = await Promise.race([
            getTodaysWords(),
            new Promise(r => setTimeout(() => r(null), 3000))
        ]);
        if (result && result.length >= 10) {
            console.log('✅ 서버 단어 로드 완료');
            return result;
        }
    } catch (e) {
        console.warn('⚠️ 서버 로드 실패:', e.message);
    }
    console.log('ℹ️ FALLBACK_WORDS 사용');
    return [...FALLBACK_WORDS];
}

// DOM이 로드된 후 게임 즉시 시작
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 Starting game...');
    
    // 필수 라이브러리 확인
    if (typeof Phaser === 'undefined' || typeof GameScene === 'undefined') {
        alert('Phaser.js 또는 GameScene 로딩 실패. 새로고침하세요.');
        return;
    }
    
    // 게임 화면 활성화
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.classList.add('active');

    // 컨테이너 크기 설정
    calculateGameContainerSize();
    const container = document.getElementById('game-container');
    if (container && (container.offsetWidth === 0 || container.offsetHeight === 0)) {
        container.style.width = '800px';
        container.style.height = '800px';
    }

    // 폰트 로딩
    try { await document.fonts.ready; } catch (e) { /* 무시 */ }

    // CRITICAL: 데이터 먼저 확보, 그 후 Phaser 생성
    gameState.wordList = await loadServerData();
    console.log('✅ 단어 리스트 확보:', gameState.wordList.length, '개');
    
    // Phaser 게임 생성
    game = new Phaser.Game(gameConfig);
    console.log('🎮 Phaser 게임 생성 완료');

    // 푸터 상태 초기화
    updateFooterStatus();
    setupEventListeners();
    
    // 리더보드 구독 (선택적)
    if (typeof subscribeToLeaderboard === 'function') {
        try { subscribeToLeaderboard(updateLeaderboardUI); } catch (e) { /* 무시 */ }
    }
    
    console.log('✅ Game started!');
});

// 창 크기 변경 시 재계산
window.addEventListener('resize', () => {
    calculateGameContainerSize();
    if (game && game.scale) {
        game.scale.refresh();
    }
});

/**
 * 푸터 상태 업데이트
 */
function updateFooterStatus() {
    // 현재 점수
    const footerScore = document.getElementById('footer-score');
    if (footerScore) {
        footerScore.textContent = Math.floor(gameState.score).toLocaleString();
    }
    
    // 배수
    const footerMultiplier = document.getElementById('footer-multiplier');
    if (footerMultiplier) {
        footerMultiplier.textContent = `${gameState.multiplier.toFixed(2)}x`;
    }
    
    // Multiplier 게이지 업데이트
    const multiplierGaugeFill = document.getElementById('multiplier-gauge-fill');
    if (multiplierGaugeFill) {
        const multiplierPercent = ((gameState.multiplier - 1.0) / 2.0) * 100; // 1.0~3.0 → 0~100%
        const clampedPercent = Math.max(0, Math.min(100, multiplierPercent));
        multiplierGaugeFill.style.width = `${clampedPercent}%`;
        
        // 색상 변화 (1.0에 가까울수록 붉은색)
        if (gameState.multiplier <= 1.2) {
            multiplierGaugeFill.style.backgroundColor = '#ef4444'; // Red
        } else if (gameState.multiplier <= 1.8) {
            multiplierGaugeFill.style.backgroundColor = '#f59e0b'; // Orange
        } else {
            multiplierGaugeFill.style.backgroundColor = '#10b981'; // Green
        }
    }
    
    // 찾은 단어
    const footerFound = document.getElementById('footer-found');
    if (footerFound) {
        footerFound.textContent = `${gameState.foundWords.length}/10`;
    }
    
    // 남은 시간 (타이머)
    const footerTime = document.getElementById('footer-time');
    if (footerTime && gameState.timeLeft !== undefined) {
        const minutes = Math.floor(gameState.timeLeft / 60);
        const seconds = Math.floor(gameState.timeLeft % 60);
        footerTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // 최고 기록
    const footerHighScore = document.getElementById('footer-high-score');
    if (footerHighScore) {
        const highScore = localStorage.getItem('highScore') || '0';
        footerHighScore.textContent = parseInt(highScore).toLocaleString();
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
    
    // 푸터 상태도 함께 업데이트
    updateFooterStatus();
    
    // 최고 점수 업데이트
    const currentHighScore = parseInt(localStorage.getItem('highScore') || '0');
    if (gameState.score > currentHighScore) {
        localStorage.setItem('highScore', Math.floor(gameState.score).toString());
    }
}

/**
 * 단어 리스트 UI 업데이트
 */
function updateWordListUI(words) {
    console.log('📝 updateWordListUI 호출됨:', words);
    const container = document.getElementById('words-to-find');
    if (!container) {
        console.error('❌ words-to-find 컨테이너를 찾을 수 없음!');
        return;
    }
    
    if (!words || words.length === 0) {
        console.error('❌ 단어 리스트가 비어있음!');
        container.innerHTML = '<div class="loading">단어를 불러올 수 없습니다</div>';
        return;
    }

    container.innerHTML = '';
    
    words.forEach((word, index) => {
        const wordElement = document.createElement('div');
        wordElement.className = 'word-item';
        wordElement.textContent = word;
        wordElement.dataset.word = word;
        container.appendChild(wordElement);
        console.log(`✅ 단어 ${index + 1}/${words.length} 추가: ${word}`);
    });
    
    console.log(`✅ updateWordListUI 완료: ${words.length}개 단어 표시됨`);
}

// 전역 스코프에 명시적으로 할당 (Phaser Scene에서 접근 가능)
window.updateWordListUI = updateWordListUI;

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
 * ============================================
 * 커스텀 이벤트 리스너 설정
 * ============================================
 */
function setupEventListeners() {
    // 단어 발견 이벤트
    window.addEventListener('wordFound', (event) => {
        const { word, score, points, multiplier, foundCount } = event.detail;
        console.log(`🎉 단어 발견 이벤트: ${word} (+${points}점)`);
        
        // 점수 판널에 피드백 표시 (선택 사항)
        showScoreFeedback(points, multiplier);
    });
    
    // 게임 종료 이벤트
    window.addEventListener('gameEnd', (event) => {
        const { score, foundWords, timeElapsed, reason } = event.detail;
        console.log(`🏁 게임 종료: ${reason}`);
        
        // 결과 화면 표시
        showGameEndScreen(score, foundWords, timeElapsed, reason);
    });
}

/**
 * 점수 피드백 표시
 */
function showScoreFeedback(points, multiplier) {
    // 간단한 토스트 메시지 (선택 사항)
    console.log(`+${points} (×${multiplier.toFixed(2)})`);
}

/**
 * 게임 종료 화면 표시
 */
function showGameEndScreen(score, foundWords, timeElapsed, reason) {
    // 간단한 alert (나중에 모달로 교체 가능)
    const message = `게임 종료!\n\n최종 점수: ${score.toLocaleString()}\n찾은 단어: ${foundWords}개\n소요 시간: ${Math.floor(timeElapsed / 60)}분 ${Math.floor(timeElapsed % 60)}초`;
    alert(message);
}

/**
 * 리더보드 UI 업데이트
 */
function updateLeaderboardUI(leaderboard) {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'leaderboard-item';
        if (rank <= 3) {
            itemDiv.classList.add(`rank-${rank}`);
        }
        
        itemDiv.innerHTML = `
            <span class="rank">${rank}</span>
            <span class="player-name">${entry.userName || 'Anonymous'}</span>
            <span class="score">${entry.score.toLocaleString()}</span>
        `;
        
        container.appendChild(itemDiv);
    });
    
    console.log('📊 리더보드 UI 업데이트 완료');
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
