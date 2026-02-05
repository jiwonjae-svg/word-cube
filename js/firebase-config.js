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
 * Firebase 초기화
 */
function initializeFirebase() {
    try {
        // Firebase 앱 초기화
        app = firebase.initializeApp(firebaseConfig);
        
        // 서비스 초기화
        auth = firebase.auth();
        db = firebase.firestore();
        
        console.log('Firebase initialized successfully');
        
        // 인증 상태 변경 리스너
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('User signed in:', user.displayName);
                updateUIForUser(user);
                loadLeaderboard();
            } else {
                console.log('User signed out');
                updateUIForGuest();
            }
        });
        
        // 초기 리더보드 로드
        loadLeaderboard();
        
    } catch (error) {
        console.error('Firebase initialization error:', error);
        alert('Firebase 초기화 실패. 설정을 확인해주세요.');
    }
}

/**
 * 구글 로그인
 */
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // 팝업을 사용한 로그인 (모바일에서는 redirect 사용 가능)
        const result = await auth.signInWithPopup(provider);
        
        const user = result.user;
        console.log('Google sign in successful:', user.displayName);
        
        // 사용자 정보를 Firestore에 저장/업데이트
        await updateUserProfile(user);
        
        return user;
        
    } catch (error) {
        console.error('Google sign in error:', error);
        
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('로그인 팝업이 닫혔습니다.');
        } else if (error.code === 'auth/popup-blocked') {
            throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
        } else {
            throw new Error('로그인에 실패했습니다.');
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
