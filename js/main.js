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
    timeLeft: 180,
    isGameActive: false,
    currentUser: null
};

// 로컬 폴백 데이터 (서버 연결 실패 시 사용)
const DEFAULT_WORD_LIST = [
    'JAVASCRIPT', 'PHASER', 'GAME', 'PUZZLE', 'WORD',
    'CODE', 'DEVELOP', 'FIREBASE', 'MOBILE', 'CORDOVA'
];

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

// DOM이 로드된 후 게임 즉시 시작 (NO LOGIN)
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 Starting game instantly...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 초기화 단계 1: DOM 준비');
    console.log('Phaser 로드 여부:', typeof Phaser !== 'undefined' ? '✅ 로드됨' : '❌ 없음');
    console.log('GameScene 정의 여부:', typeof GameScene !== 'undefined' ? '✅ 정의됨' : '❌ 없음');
    console.log('WordGenerator 정의 여부:', typeof WordGenerator !== 'undefined' ? '✅ 정의됨' : '❌ 없음');
    
    // CRITICAL: 필수 라이브러리 확인
    if (typeof Phaser === 'undefined') {
        console.error('❌ Phaser.js가 로드되지 않았습니다!');
        alert('Phaser.js 로딩 실패. 페이지를 새로고침하세요.');
        return;
    }
    if (typeof GameScene === 'undefined') {
        console.error('❌ GameScene이 정의되지 않았습니다!');
        alert('GameScene 로딩 실패. 페이지를 새로고침하세요.');
        return;
    }
    
    // 게임 화면 즉시 활성화
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
        gameScreen.classList.add('active');
    }

    console.log('📋 초기화 단계 2: 컨테이너 크기 설정');
    // 컨테이너 크기 계산
    calculateGameContainerSize();
    
    // 컨테이너가 제대로 설정되었는지 확인
    const container = document.getElementById('game-container');
    if (!container) {
        console.error('❌ game-container 요소를 찾을 수 없습니다!');
        return;
    }
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.error('❌ 게임 컨테이너 크기 확인 실패');
        // 강제로 크기 설정
        container.style.width = '800px';
        container.style.height = '800px';
        container.style.minHeight = '600px';
    } else {
        console.log('✅ 컨테이너 크기:', {
            width: container.offsetWidth,
            height: container.offsetHeight
        });
    }

    console.log('📋 초기화 단계 3: Asset Preload (폰트)');
    // Asset Preload: 폰트 로딩 대기
    try {
        await document.fonts.ready;
        console.log('✅ 폰트 로딩 완료');
    } catch (err) {
        console.warn('⚠️ 폰트 로딩 실패, 계속 진행:', err);
    }

    console.log('📋 초기화 단계 4: 데이터 로딩 (CRITICAL)');
    // CRITICAL: 데이터 동기화 보장
    // Firebase 데이터를 완전히 로드한 후에만 Phaser 생성
    let wordList = [...DEFAULT_WORD_LIST]; // 방어적 복사
    console.log('🔹 기본 단어 리스트 준비:', wordList);
    
    // Firebase 단어 로드 (선택적)
    if (typeof getTodaysWords === 'function') {
        try {
            console.log('🔄 Firebase에서 단어 로드 시도...');
            const fetchedWords = await Promise.race([
                getTodaysWords(),
                new Promise((resolve) => setTimeout(() => resolve(null), 3000)) // 3초 타임아웃
            ]);
            if (fetchedWords && fetchedWords.length >= 10) {
                wordList = fetchedWords;
                console.log('✅ 서버에서 단어 로드 완료:', fetchedWords);
            } else {
                console.warn('⚠️ 서버 단어 부족 또는 타임아웃, 기본 단어 사용');
            }
        } catch (err) {
            console.warn('⚠️ 서버 단어 로드 실패, 기본 단어 사용:', err);
        }
    } else {
        console.log('ℹ️ getTodaysWords 함수 없음, 기본 단어 사용');
    }
    
    // CRITICAL: 데이터를 gameState에 저장 (동기화 완료)
    gameState.defaultWordList = wordList;
    console.log('✅ gameState.defaultWordList 설정 완료:', {
        count: wordList.length,
        words: wordList
    });
    
    console.log('📋 초기화 단계 5: Phaser 게임 생성');
    console.log('⚠️ CRITICAL: 이 시점에서 데이터가 준비되어 있어야 함!');
    
    try {
        // Phaser 게임 생성 (데이터 로딩 완료 후)
        game = new Phaser.Game(gameConfig);
        console.log('🎮 Phaser 게임 인스턴스 생성 완료');
        console.log('🎮 게임 객체:', game);
        console.log('🎮 Canvas 확인:', {
            canvas: game.canvas,
            canvasExists: !!game.canvas,
            canvasParent: game.canvas ? game.canvas.parentElement : null,
            canvasSize: game.canvas ? `${game.canvas.width}x${game.canvas.height}` : 'N/A'
        });
        
        // Canvas가 제대로 생성되었는지 확인
        if (!game.canvas) {
            console.error('❌ Canvas가 생성되지 않았습니다!');
            alert('Canvas 생성 실패. 페이지를 새로고침하세요.');
            return;
        }
    } catch (err) {
        console.error('❌ Phaser 게임 생성 실패:', err);
        alert('Phaser 게임 생성 실패: ' + err.message);
        return;
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 푸터 상태 초기화
    updateFooterStatus();
    
    // 커스텀 이벤트 리스너 등록
    setupEventListeners();
    
    // 실시간 리더보드 구독
    if (typeof subscribeToLeaderboard === 'function') {
        subscribeToLeaderboard(updateLeaderboardUI);
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
