# Word Puzzle Master - 빠른 시작 가이드 ⚡

이 가이드는 프로젝트를 빠르게 실행하는 방법을 설명합니다.

## 1️⃣ 웹 브라우저에서 바로 실행 (가장 빠름)

```bash
# 프로젝트 폴더로 이동
cd Project-Word

# HTTP 서버 실행 (방법 1 - Python)
python -m http.server 8000

# 또는 (방법 2 - Node.js)
npx http-server -p 8000

# 또는 (방법 3 - npm script 사용)
npm start
```

브라우저에서 http://localhost:8000 접속

## 2️⃣ Firebase 설정 (로그인 및 리더보드 기능 사용 시)

### 단계별 설정

1. **Firebase 프로젝트 생성**
   - https://console.firebase.google.com/ 접속
   - "프로젝트 추가" 클릭
   - 프로젝트 이름 입력

2. **웹 앱 추가**
   - 프로젝트 설정 > 내 앱 > 웹 앱 추가
   - 앱 닉네임 입력
   - SDK 구성 정보 복사

3. **firebase-config.js 수정**
   
   `js/firebase-config.js` 파일을 열고:
   
   ```javascript
   const firebaseConfig = {
       apiKey: "붙여넣기",
       authDomain: "붙여넣기",
       projectId: "붙여넣기",
       storageBucket: "붙여넣기",
       messagingSenderId: "붙여넣기",
       appId: "붙여넣기"
   };
   ```

4. **Authentication 활성화**
   - Firebase Console > Authentication > Sign-in method
   - Google 제공업체 활성화

5. **Firestore 생성**
   - Firebase Console > Firestore Database
   - 데이터베이스 만들기 > 테스트 모드

완료! 🎉

## 3️⃣ 모바일 앱 빌드 (선택사항)

### Android 빌드

```bash
# Cordova 설치
npm install -g cordova

# Android 플랫폼 추가
cordova platform add android

# 빌드
cordova build android

# 기기에서 실행
cordova run android
```

### iOS 빌드 (macOS만 가능)

```bash
# iOS 플랫폼 추가
cordova platform add ios

# 빌드
cordova build ios

# 시뮬레이터에서 실행
cordova emulate ios
```

## 🎮 게임 플레이

1. 그리드에서 마우스/터치로 단어 선택
2. 10개의 단어를 찾으면 게임 종료
3. 점수 배수는 시간이 지날수록 감소 (빨리 찾을수록 유리!)
4. 로그인하면 리더보드에 점수 저장

## ❓ 문제 해결

### Q: 게임이 로드되지 않아요
A: HTTP 서버를 사용하고 있는지 확인하세요. file:// 프로토콜은 지원하지 않습니다.

### Q: Firebase 로그인이 안 돼요
A: 
- Firebase Console에서 Google 로그인이 활성화되어 있는지 확인
- firebase-config.js의 설정이 올바른지 확인
- http://localhost에서 실행 중인지 확인

### Q: Cordova 빌드가 실패해요
A:
```bash
# 플랫폼 재설치
cordova platform remove android
cordova platform add android

# 플러그인 재설치
cordova prepare
```

## 📚 더 자세한 정보

자세한 내용은 [README.md](README.md)를 참고하세요.

---

**즐거운 게임 되세요! 🎉**
