/**
 * Cordova 초기화 및 모바일 최적화
 * 디바이스 준비 이벤트 및 모바일 환경 처리
 */

// Cordova 환경 체크
const isCordova = typeof cordova !== 'undefined';

/**
 * Cordova deviceready 이벤트 리스너
 */
if (isCordova) {
    document.addEventListener('deviceready', onDeviceReady, false);
} else {
    // 웹 브라우저에서는 바로 실행
    console.log('Running in browser mode');
}

/**
 * 디바이스 준비 완료
 */
function onDeviceReady() {
    console.log('Cordova device is ready');
    
    // 디바이스 정보 로그
    if (window.device) {
        console.log('Device:', {
            platform: device.platform,
            version: device.version,
            model: device.model,
            manufacturer: device.manufacturer,
            uuid: device.uuid
        });
    }
    
    // 상태바 설정
    if (window.StatusBar) {
        StatusBar.backgroundColorByHexString('#667eea');
        StatusBar.styleLightContent();
    }
    
    // 스플래시 스크린 숨기기
    if (navigator.splashscreen) {
        setTimeout(() => {
            navigator.splashscreen.hide();
        }, 1000);
    }
    
    // 뒤로가기 버튼 처리 (Android)
    document.addEventListener('backbutton', onBackButton, false);
    
    // 일시정지/재개 이벤트
    document.addEventListener('pause', onPause, false);
    document.addEventListener('resume', onResume, false);
    
    // 네트워크 상태 확인
    if (navigator.connection) {
        checkNetworkStatus();
        document.addEventListener('online', onOnline, false);
        document.addEventListener('offline', onOffline, false);
    }
    
    // Firebase 모바일 설정
    configureMobileFirebase();
}

/**
 * 뒤로가기 버튼 처리
 */
function onBackButton(e) {
    e.preventDefault();
    
    // 게임 중이면 확인 다이얼로그 표시
    if (gameState.isGameActive) {
        if (confirm('게임을 종료하시겠습니까?')) {
            navigator.app.exitApp();
        }
    } else {
        navigator.app.exitApp();
    }
}

/**
 * 앱 일시정지
 */
function onPause() {
    console.log('App paused');
    
    // 게임 일시정지
    if (game && game.scene.isActive('GameScene')) {
        game.scene.pause('GameScene');
    }
}

/**
 * 앱 재개
 */
function onResume() {
    console.log('App resumed');
    
    // 게임 재개
    if (game && game.scene.isPaused('GameScene')) {
        game.scene.resume('GameScene');
    }
}

/**
 * 네트워크 상태 확인
 */
function checkNetworkStatus() {
    const networkState = navigator.connection.type;
    
    console.log('Network status:', networkState);
    
    if (networkState === Connection.NONE) {
        showNetworkWarning();
    }
}

/**
 * 온라인 상태
 */
function onOnline() {
    console.log('Network connection available');
    hideNetworkWarning();
    
    // Firebase 재연결
    if (typeof loadLeaderboard === 'function') {
        loadLeaderboard();
    }
}

/**
 * 오프라인 상태
 */
function onOffline() {
    console.log('Network connection lost');
    showNetworkWarning();
}

/**
 * 네트워크 경고 표시
 */
