# Word Puzzle Master 🎮

Phaser.js 기반의 실시간 단어 퍼즐 웹게임

## 📖 프로젝트 개요

Word Puzzle Master는 N x N 그리드에서 단어를 찾는 인터랙티브한 웹 게임입니다. Phaser.js 게임 엔진을 사용하여 부드러운 애니메이션과 물리 효과를 제공하며, Firebase를 통한 실시간 리더보드와 Google 로그인을 지원합니다.

### 주요 기능

- 🎯 **단어 찾기 게임**: 12x12 그리드에서 10개의 숨겨진 단어 찾기
- 🏆 **실시간 리더보드**: Firebase Firestore를 활용한 글로벌 순위
- 🔐 **Google 로그인**: Firebase Authentication으로 간편한 소셜 로그인
- 🎨 **화려한 효과**: 파티클 이펙트 및 물리 기반 애니메이션
- 📈 **점수 시스템**: 단어당 100점 + 실시간 감소하는 점수 배수
- 📱 **모바일 최적화**: Cordova를 통한 네이티브 앱 빌드 지원

## 🛠 기술 스택

- **게임 엔진**: Phaser.js 3.70.0
- **백엔드**: Firebase (Authentication + Firestore)
- **모바일 패키징**: Apache Cordova
- **언어**: JavaScript (ES6+)
- **스타일**: CSS3 (Flexbox, Gradients, Animations)

## 📁 프로젝트 구조

```
Project-Word/
├── index.html                  # 메인 HTML 파일
├── styles.css                  # 스타일시트
├── config.xml                  # Cordova 설정
├── js/
│   ├── main.js                 # 게임 초기화 및 전역 상태 관리
│   ├── GameScene.js            # Phaser 게임 Scene (핵심 로직)
│   ├── WordGenerator.js        # 단어 그리드 생성 로직
│   ├── firebase-config.js      # Firebase 설정 및 인증
│   └── cordova-init.js         # Cordova 초기화 및 모바일 최적화
└── README.md                   # 프로젝트 문서
```

## 🚀 시작하기

### 1. 웹 브라우저에서 실행

#### 필수 준비사항

- 웹 브라우저 (Chrome, Firefox, Safari 등)
- 로컬 웹 서버 (Firebase는 HTTP/HTTPS에서만 동작)

#### 실행 방법

```bash
# 1. 프로젝트 클론 또는 다운로드
git clone https://github.com/yourusername/word-puzzle-master.git
cd word-puzzle-master

# 2. 간단한 HTTP 서버 실행 (Python 3 사용)
python -m http.server 8000

# 또는 Node.js http-server 사용
npx http-server -p 8000

# 3. 브라우저에서 열기
# http://localhost:8000
```

### 2. Firebase 설정

게임의 로그인 및 리더보드 기능을 사용하려면 Firebase 프로젝트가 필요합니다.

#### Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: word-puzzle-master)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

#### Firebase 앱 등록

1. Firebase 프로젝트 > 프로젝트 설정
2. "내 앱" > "웹 앱 추가" 클릭
3. 앱 닉네임 입력
4. Firebase SDK 구성 정보 복사

#### Firebase 설정 파일 수정

[js/firebase-config.js](js/firebase-config.js) 파일을 열고 `firebaseConfig` 객체를 업데이트하세요:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

#### Firebase Authentication 활성화

1. Firebase Console > Authentication > Sign-in method
2. "Google" 제공업체 활성화
3. 프로젝트 지원 이메일 설정
4. 저장

#### Firestore Database 생성

1. Firebase Console > Firestore Database
2. "데이터베이스 만들기" 클릭
3. 보안 규칙: "테스트 모드로 시작" 또는 아래 규칙 사용
4. 위치 선택 (예: asia-northeast3 - 서울)

