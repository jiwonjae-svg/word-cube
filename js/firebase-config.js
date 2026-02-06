/**
 * Firebase Configuration and Authentication
 * Word Puzzle Master - Firebase 초기화 및 인증 관리
 * 
 * 설정 방법:
 * 1. Firebase Console (https://console.firebase.google.com/)에서 프로젝트 생성
 * 2. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가
 * 3. Firebase SDK 구성 정보를 아래 firebaseConfig에 복사
 * 4. Authentication > Sign-in method에서 Google 로그인 활성화
 * 5. Firestore Database 생성 및 규칙 설정
 */

// Firebase 설정 객체 (여기에 실제 Firebase 프로젝트 정보를 입력하세요)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};

// Firebase 앱 및 서비스 인스턴스
let app;
let auth;
let db;

/**
 * ============================================
 * Firebase 초기화 - 인증 흐름 제어
 * ============================================
 */
function initializeFirebase() {
    try {
        // Firebase 앱 초기화
        app = firebase.initializeApp(firebaseConfig);
        
        // 서비스 초기화
        auth = firebase.auth();
        db = firebase.firestore();
        
        console.log('🔥 Firebase initialized successfully');
        
        // 인증 상태 변경 리스너 (핵심!)
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('✅ User signed in:', user.displayName || user.email);
                handleAuthenticatedUser(user);
            } else {
                console.log('❌ User signed out');
                handleUnauthenticatedUser();
            }
        });
        
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        showNotification('Firebase 초기화 실패. 설정을 확인해주세요.', 'error');
    }
}

/**
 * ============================================
 * 인증된 사용자 처리
 * ============================================
 */
async function handleAuthenticatedUser(user) {
    // 사용자 프로필 업데이트
    await updateUserProfile(user);
    
    // UI 업데이트
    updateUIForUser(user);
    
    // 로그인 화면 숨기고 게임 화면 표시
    showGameScreen();
    
    // 리더보드 로드
    loadLeaderboard();
}

/**
 * ============================================
 * 미인증 사용자 처리
 * ============================================
 */
function handleUnauthenticatedUser() {
    // UI 업데이트
    updateUIForGuest();
    
    // 게임 화면 숨기고 로그인 화면 표시
    showLoginScreen();
}

/**
 * ============================================
 * 구글 로그인 (GoogleAuthProvider)
 * ============================================
 */
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // 추가 스코프 (선택적)
        provider.addScope('profile');
        provider.addScope('email');
        
        // 팝업을 사용한 로그인 (모바일에서는 redirect 사용 가능)
        const result = await auth.signInWithPopup(provider);
        
        const user = result.user;
        console.log('🎉 Google sign in successful:', user.displayName);
        
        return user;
        
    } catch (error) {
        console.error('❌ Google sign in error:', error);
        
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('로그인 팝업이 닫혔습니다.');
        } else if (error.code === 'auth/popup-blocked') {
            throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
        } else if (error.code === 'auth/cancelled-popup-request') {
            throw new Error('로그인 요청이 취소되었습니다.');
        } else {
            throw new Error('로그인에 실패했습니다: ' + error.message);
        }
    }
}

/**
 * ============================================
 * 이메일/비밀번호 회원가입
 * ============================================
 */
async function signUpWithEmail(email, password, displayName) {
    try {
        // 유효성 검사
        if (!email || !password || password.length < 6) {
            throw new Error('이메일과 비밀번호(6자 이상)를 입력해주세요.');
        }
        
        // 계정 생성
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        
        // 프로필 업데이트 (displayName 설정)
        if (displayName) {
            await user.updateProfile({
                displayName: displayName
            });
        }
        
        console.log('🎉 Email sign up successful:', email);
        
        return user;
        
    } catch (error) {
        console.error('❌ Email sign up error:', error);
        
        if (error.code === 'auth/email-already-in-use') {
            throw new Error('이미 사용 중인 이메일입니다.');
        } else if (error.code === 'auth/invalid-email') {
            throw new Error('유효하지 않은 이메일 형식입니다.');
        } else if (error.code === 'auth/weak-password') {
            throw new Error('비밀번호가 너무 약합니다. (최소 6자)');
        } else {
            throw new Error('회원가입 실패: ' + error.message);
        }
    }
}