function showNetworkWarning() {
    let warning = document.getElementById('network-warning');
    
    if (!warning) {
        warning = document.createElement('div');
        warning.id = 'network-warning';
        warning.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ff6b6b;
            color: white;
            padding: 10px;
            text-align: center;
            z-index: 9999;
            font-weight: bold;
        `;
        warning.textContent = '⚠️ 네트워크 연결이 없습니다';
        document.body.appendChild(warning);
    }
}

/**
 * 네트워크 경고 숨기기
 */
function hideNetworkWarning() {
    const warning = document.getElementById('network-warning');
    if (warning) {
        warning.remove();
    }
}

/**
 * Firebase 모바일 설정
 */
function configureMobileFirebase() {
    // 모바일에서 Firebase Auth의 redirect 방식 사용
    if (isCordova && auth) {
        // InAppBrowser를 사용한 OAuth 리다이렉트 설정
        console.log('Configuring Firebase for mobile');
        
        // 앱 전용 설정이 필요한 경우 여기에 추가
    }
}

/**
 * 진동 피드백
 */
function vibrate(duration = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

/**
 * 터치 이벤트 최적화
 */
function optimizeTouchEvents() {
    // 터치 지연 제거
    document.addEventListener('touchstart', function() {}, { passive: true });
    
    // 기본 터치 동작 방지 (줌, 드래그 등)
    document.addEventListener('touchmove', function(e) {
        if (e.target.closest('#game-container')) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // 더블탭 줌 방지
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(e) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

// 터치 이벤트 최적화 적용
if ('ontouchstart' in window) {
    optimizeTouchEvents();
}

/**
 * 뷰포트 설정 동적 업데이트 (Safe Area 대응)
 */
function updateViewportForSafeArea() {
    // iOS Safe Area 대응
    if (device && device.platform === 'iOS') {
        const style = document.createElement('style');
        style.textContent = `
            body {
                padding-top: env(safe-area-inset-top);
                padding-bottom: env(safe-area-inset-bottom);
                padding-left: env(safe-area-inset-left);
                padding-right: env(safe-area-inset-right);
            }
            
            #header {
                padding-top: calc(15px + env(safe-area-inset-top));
            }
        `;
        document.head.appendChild(style);
    }
}

// Safe Area 설정 (Cordova 준비 시)
if (isCordova) {
    document.addEventListener('deviceready', updateViewportForSafeArea, false);
}

/**
 * 화면 방향 전환 처리
 */
window.addEventListener('orientationchange', function() {
    console.log('Orientation changed:', window.orientation);
    
    // Phaser 게임 리사이즈
    if (game) {
        game.scale.resize(window.innerWidth, window.innerHeight);
    }
});

/**
 * 앱 권한 확인 및 요청 (필요시)
 */
async function checkPermissions() {
    // 향후 필요한 권한 (예: 저장소, 알림 등) 확인 및 요청
    console.log('Checking app permissions...');
}

/**
 * 모바일 성능 최적화 설정
 */
function optimizeMobilePerformance() {
    // CSS 하드웨어 가속 강제
    const style = document.createElement('style');
    style.textContent = `
        #game-container canvas {
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
        }
    `;
    document.head.appendChild(style);
    
    // 메모리 경고 처리 (iOS)
    if (device && device.platform === 'iOS') {
        window.addEventListener('memorywarning', function() {
            console.warn('Memory warning received');
            // 필요시 캐시 정리, 리소스 해제 등
        });
    }
}

// 성능 최적화 적용
if (isCordova) {
    document.addEventListener('deviceready', optimizeMobilePerformance, false);
}

/**
 * 디버그 정보 표시 (개발 모드)
 */
function showDebugInfo() {
    const isDevelopment = true; // 배포 시 false로 변경
    
    if (isDevelopment && isCordova) {
        const debugPanel = document.createElement('div');
        debugPanel.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.8);
            color: #0f0;
            font-size: 10px;
            padding: 5px;
            font-family: monospace;
            z-index: 10000;
            max-height: 100px;
            overflow-y: auto;
        `;
        debugPanel.id = 'debug-panel';
        document.body.appendChild(debugPanel);
        
        // 콘솔 로그 캡처
        const originalLog = console.log;
        console.log = function(...args) {
            originalLog.apply(console, args);
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                debugPanel.innerHTML += args.join(' ') + '<br>';
                debugPanel.scrollTop = debugPanel.scrollHeight;
            }
        };
    }
}

// 디버그 정보 표시
if (isCordova) {
    document.addEventListener('deviceready', showDebugInfo, false);
}