**권장 Firestore 보안 규칙**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자 프로필
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 점수 기록
    match /scores/{scoreId} {
      allow read: if true;
      allow create: if request.auth != null && 
                       request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
```

### 3. Cordova로 모바일 앱 빌드

#### 필수 준비사항

- Node.js 및 npm
- Cordova CLI
- Android Studio (Android 빌드용)
- Xcode (iOS 빌드용, macOS만 해당)

#### Cordova 설치

```bash
npm install -g cordova
```

#### Cordova 프로젝트 초기화

```bash
# 프로젝트 디렉토리로 이동
cd Project-Word

# Cordova 프로젝트 초기화 (기존 파일 유지)
cordova platform add android
cordova platform add ios  # macOS에서만
```

#### 플러그인 설치

```bash
# config.xml에 정의된 플러그인 자동 설치
cordova prepare

# 또는 수동 설치
cordova plugin add cordova-plugin-whitelist
cordova plugin add cordova-plugin-statusbar
cordova plugin add cordova-plugin-device
cordova plugin add cordova-plugin-inappbrowser
```

#### Android 빌드

```bash
# 디버그 빌드
cordova build android

# 릴리즈 빌드 (서명 필요)
cordova build android --release

# 기기에서 실행
cordova run android

# 에뮬레이터에서 실행
cordova emulate android
```

#### iOS 빌드 (macOS만 해당)

```bash
# 빌드
cordova build ios

# 시뮬레이터에서 실행
cordova emulate ios

# 기기에서 실행 (Apple Developer 계정 필요)
cordova run ios --device
```

## 🎮 게임 플레이 방법

1. **시작**: 웹 브라우저에서 게임을 열면 자동으로 시작됩니다
2. **로그인** (선택): 우측 상단의 "Google Login" 버튼으로 로그인
3. **단어 찾기**: 
   - 그리드에서 마우스/터치로 클릭하고 드래그하여 단어 선택
   - 올바른 단어를 찾으면 점수 획득 및 배수 증가
4. **점수 배수**: 초당 0.01씩 감소 (빠르게 찾을수록 높은 점수!)
5. **목표**: 10개의 단어를 모두 찾아 최고 점수 달성

## 🏗 핵심 로직 설명

### 1. Phaser Scene 구조

[js/GameScene.js](js/GameScene.js)에서 Phaser의 Scene 시스템을 활용:

```javascript
class GameScene extends Phaser.Scene {
    preload() { /* 에셋 로드 */ }
    create() { /* 게임 초기화 */ }
    update(time, delta) { /* 매 프레임 업데이트 */ }
}
```

### 2. 점수 배수 실시간 감소

`update()` 메서드에서 매 프레임마다 점수 배수를 감소시킵니다:

```javascript
update(time, delta) {
    if (this.multiplier > 1.0) {
        const decayRate = 0.01; // 초당 0.01 감소
        const decayAmount = decayRate * (delta / 1000);
        this.multiplier = Math.max(1.0, this.multiplier - decayAmount);
    }
}
```

- `delta`: 이전 프레임과의 시간 차이 (밀리초)
- 초당 0.01 감소 = 100초에 1.0 감소
- 최소값 1.0으로 제한

### 3. Firebase 리더보드

[js/firebase-config.js](js/firebase-config.js)에서 Firestore를 사용한 리더보드:

```javascript
// 점수 저장
await db.collection('scores').add({
    userId: userId,
    userName: userName,
    score: Math.floor(score),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
});

// 리더보드 로드
const snapshot = await db.collection('users')
    .where('highScore', '>', 0)
    .orderBy('highScore', 'desc')
    .limit(10)
    .get();
```

### 4. Cordova 뷰포트 설정

[index.html](index.html)의 `<meta>` 태그에서 모바일 최적화:

```html
<meta name="viewport" 
      content="width=device-width, 
               initial-scale=1.0, 
               maximum-scale=1.0, 
               user-scalable=no">
```

- `user-scalable=no`: 핀치 줌 비활성화
- `maximum-scale=1.0`: 최대 확대 비율 제한
- 게임 그리드의 정확한 터치 입력을 위해 필수

## 📱 모바일 최적화 특징

### 뷰포트 설정
- Safe Area 대응 (iOS 노치)
- 반응형 레이아웃
- 터치 이벤트 최적화

### Cordova 플러그인
- **StatusBar**: 상태바 색상 커스터마이징
- **Device**: 디바이스 정보 접근
- **InAppBrowser**: 소셜 로그인 팝업
- **Vibration**: 햅틱 피드백

### 성능 최적화
- 하드웨어 가속 활성화
- 메모리 경고 처리
- 앱 일시정지/재개 이벤트 관리

## 🔧 커스터마이징 가이드

### 그리드 크기 변경

[js/GameScene.js](js/GameScene.js)에서:

```javascript
constructor() {
    super({ key: 'GameScene' });
    this.gridSize = 12; // 원하는 크기로 변경 (예: 10, 15)
    this.cellSize = 60; // 셀 크기 조정
}
```

### 단어 리스트 수정

[js/WordGenerator.js](js/WordGenerator.js)에서:

```javascript
getWordList() {
    return [
        'YOUR', 'CUSTOM', 'WORDS', 'HERE',
        // 원하는 단어 추가
    ];
}
```

### 점수 배수 감소율 조정

[js/GameScene.js](js/GameScene.js)에서:

```javascript
constructor() {
    super({ key: 'GameScene' });
    this.multiplierDecayRate = 0.01; // 값을 높이면 더 빠르게 감소
}
```

### UI 색상 변경

[styles.css](styles.css)에서:

```css
body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    /* 원하는 그라디언트로 변경 */
}
```

## 🐛 문제 해결

### Firebase 로그인이 작동하지 않음

1. Firebase Console에서 Google 로그인이 활성화되었는지 확인
2. `firebase-config.js`의 설정이 올바른지 확인
3. 브라우저 콘솔에서 오류 메시지 확인
4. 로컬에서 실행 시 `http://localhost` 사용 (file:// 프로토콜은 지원 안 됨)

### Cordova 빌드 오류

```bash
# 플랫폼 재설치
cordova platform remove android
cordova platform add android

# 플러그인 재설치
cordova plugin remove cordova-plugin-whitelist
cordova plugin add cordova-plugin-whitelist
```

### 게임이 로드되지 않음

1. 브라우저 콘솔에서 JavaScript 오류 확인
2. 모든 스크립트 파일이 올바른 순서로 로드되는지 확인
3. Phaser.js CDN이 접근 가능한지 확인

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 🤝 기여

Pull Request와 이슈는 언제나 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 연락처

프로젝트 링크: [https://github.com/yourusername/word-puzzle-master](https://github.com/yourusername/word-puzzle-master)

## 🙏 감사의 글

- [Phaser.js](https://phaser.io/) - 강력한 HTML5 게임 프레임워크
- [Firebase](https://firebase.google.com/) - 백엔드 및 인증 서비스
- [Apache Cordova](https://cordova.apache.org/) - 모바일 하이브리드 앱 프레임워크

---

**Happy Gaming! 🎮🎉**