/**
 * ============================================
 * 이메일/비밀번호 로그인
 * ============================================
 */
async function signInWithEmail(email, password) {
    try {
        // 유효성 검사
        if (!email || !password) {
            throw new Error('이메일과 비밀번호를 입력해주세요.');
        }
        
        // 로그인
        const result = await auth.signInWithEmailAndPassword(email, password);
        const user = result.user;
        
        console.log('🎉 Email sign in successful:', email);
        
        return user;
        
    } catch (error) {
        console.error('❌ Email sign in error:', error);
        
        if (error.code === 'auth/user-not-found') {
            throw new Error('존재하지 않는 계정입니다.');
        } else if (error.code === 'auth/wrong-password') {
            throw new Error('비밀번호가 틀렸습니다.');
        } else if (error.code === 'auth/invalid-email') {
            throw new Error('유효하지 않은 이메일 형식입니다.');
        } else if (error.code === 'auth/user-disabled') {
            throw new Error('비활성화된 계정입니다.');
        } else {
            throw new Error('로그인 실패: ' + error.message);
        }
    }
}

/**
 * ============================================
 * 비밀번호 재설정 이메일 발송
 * ============================================
 */
async function sendPasswordResetEmail(email) {
    try {
        if (!email) {
            throw new Error('이메일을 입력해주세요.');
        }
        
        await auth.sendPasswordResetEmail(email);
        console.log('📧 Password reset email sent to:', email);
        
        return true;
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        
        if (error.code === 'auth/user-not-found') {
            throw new Error('존재하지 않는 계정입니다.');
        } else if (error.code === 'auth/invalid-email') {
            throw new Error('유효하지 않은 이메일 형식입니다.');
        } else {
            throw new Error('비밀번호 재설정 실패: ' + error.message);
        }
    }
}

/**
 * 로그아웃
 */
