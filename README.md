# Word Cube - 3D Puzzle Game

A browser-based 3D word puzzle game built with **Three.js**. Rotate a Rubik's-style cube to align hidden words on its faces.

![Word Cube](https://img.shields.io/badge/Three.js-v0.160.0-blue) ![Firebase](https://img.shields.io/badge/Firebase-v10.7.1-orange) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **3D Rubik's Cube Mechanics** — Drag tiles to rotate rows/columns just like a real Rubik's cube
- **Word Finding** — Hidden words are placed on cube faces; rotate slices to align letters
- **Multiple Sizes** — Cube sizes from 3×3 to 10×10
- **Animated Scramble** — See the solved cube first, then watch it scramble before you play
- **Glassmorphism UI** — Modern frosted-glass design with smooth animations
- **Timer with Server Sync** — High-precision timer using server time to prevent manipulation
- **Leaderboard** — Compete for the fastest solve times
- **User Profiles** — Register, login, edit your profile with country flags
- **Play History** — Track all your past games
- **Session Persistence** — Crash recovery restores your game state automatically
- **Firebase + Offline** — Uses Firebase Auth & Firestore when configured; falls back to localStorage for fully offline play

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)

### Installation

```bash
git clone <repository-url>
cd Project-Word
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
Project-Word/
├── index.html              # Single-page app (login, register, game)
├── css/
│   └── style.css           # Glassmorphism theme & all component styles
├── js/
│   ├── app.js              # Main entry point, routing, UI event handling
│   ├── auth.js             # Authentication (Firebase Auth + offline mode)
│   ├── cube.js             # 3D cube rendering & interaction (Three.js)
│   ├── firebase-config.js  # Firebase/localStorage storage abstraction
│   ├── game.js             # Game orchestration, scoring, session persistence
│   ├── timer.js            # High-precision timer with server sync
│   └── words.js            # Word dictionary & puzzle generation
├── package.json
├── .gitignore
└── README.md
```

## How to Play

1. **Register / Login** — Create an account or use offline mode
2. **Select Cube Size** — Choose from 3×3 to 10×10
3. **Review** — See the solved cube with all words aligned
4. **Scramble** — Click "Scramble & Start!" to shuffle the cube and begin the timer
5. **Rotate** — Left-click and drag on a tile to rotate that row or column
6. **Orbit** — Right-click / drag on empty space to view different faces
7. **Find Words** — Align letters to form the target words shown in the right panel
8. **Win** — Find all words to complete the puzzle!

## Controls

| Action | Input |
|--------|-------|
| Rotate row/column | Left-click + drag on a tile |
| Orbit (view rotation) | Right-click + drag / drag on empty space |
| Zoom | Mouse scroll wheel |

## Firebase Configuration

By default, the app runs in **offline mode** using localStorage. To enable Firebase:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Email/Password** and **Google** sign-in in Authentication
3. Create a **Firestore** database
4. Edit `js/firebase-config.js` and replace the empty config with your Firebase credentials:

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

## Tech Stack

- **Three.js** v0.160.0 — 3D rendering via ES module importmap
- **Firebase** v10.7.1 — Authentication & Firestore (optional)
- **Vanilla JS** — No framework dependencies, pure ES modules
- **CSS3** — Glassmorphism with `backdrop-filter: blur()`, CSS variables, responsive design

## License

MIT
