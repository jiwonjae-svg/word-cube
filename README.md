<div align="center">

# 🧩 Word Cube

**A 3D Rubik's-Style Word Puzzle Game**

[![Three.js](https://img.shields.io/badge/Three.js-v0.160.0-blue.svg)](https://threejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-v10.7.1-orange.svg)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web-blue.svg)](https://developer.mozilla.org/)

*Rotate. Align. Solve. A beautiful 3D word puzzle experience in your browser.*

[Features](#-features) • [Installation](#-installation) • [How to Play](#-how-to-play) • [Architecture](#-architecture) • [Building](#-building) • [Contributing](#-contributing)

---

</div>

## 🎯 What is Word Cube?

Word Cube is a **browser-based 3D word puzzle game** built with Three.js. Players manipulate a Rubik's-style cube by rotating rows and columns to align hidden words on each face.

Perfect for:
- 🧠 **Puzzle enthusiasts** who love spatial reasoning challenges
- 📝 **Word game fans** looking for a fresh twist
- 🎮 **Casual gamers** wanting a quick brain workout
- 🏆 **Competitive players** chasing leaderboard positions

## ✨ Features

### 🕹️ Core Gameplay
- **3D Rubik's Cube Mechanics**: Drag tiles to rotate rows/columns just like a real Rubik's cube
- **Word Finding**: Hidden words are placed on cube faces; rotate slices to align letters
- **Multiple Sizes**: Cube sizes from 3×3 to 10×10
- **Animated Scramble**: See the solved cube first, then watch it scramble before you play
- **Undo / Redo**: Full move history with Ctrl+Z / Ctrl+Y support

### 🏗️ Technical Features
- **Glassmorphism UI**: Modern frosted-glass design with smooth animations
- **Timer with Server Sync**: High-precision timer using server time to prevent manipulation
- **Leaderboard**: Daily (UTC) and all-time rankings per cube size
- **Session Persistence**: Crash recovery restores your game state automatically
- **Firebase + Offline**: Uses Firebase Auth & Firestore when configured; falls back to localStorage

### 👤 User System
- **Email & Google Auth**: Register with email/password or Google sign-in
- **Email Verification**: Firebase email verification for new accounts
- **Password Reset**: Self-service password reset via email
- **User Profiles**: Editable name, avatar, and country with flag display
- **Play History**: Track all past games with dates and times

### 🎨 User Experience
- **Responsive Design**: Fully playable on desktop and mobile
- **Background Cube Animations**: Decorative animated cubes on auth pages
- **Welcome Onboarding**: First-time user welcome modal with quick tips
- **Configurable Controls**: Rotation sensitivity & invert toggle
- **Mobile Panels**: Slide-up word list and ranking panels

## 📦 Installation

### Option 1: Quick Start (Recommended)

**Requirements:**
- [Node.js](https://nodejs.org/) v16 or higher

```powershell
# Clone the repository
git clone https://github.com/yourusername/word-cube.git
cd word-cube

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Static Hosting

Since this is a pure client-side app, you can serve it with any static file server:

```powershell
# Using Python
python -m http.server 3000

# Using npx
npx serve -l 3000
```

## 🚀 How to Play

### Getting Started
1. **Register / Login** — Create an account with email or sign in with Google
2. **Verify Email** — Check your inbox and verify your email address
3. **Select Cube Size** — Choose from 3×3 to 10×10
4. **Review** — See the solved cube with all words aligned
5. **Scramble** — Click "Scramble & Start!" to shuffle the cube

### Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate row/column | Left-click + drag on a tile | Touch + drag on a tile |
| Orbit view | Right-click + drag | Touch + drag on empty space |
| Zoom | Mouse scroll wheel | Pinch gesture |
| Undo | Ctrl + Z | Undo button |
| Redo | Ctrl + Y / Ctrl + Shift + Z | Redo button |
| Close modal | Escape | × button |

### Leaderboard
- **Daily Ranking**: Scores from today (UTC timezone), reset daily
- **All-Time Ranking**: Best scores across all time
- Rankings are per cube size (3×3, 4×4, etc.)

## 📁 Project Structure

```
Project-Word/
│
├── 📄 index.html                    # Single-page app (all pages & modals)
├── 📦 package.json                  # Dependencies & scripts
│
├── 📁 css/                          # Styles
│   └── style.css                    # Glassmorphism theme & responsive layout
│
├── 📁 js/                           # Application Logic
│   ├── app.js                       # Main entry point, routing & UI events
│   ├── auth.js                      # Firebase Auth + offline authentication
│   ├── cube.js                      # 3D cube rendering & interaction (Three.js)
│   ├── firebase-config.js           # Firebase/localStorage storage abstraction
│   ├── game.js                      # Game orchestration, scoring & persistence
│   ├── timer.js                     # High-precision timer with server sync
│   └── words.js                     # Word dictionary & puzzle generation
│
├── 📁 assets/                       # Static Assets
│   └── logo.png                     # Application logo
│
└── 📁 favicon/                      # Favicon & PWA Icons
    ├── favicon.ico                  # Classic favicon
    ├── favicon.svg                  # SVG favicon
    ├── favicon-96x96.png            # PNG favicon
    ├── apple-touch-icon.png         # iOS home screen icon
    ├── web-app-manifest-192x192.png # PWA icon (192px)
    ├── web-app-manifest-512x512.png # PWA icon (512px)
    └── site.webmanifest             # Web app manifest
```

## 🏗️ Architecture

Word Cube follows a **modular ES module architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│           UI Layer (index.html)         │  ← Pages, modals & DOM
├─────────────────────────────────────────┤
│        App Layer (app.js)               │  ← Routing, events & state
├─────────────────────────────────────────┤
│    Game Layer (game.js + timer.js)      │  ← Game logic & timing
├─────────────────────────────────────────┤
│    Render Layer (cube.js + Three.js)    │  ← 3D rendering & interaction
├─────────────────────────────────────────┤
│    Auth Layer (auth.js)                 │  ← Authentication & user mgmt
├─────────────────────────────────────────┤
│  Storage Layer (firebase-config.js)     │  ← Firebase / localStorage
├─────────────────────────────────────────┤
│    Data Layer (words.js)                │  ← Word dictionary & generation
└─────────────────────────────────────────┘
```

### Key Components

#### 🧊 WordCube (cube.js)
- **3D Rendering**: Three.js scene with perspective camera & lighting
- **Tile System**: Per-face tile meshes with canvas-based letter textures
- **Slice Rotation**: Animated row/column rotation with quaternion math
- **Orbit Controls**: Right-click drag to orbit with inertia
- **Hit Detection**: Raycasting for precise tile selection

#### 🎮 Game (game.js)
- **Puzzle Generation**: Places words on cube faces using words.js
- **Win Detection**: Continuous checking for aligned words
- **Score System**: Time-based scoring with server validation
- **Session Persistence**: Auto-save/restore via localStorage

#### 🔐 Auth (auth.js)
- **Multi-Provider**: Email/password + Google sign-in
- **Email Verification**: Firebase email verification flow
- **Friendly Errors**: Maps Firebase error codes to user-readable messages
- **Offline Fallback**: Full functionality without Firebase configuration

#### 📊 BackgroundCubes (cube.js)
- **Decorative Animation**: Floating mini cubes on auth pages
- **Slice Animation**: Random slice rotations with easing
- **Performance**: Efficient PlaneGeometry tiles, no core mesh

### Thread Safety & Performance

- **requestAnimationFrame**: Synchronized rendering loop
- **Object Pooling**: Shared geometry/materials across tiles
- **Texture Cache**: Canvas textures created once, reused
- **Responsive Resize**: Debounced camera & renderer updates

## ⚙️ Configuration

### Firebase Setup (Optional)

By default, the app runs in **offline mode** using localStorage. To enable Firebase:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Email/Password** and **Google** sign-in in Authentication
3. Create a **Firestore** database
4. Edit `js/firebase-config.js` and replace the empty config:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### Game Settings (In-App)

| Setting | Location | Description |
|---------|----------|-------------|
| **Rotation Sensitivity** | ⚙️ Settings modal | Drag sensitivity (1-10) |
| **Invert Rotation** | ⚙️ Settings modal | Reverse cube manipulation direction |
| **Click Feedback** | ⚙️ Settings modal | Visual feedback on tile interaction |

## 🔧 Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **3D Rendering** | Three.js v0.160.0 | WebGL cube rendering & interaction |
| **Authentication** | Firebase Auth v10.7.1 | Email, Google sign-in & verification |
| **Database** | Firebase Firestore | Scores, profiles & history |
| **Fonts** | Google Fonts (Inter) | Modern UI typography |
| **Build** | serve (npm) | Development server |
| **Module System** | ES Modules + importmap | Zero-build-step architecture |

## ⚡ Performance

- **Zero Build Step**: ES modules loaded directly via importmap CDN
- **Lazy Loading**: Firebase SDK loaded on-demand
- **Efficient Rendering**: Shared geometries & cached textures
- **Responsive**: Adaptive layout for all screen sizes
- **Offline-First**: Full functionality without network

## 🐛 Troubleshooting

### Cube Not Rendering
1. Ensure your browser supports WebGL 2.0
2. Try a Chromium-based browser (Chrome, Edge)
3. Check browser console for Three.js errors

### Login Issues
1. Verify Firebase configuration in `js/firebase-config.js`
2. Check that Email/Google providers are enabled in Firebase Console
3. For offline mode, data is stored in localStorage

### Performance Issues
1. Close other WebGL-heavy tabs
2. Reduce cube size (smaller cubes render faster)
3. Try lowering browser hardware acceleration settings

## 📜 License

This project is licensed under the **MIT License** — free for personal, educational, and commercial use.

## 🤝 Contributing

Contributions welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** with clear messages (`git commit -m 'Add amazing feature'`)
4. **Push** to your branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup
```powershell
git clone https://github.com/yourusername/word-cube.git
cd word-cube
npm install
npm run dev
```

## 🎯 Roadmap

- [ ] Multi-language support (English, Korean, Japanese)
- [ ] Custom word lists
- [ ] Multiplayer mode
- [ ] Replay system
- [ ] Achievements & badges
- [ ] Touch gesture improvements

## 🙏 Acknowledgments

Built with these amazing open-source projects:
- [Three.js](https://threejs.org/) — 3D rendering engine
- [Firebase](https://firebase.google.com/) — Backend services
- [Google Fonts](https://fonts.google.com/) — Inter typeface

---

<div align="center">

**Word Cube** — Rotate. Align. Solve. 🧩

Made with ❤️ for puzzle lovers everywhere

[⬆ Back to Top](#-word-cube)

</div>