async function signOut() {
    try {
        await auth.signOut();
        console.log('User signed out successfully');
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

/**
 * 사용자 프로필 업데이트 (Firestore)
 */
async function updateUserProfile(user) {
    if (!user) return;
    
    try {
        const userRef = db.collection('users').doc(user.uid);
        
        await userRef.set({
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log('User profile updated');
        
    } catch (error) {
        console.error('Error updating user profile:', error);
    }
}

/**
 * 점수 저장 (Firestore)
 */
async function saveScore(userId, userName, score) {
    if (!userId || !userName) {
        console.warn('Cannot save score: user not logged in');
        return;
    }
    
    try {
        const scoreData = {
            userId: userId,
            userName: userName,
            score: Math.floor(score),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toISOString()
        };
        
        // scores 컬렉션에 추가
        await db.collection('scores').add(scoreData);
        
        // 사용자의 최고 점수 업데이트
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists || !userDoc.data().highScore || userDoc.data().highScore < score) {
            await userRef.update({
                highScore: Math.floor(score),
                highScoreDate: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        console.log('Score saved successfully:', score);
        
        // 리더보드 갱신
        await loadLeaderboard();
        
    } catch (error) {
        console.error('Error saving score:', error);
    }
}

/**
 * 리더보드 로드 (Firestore)
 */
async function loadLeaderboard(limit = 10) {
    try {
        // 최고 점수 기준으로 상위 사용자 조회
        const snapshot = await db.collection('users')
            .where('highScore', '>', 0)
            .orderBy('highScore', 'desc')
            .limit(limit)
            .get();
        
        const leaderboard = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            leaderboard.push({
                userId: doc.id,
                name: data.displayName || 'Anonymous',
                score: data.highScore || 0,
                date: data.highScoreDate
            });
        });
        
        console.log('Leaderboard loaded:', leaderboard.length, 'entries');
        
        // UI 업데이트
        updateLeaderboardUI(leaderboard);
        
        return leaderboard;
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        return [];
    }
}

/**
 * 실시간 리더보드 구독 (선택적)
 */
function subscribeToLeaderboard(callback) {
    return db.collection('users')
        .where('highScore', '>', 0)
        .orderBy('highScore', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            const leaderboard = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                leaderboard.push({
                    userId: doc.id,
                    name: data.displayName || 'Anonymous',
                    score: data.highScore || 0,
                    date: data.highScoreDate
                });
            });
            
            callback(leaderboard);
        }, (error) => {
            console.error('Leaderboard subscription error:', error);
        });
}

/**
 * 현재 로그인된 사용자 가져오기
 */
function getCurrentUser() {
    return auth.currentUser;
}

/**
 * 사용자 통계 조회
 */
async function getUserStats(userId) {
    try {
        const scoresSnapshot = await db.collection('scores')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const scores = [];
        let totalGames = 0;
        let totalScore = 0;
        
        scoresSnapshot.forEach(doc => {
            const data = doc.data();
            scores.push(data.score);
            totalScore += data.score;
            totalGames++;
        });
        
        const avgScore = totalGames > 0 ? totalScore / totalGames : 0;
        const highScore = Math.max(...scores, 0);
        
        return {
            totalGames,
            avgScore,
            highScore,
            recentScores: scores.slice(0, 10)
        };
        
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

/**
 * ============================================
 * 게임 상태 관리 - Firebase Centralization
 * ============================================
 */

// 현재 게임 세션 ID
let currentGameSessionId = null;
let leaderboardUnsubscribe = null;

/**
 * 게임 세션 시작
 */
async function startGameSession(wordList) {
    try {
        const user = getCurrentUser();
        if (!user) {
            console.warn('게스트 모드로 게임 시작');
            currentGameSessionId = `guest_${Date.now()}`;
            return currentGameSessionId;
        }

        const sessionData = {
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            startTime: firebase.firestore.FieldValue.serverTimestamp(),
            wordList: wordList,
            status: 'playing',
            currentScore: 0,
            currentMultiplier: 1.0,
            foundWords: []
        };

        const docRef = await db.collection('gameSessions').add(sessionData);
        currentGameSessionId = docRef.id;
        console.log('🎮 게임 세션 시작:', currentGameSessionId);
        return currentGameSessionId;

    } catch (error) {
        console.error('게임 세션 시작 실패:', error);
        currentGameSessionId = `fallback_${Date.now()}`;
        return currentGameSessionId;
    }
}

/**
 * 게임 상태 실시간 업데이트 (단어 찾았을 때)
 */
async function updateGameState(score, multiplier, foundWords) {
    if (!currentGameSessionId || currentGameSessionId.startsWith('guest') || currentGameSessionId.startsWith('fallback')) {
        console.log('로컬 세션 - 서버 업데이트 스킵');
        return;
    }

    try {
        await db.collection('gameSessions').doc(currentGameSessionId).update({
            currentScore: score,
            currentMultiplier: multiplier,
            foundWords: foundWords,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ 게임 상태 업데이트:', { score, multiplier, foundWords: foundWords.length });
    } catch (error) {
        console.error('게임 상태 업데이트 실패:', error);
    }
}

/**
 * 게임 세션 종료 및 점수 저장
 */
async function endGameSession(finalScore, finalMultiplier, foundWords, timeElapsed) {
    try {
        const user = getCurrentUser();
        
        // 게스트 모드면 로컬 저장만
        if (!user) {
            const localHighScore = parseInt(localStorage.getItem('highScore') || '0');
            if (finalScore > localHighScore) {
                localStorage.setItem('highScore', finalScore.toString());
            }
            console.log('게스트 모드 - 로컬에만 저장');
            return;
        }

        // 세션 종료 처리
        if (currentGameSessionId && !currentGameSessionId.startsWith('guest') && !currentGameSessionId.startsWith('fallback')) {
            await db.collection('gameSessions').doc(currentGameSessionId).update({
                status: 'completed',
                endTime: firebase.firestore.FieldValue.serverTimestamp(),
                finalScore: finalScore,
                finalMultiplier: finalMultiplier,
                timeElapsed: timeElapsed
            });
        }

        // 점수 기록 저장
        const scoreData = {
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            userPhoto: user.photoURL || '',
            score: finalScore,
            multiplier: finalMultiplier,
            foundWords: foundWords,
            wordCount: foundWords.length,
            timeElapsed: timeElapsed,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toISOString().split('T')[0]
        };

        await db.collection('scores').add(scoreData);
        console.log('💾 점수 저장 완료:', finalScore);

        // 사용자 최고 기록 업데이트
        const userRef = db.collection('users').doc(user.uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        
        if (!userData || !userData.highScore || finalScore > userData.highScore) {
            await userRef.update({
                highScore: finalScore,
                lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        currentGameSessionId = null;

    } catch (error) {
        console.error('게임 세션 종료 실패:', error);
    }
}

/**
 * 실시간 리더보드 구독
 */
function subscribeToLeaderboard(callback) {
    // 기존 구독 해제
    if (leaderboardUnsubscribe) {
        leaderboardUnsubscribe();
    }

    try {
        // 오늘 날짜
        const today = new Date().toISOString().split('T')[0];

        // Firestore 실시간 리스너
        leaderboardUnsubscribe = db.collection('scores')
            .where('date', '==', today)
            .orderBy('score', 'desc')
            .limit(10)
            .onSnapshot((snapshot) => {
                const leaderboard = [];
                snapshot.forEach(doc => {
                    leaderboard.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                console.log('📊 리더보드 업데이트:', leaderboard.length, '명');
                callback(leaderboard);
            }, (error) => {
                console.error('리더보드 구독 실패:', error);
            });

    } catch (error) {
        console.error('리더보드 구독 설정 실패:', error);
    }
}

/**
 * 리더보드 구독 해제
 */
function unsubscribeFromLeaderboard() {
    if (leaderboardUnsubscribe) {
        leaderboardUnsubscribe();
        leaderboardUnsubscribe = null;
        console.log('리더보드 구독 해제');
    }
}

/**
 * 오늘의 단어 목록 가져오기
 */
async function getTodaysWords() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const wordListDoc = await db.collection('dailyWords').doc(today).get();

        if (wordListDoc.exists) {
            const data = wordListDoc.data();
            console.log('📝 오늘의 단어 목록 로드:', data.words);
            return data.words;
        } else {
            console.log('오늘의 단어 목록이 없습니다. 기본 목록 사용');
            return null; // 기본 단어 목록 사용
        }

    } catch (error) {
        console.error('단어 목록 로드 실패:', error);
        return null;
    }
}

/**
 * 오늘의 단어 목록 설정 (관리자용)
 */
async function setTodaysWords(words) {
    try {
        const user = getCurrentUser();
        if (!user) {
            throw new Error('로그인 필요');
        }

        const today = new Date().toISOString().split('T')[0];
        await db.collection('dailyWords').doc(today).set({
            words: words,
            createdBy: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ 오늘의 단어 목록 설정 완료');
        return true;

    } catch (error) {
        console.error('단어 목록 설정 실패:', error);
        return false;
    }
}

// Firestore 보안 규칙 예시 (Firebase Console에서 설정)
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자 프로필 규칙
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 점수 규칙
    match /scores/{scoreId} {
      allow read: if true;
      allow create: if request.auth != null && 
                       request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
*/
/**
 * ============================================
 * UI 업데이트 함수들
 * ============================================
 */

/**
 * 인증된 사용자용 UI 업데이트
 */
function updateUIForUser(user) {
    // 프로필 카드 업데이트 (main.js 함수 호출)
    if (typeof updateProfileCard === 'function') {
        updateProfileCard(user);
    }
    
    // 헤더 사용자 정보
    const usernameSpan = document.getElementById('username');
    if (usernameSpan) {
        usernameSpan.textContent = user.displayName || user.email.split('@')[0];
    }
    
    console.log('✅ UI updated for user:', user.displayName || user.email);
}

/**
 * 게스트용 UI 업데이트
 */
function updateUIForGuest() {
    const usernameSpan = document.getElementById('username');
    if (usernameSpan) {
        usernameSpan.textContent = 'Guest';
    }
    
    console.log('👤 UI updated for guest');
}