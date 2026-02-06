/**
 * ============================================
 * GameScene - PREMIUM WORD PUZZLE
 * Advanced Phaser.js implementation with particles,
 * physics animations, and smooth visual effects
 * ============================================
 */
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        
        // 게임 설정
        this.gridSize = 12;
        this.cellSize = 60;
        this.gridPadding = 12; // 간격 넘짐
        
        // 게임 상태
        this.wordGenerator = null;
        this.gridData = null;
        this.cellSprites = [];
        this.selectedCells = [];
        this.foundWords = new Set();
        
        // 타이머 시스템 (180초 = 3분)
        this.gameTime = 180;
        this.timeLeft = 180;
        this.gameStartTime = 0;
        
        // 점수 시스템 (Lerp 적용)
        this.score = 0;
        this.targetMultiplier = 1.0;
        this.currentMultiplier = 1.0;
        this.multiplierDecayRate = 0.01; // 초당 0.01 감소
        this.multiplierLerpSpeed = 0.1; // Lerp 속도
        
        // 선택 관련
        this.selectionLine = null;
        this.selectionGraphics = null;
        this.adjacentGuides = [];
        
        // 파티클 이펙트
        this.goldenParticles = null;
        this.sparkleParticles = null;
        this.comboGlowElement = null;
        
        // 오프셋 캐시
        this.offsetX = 0;
        this.offsetY = 0;
        
        // 보안 및 Anti-Cheat
        this.lastWordFoundTime = 0;
        this.minTimeBetweenWords = 300; // 최소 300ms 간격
        this.wordFoundTimestamps = []; // 단어 발견 타임스탬프 기록
        this.suspiciousActivity = false;
        
        // Score validation
        this.lastScoreUpdateTime = 0;
        this.scoreHistory = [];
    }

    preload() {
        // 파티클 텍스처 생성은 create에서 진행
    }

    create() {
        console.log('🎬 GameScene.create() 시작');
        console.log('📦 gameState 확인:', {
            hasDefaultWordList: !!gameState.defaultWordList,
            wordCount: gameState.defaultWordList ? gameState.defaultWordList.length : 0,
            words: gameState.defaultWordList
        });
        
        // 배경 설정 (어두운 네이비로 변경)
        this.cameras.main.setBackgroundColor('#1e293b');
        
        // CRITICAL: 데이터 동기화 보장
        // gameState에서 로드된 단어 리스트를 WordGenerator에 전달
        const wordListToUse = gameState.defaultWordList || DEFAULT_WORD_LIST;
        console.log('🎯 사용할 단어 리스트:', wordListToUse);
        
        // 단어 생성기 초기화 (데이터 전달)
        this.wordGenerator = new WordGenerator(this.gridSize, wordListToUse);
        
        // 그리드 생성 (방어 코드 포함)
        let generatedData;
        try {
            generatedData = this.wordGenerator.generateGrid();
            console.log('✅ 그리드 생성 완료:', generatedData.words);
        } catch (err) {
            console.error('❌ 그리드 생성 실패:', err);
            // 긴급 폴백: 빈 그리드 생성
            this.wordGenerator.createEmptyGrid();
            this.wordGenerator.words = wordListToUse;
            this.wordGenerator.fillEmptySpaces();
            generatedData = {
                grid: this.wordGenerator.grid,
                words: this.wordGenerator.words,
                placedWords: []
            };
            console.warn('⚠️ 폴백 그리드 사용');
        }
        
        this.gridData = generatedData.grid;
        
        // 데이터 검증
        if (!this.gridData || this.gridData.length === 0) {
            console.error('❌ 그리드 데이터 없음!');
            return;
        }
        
        // UI에 단어 리스트 표시
        updateWordListUI(generatedData.words);
        
        // 그리드 오프셋 계산 (캐시)
        this.offsetX = (this.cameras.main.width - (this.cellSize * this.gridSize)) / 2;
        this.offsetY = (this.cameras.main.height - (this.cellSize * this.gridSize)) / 2;
        
        // 그리드 그리기
        this.createGrid();
        
        // 선택 시스템 초기화
        this.initializeSelection();
        
        // 파티클 시스템 생성
        this.createAdvancedParticleSystem();
        
        // 콤보 글로우 요소 생성
        this.createComboGlowElement();
        
        // 게임 시작
        this.resetGameState();
        gameState.isGameActive = true;
        this.gameStartTime = Date.now();
        
        // Firebase 게임 세션 시작
        if (typeof startGameSession === 'function') {
            startGameSession(generatedData.words).catch(err => {
                console.error('게임 세션 시작 실패:', err);
            });
        }
        
        // 오늘 플레이 횟수 증가 (main.js 함수 호출)
        if (typeof incrementGamesTodayCount === 'function') {
            incrementGamesTodayCount();
        }
        
        // 터치 최적화 (멀티터치 방지)
        this.input.maxPointers = 1;
        
        // Smart Clear: 빈 공간 클릭 시 선택 해제
        this.input.on('pointerdown', (pointer) => {
            // 셀이 아닌 영역 클릭 시 선택 초기화
            if (!pointer.downElement || pointer.downElement === game.canvas) {
                if (this.selectedCells.length > 0) {
                    this.clearSelection();
                    this.triggerVibration('clear');
                }
            }
        });
    }

    /**
     * ==========================================
     * 그리드 생성 - 글래스모피즘 스타일
     * ==========================================
     */
    createGrid() {
        this.cellSprites = [];
        
        for (let row = 0; row < this.gridSize; row++) {
            this.cellSprites[row] = [];
            
            for (let col = 0; col < this.gridSize; col++) {
                const x = this.offsetX + col * this.cellSize + this.cellSize / 2;
                const y = this.offsetY + row * this.cellSize + this.cellSize / 2;
                
                // 셀 배경 (Light Glassmorphism 스타일)
                const cellBg = this.add.rectangle(
                    x, y, 
                    this.cellSize - 8, 
                    this.cellSize - 8, 
                    0xffffff, 
                    0.9
                );
                cellBg.setStrokeStyle(1, 0x3b82f6, 0.2);
                cellBg.setInteractive({ useHandCursor: true });
                
                // 텍스트 (Light Mode 스타일)
                const letter = this.gridData[row][col];
                const text = this.add.text(x, y, letter, {
                    fontSize: '24px',
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    color: '#1e293b',
                    fontStyle: '600',
                    stroke: '#ffffff',
                    strokeThickness: 1
                });
                text.setOrigin(0.5);
                text.setShadow(0, 1, 'rgba(0,0,0,0.1)', 2, false, true);
                
                // 셀 데이터 저장
                const cellData = {
                    bg: cellBg,
                    text: text,
                    row: row,
                    col: col,
                    letter: letter,
                    isSelected: false,
                    isFound: false,
                    originalX: x,
                    originalY: y
                };
                
                // 이벤트 핸들러 (탭-투-커넥트 최적화)
                cellBg.on('pointerdown', (pointer) => {
                    pointer.event.preventDefault();
                    this.onCellTap(cellData);
                });
                
                // 경로 미리보기 이벤트 핸들러
                cellBg.on('pointerover', () => {
                    this.showPathPreview(cellData);
                });
                
                cellBg.on('pointerout', () => {
                    this.hidePathPreview();
                });
                
                // 셀 등장 애니메이션
                cellBg.setScale(0);
                text.setAlpha(0);
                
                this.tweens.add({
                    targets: cellBg,
                    scale: 1,
                    duration: 400,
                    delay: (row + col) * 15,
                    ease: 'Back.easeOut'
                });
                
                this.tweens.add({
                    targets: text,
                    alpha: 1,
                    duration: 400,
                    delay: (row + col) * 15 + 100,
                    ease: 'Cubic.easeOut'
                });
                
                this.cellSprites[row][col] = cellData;
            }
        }
    }

    /**
     * 선택 시스템 초기화
     */
    initializeSelection() {
        this.selectionGraphics = this.add.graphics();
        this.selectionGraphics.setDepth(10);
    }

    /**
     * ==========================================
     * 셀 탭 핸들러 (완전 재구축)
     * 규칙 A: 인접(8방향) → 추가
     * 규칙 B: 원거리 유효 경로 → 자동 채우기
     * 규칙 C: 무효 경로 → 초기화
     * ==========================================
     */
    onCellTap(cellData) {
        if (!gameState.isGameActive || cellData.isFound) return;
        
        // 경로 미리보기 제거
        this.hidePathPreview();
        
        // 이미 선택된 셀을 다시 탭한 경우 - 해당 지점부터 제거
        const existingIndex = this.selectedCells.indexOf(cellData);
        if (existingIndex !== -1) {
            this.removeSelectionsFromIndex(existingIndex);
            this.clearAdjacentGuides();
            if (this.selectedCells.length > 0) {
                const lastCell = this.selectedCells[this.selectedCells.length - 1];
                this.showAdjacentGuides(lastCell);
            }
            this.updateDragFeedback();
            return;
        }
        
        // 첫 번째 선택
        if (this.selectedCells.length === 0) {
            this.selectedCells = [cellData];
            this.highlightCell(cellData, true);
            this.showAdjacentGuides(cellData);
            this.updateDragFeedback();
            return;
        }
        
        // 마지막 선택 셀 가져오기
        const lastCell = this.selectedCells[this.selectedCells.length - 1];
        
        // 규칙 A: 인접 블록 체크 (8방향)
        if (this.checkAdjacent(lastCell, cellData)) {
            // 기존 방식: 바로 추가
            this.selectedCells.push(cellData);
            this.highlightCell(cellData, true);
            this.drawSelectionLine();
            this.clearAdjacentGuides();
            this.showAdjacentGuides(cellData);
            this.updateDragFeedback();
            this.checkWordCompletion();
            return;
        }
        
        // 규칙 B: 원거리 경로 검증 (dx/dy 계산)
        const dx = cellData.col - lastCell.col;
        const dy = cellData.row - lastCell.row;
        const linePath = this.getLinePath(lastCell, cellData, dx, dy);
        
        if (linePath) {
            // 유효한 경로 (수평/수직/대각선)
            // 경로에 발견된 단어가 있는지 체크
            const hasBlockedCell = linePath.some(cell => cell.isFound);
            if (hasBlockedCell) {
                // 경로가 막혀 있으면 초기화
                this.clearSelection();
                this.selectedCells = [cellData];
                this.highlightCell(cellData, true);
                this.showAdjacentGuides(cellData);
                this.updateDragFeedback();
                return;
            }
            
            // 경로 자동 채우기 (순차 애니메이션)
            this.animatePathSelection(linePath);
            return;
        }
        
        // 규칙 C: 무효한 경로 → 선택 초기화하고 새 시작점으로
        this.clearSelection();
        this.selectedCells = [cellData];
        this.highlightCell(cellData, true);
        this.showAdjacentGuides(cellData);
        this.updateDragFeedback();
    }
    
    /**
     * ==========================================
     * 인접성 체크 (8방향)
     * ==========================================
     */
    checkAdjacent(lastCell, newCell) {
        const dx = Math.abs(newCell.col - lastCell.col);
        const dy = Math.abs(newCell.row - lastCell.row);
        // 상하좌우 + 대각선 (최대 거리 1)
        return dx <= 1 && dy <= 1 && (dx + dy) > 0;
    }
    
    /**
     * ==========================================
     * 경로 계산 (수학적 검증)
     * dx == 0 (수직) || dy == 0 (수평) || abs(dx) == abs(dy) (대각선)
     * ==========================================
     */
    getLinePath(startCell, endCell, dx, dy) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        // 유효성 검증: 수평, 수직, 또는 45도 대각선
        const isHorizontal = absDy === 0 && absDx > 0;
        const isVertical = absDx === 0 && absDy > 0;
        const isDiagonal = absDx === absDy && absDx > 0;
        
        if (!isHorizontal && !isVertical && !isDiagonal) {
            return null; // 무효한 경로
        }
        
        // 경로상의 모든 셀 수집
        const cells = [];
        const steps = Math.max(absDx, absDy);
        const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
        const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        
        // 시작점 다음부터 끝점까지 (시작점 제외)
        for (let i = 1; i <= steps; i++) {
            const row = startCell.row + (stepY * i);
            const col = startCell.col + (stepX * i);
            
            // 그리드 범위 체크
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
                cells.push(this.cellSprites[row][col]);
            } else {
                return null; // 범위 벗어남
            }
        }
        
        return cells;
    }
    
    /**
     * ==========================================
     * 선택 인덱스부터 제거
     * ==========================================
     */
    removeSelectionsFromIndex(index) {
        // 해당 인덱스부터 끝까지 하이라이트 제거
        for (let i = index; i < this.selectedCells.length; i++) {
            this.highlightCell(this.selectedCells[i], false);
        }
        // 배열 자르기
        this.selectedCells = this.selectedCells.slice(0, index);
        this.drawSelectionLine();
    }
    

    
    /**
     * ==========================================
     * 경로 자동 선택 애니메이션 (강화된 시각적 피드백)
     * ==========================================
     */
    animatePathSelection(pathCells) {
        if (!pathCells || pathCells.length === 0) return;
        
        // 순차적으로 셀 추가 (빛이 흐르는 효과)
        pathCells.forEach((cell, index) => {
            this.time.delayedCall(index * 25, () => {
                if (!gameState.isGameActive) return;
                
                // 셀 선택 추가
                this.selectedCells.push(cell);
                this.highlightCell(cell, true);
                
                // 빛 파티클 효과 (Sky Blue)
                const lightBurst = this.add.circle(
                    cell.originalX,
                    cell.originalY,
                    this.cellSize / 2.5,
                    0x3b82f6,
                    0.6
                );
                lightBurst.setDepth(16);
                lightBurst.setBlendMode(Phaser.BlendModes.ADD);
                
                this.tweens.add({
                    targets: lightBurst,
                    scale: { from: 0.3, to: 1.8 },
                    alpha: { from: 0.6, to: 0 },
                    duration: 350,
                    ease: 'Cubic.easeOut',
                    onComplete: () => lightBurst.destroy()
                });
                
                // 셀 강조 펄스
                this.tweens.add({
                    targets: [cell.bg, cell.text],
                    scaleX: { from: 1, to: 1.12 },
                    scaleY: { from: 1, to: 1.12 },
                    duration: 150,
                    yoyo: true,
                    ease: 'Sine.easeInOut'
                });
                
                // 마지막 셀 처리
                if (index === pathCells.length - 1) {
                    this.time.delayedCall(50, () => {
                        this.drawSelectionLine();
                        this.clearAdjacentGuides();
                        this.showAdjacentGuides(cell);
                        this.updateDragFeedback();
                        this.checkWordCompletion();
                    });
                }
            });
        });
    }
    
    /**
     * ==========================================
     * 경로 미리보기 표시
     * ==========================================
     */
    showPathPreview(targetCell) {
        // 선택된 셀이 없으면 미리보기 없음
        if (this.selectedCells.length === 0) {
            this.hidePathPreview();
            return;
        }
        
        // 타겟 셀이 이미 선택되어 있으면 미리보기 없음
        if (targetCell.isSelected || targetCell.isFound) {
            this.hidePathPreview();
            return;
        }
        
        const lastCell = this.selectedCells[this.selectedCells.length - 1];
        
        // 같은 셀이면 미리보기 없음
        if (lastCell.row === targetCell.row && lastCell.col === targetCell.col) {
            this.hidePathPreview();
            return;
        }
        
        // 인접 블록이면 미리보기 없음 (기존 가이드가 있음)
        if (this.checkAdjacent(lastCell, targetCell)) {
            this.hidePathPreview();
            return;
        }
        
        // 경로 계산
        const dx = targetCell.col - lastCell.col;
        const dy = targetCell.row - lastCell.row;
        const pathCells = this.getLinePath(lastCell, targetCell, dx, dy);
        
        // 유효하지 않은 경로
        if (!pathCells) {
            this.hidePathPreview();
            return;
        }
        
        // 경로에 이미 발견된 셀이 있는지 확인
        const hasFoundCell = pathCells.some(cell => cell.isFound);
        if (hasFoundCell) {
            this.hidePathPreview();
            return;
        }
        
        // 이전 미리보기 제거
        this.hidePathPreview();
        
        // 미리보기 그래픽 생성
        this.pathPreviewGraphics = this.add.graphics();
        this.pathPreviewGraphics.setDepth(8);
        
        // 은은한 Sky Blue 라인 (알파 0.3)
        this.pathPreviewGraphics.lineStyle(3, 0x3b82f6, 0.3);
        
        // 시작점
        this.pathPreviewGraphics.beginPath();
        this.pathPreviewGraphics.moveTo(lastCell.originalX, lastCell.originalY);
        
        // 경로의 각 셀을 연결
        pathCells.forEach(cell => {
            this.pathPreviewGraphics.lineTo(cell.originalX, cell.originalY);
        });
        
        // 타겟 셀까지 연결
        this.pathPreviewGraphics.lineTo(targetCell.originalX, targetCell.originalY);
        
        this.pathPreviewGraphics.strokePath();
        
        // 타겟 셀에 은은한 원 표시
        this.pathPreviewGraphics.lineStyle(2, 0x3b82f6, 0.4);
        this.pathPreviewGraphics.strokeCircle(
            targetCell.originalX,
            targetCell.originalY,
            this.cellSize / 2 - 2
        );
    }
    
    /**
     * ==========================================
     * 경로 미리보기 제거
     * ==========================================
     */
    hidePathPreview() {
        if (this.pathPreviewGraphics) {
            this.pathPreviewGraphics.destroy();
            this.pathPreviewGraphics = null;
        }
    }
    
    /**
     * ==========================================
     * 인접 블록 가이드 표시
     * ==========================================
     */
    showAdjacentGuides(centerCell) {
        this.clearAdjacentGuides();
        this.adjacentGuides = [];
        
        // 8방향 인접 블록 확인
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        directions.forEach(([dr, dc]) => {
            const row = centerCell.row + dr;
            const col = centerCell.col + dc;
            
            // 그리드 범위 체크
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
                const adjacentCell = this.cellSprites[row][col];
                
                // 이미 찾은 단어나 선택된 셀은 제외
                if (!adjacentCell.isFound && !this.selectedCells.includes(adjacentCell)) {
                    // 은은한 글로우 효과 (Sky Blue)
                    const glowCircle = this.add.circle(
                        adjacentCell.originalX,
                        adjacentCell.originalY,
                        this.cellSize / 2 - 5,
                        0x3b82f6,
                        0.12
                    );
                    glowCircle.setDepth(5);
                    
                    // 펄스 애니메이션
                    this.tweens.add({
                        targets: glowCircle,
                        alpha: { from: 0.12, to: 0.25 },
                        scale: { from: 0.9, to: 1.05 },
                        duration: 800,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                    
                    this.adjacentGuides.push(glowCircle);
                }
            }
        });
    }
    
    /**
     * ==========================================
     * 인접 가이드 제거
     * ==========================================
     */
    clearAdjacentGuides() {
        if (this.adjacentGuides) {
            this.adjacentGuides.forEach(guide => {
                this.tweens.killTweensOf(guide);
                guide.destroy();
            });
            this.adjacentGuides = [];
        }
    }
    
    /**
     * ==========================================
     * 단어 완성 실시간 체크
     * ==========================================
     */
    checkWordCompletion() {
        if (this.selectedCells.length < 2) return;
        
        const word = this.selectedCells.map(cell => {
            return this.wordGenerator.grid[cell.row][cell.col];
        }).join('');
        
        // 배치된 단어와 비교
        const matchedWord = this.wordGenerator.validateSelection(this.selectedCells);
        
        if (matchedWord && !this.foundWords.has(matchedWord)) {
            // 즉시 성공 처리
            this.handleWordFound(matchedWord);
        }
    }
    
    /**
     * ==========================================
     * 실시간 드래그 피드백 표시
     * ==========================================
     */
    updateDragFeedback() {
        if (this.selectedCells.length === 0) {
            // 피드백 숨김
            const dragFeedback = document.getElementById('drag-feedback');
            if (dragFeedback) {
                dragFeedback.style.opacity = '0';
            }
            return;
        }
        
        // 현재 선택된 글자들 추출
        const currentWord = this.selectedCells.map(cell => {
            const row = cell.row;
            const col = cell.col;
            return this.wordGenerator.grid[row][col];
        }).join('');
        
        // UI 업데이트
        const dragFeedback = document.getElementById('drag-feedback');
        const dragText = document.getElementById('drag-text');
        
        if (dragFeedback && dragText) {
            dragText.textContent = currentWord;
            dragFeedback.style.opacity = '1';
        }
    }

    /**
     * ==========================================
     * 단어 찾기 성공 처리 - Firebase 연동
     * ==========================================
     */
    handleWordFound(word) {
        const currentTime = Date.now();
        
        this.foundWords.add(word);
        
        // 선택된 셀들을 찾은 단어로 표시
        this.selectedCells.forEach(cellData => {
            cellData.isFound = true;
            this.markCellAsFound(cellData);
        });
        
        // 점수 계산 로직 (100 * Current Multiplier)
        const basePoints = 100 * this.currentMultiplier;
        const wordLengthBonus = (word.length - 2) * 50; // 글자 수 보너스 (2글자 기준)
        const totalPoints = Math.floor(basePoints + wordLengthBonus);
        
        this.score += totalPoints;
        this.targetMultiplier = Math.min(this.targetMultiplier + 0.2, 3.0);
        
        // Score Validation
        const timeSinceLastUpdate = currentTime - this.lastScoreUpdateTime;
        const expectedDecay = this.multiplierDecayRate * (timeSinceLastUpdate / 1000);
        const actualDecay = this.currentMultiplier - this.targetMultiplier;
        
        // 비정상적인 배수 변화 감지
        if (Math.abs(actualDecay - expectedDecay) > 0.5 && !this.suspiciousActivity) {
            console.warn('⚠️ 배수 감소율이 비정상적 - 검증 실패');
        }
        
        this.lastScoreUpdateTime = currentTime;
        this.scoreHistory.push({
            score: this.score,
            multiplier: this.currentMultiplier,
            timestamp: currentTime,
            word: word
        });
        
        // 전역 gameState 업데이트
        gameState.score = this.score;
        gameState.multiplier = this.currentMultiplier;
        gameState.foundWords = Array.from(this.foundWords);
        
        // Vibration API: 성공 진동
        this.triggerVibration('success');
        
        // 커스텀 이벤트 발생 (Footer 업데이트용)
        const wordFoundEvent = new CustomEvent('wordFound', {
            detail: {
                word: word,
                score: this.score,
                points: totalPoints,
                multiplier: this.currentMultiplier,
                foundCount: this.foundWords.size
            }
        });
        window.dispatchEvent(wordFoundEvent);
        
        console.log(`✅ 단어 발견: ${word} (+${totalPoints}점, x${this.currentMultiplier.toFixed(2)})`);
        
        // Firebase 게임 상태 업데이트 (서버사이드 연동)
        if (typeof updateGameState === 'function') {
            updateGameState(this.score, this.currentMultiplier, gameState.foundWords)
                .then(() => {
                    console.log('✅ Firebase 동기화 완료:', {
                        score: this.score,
                        multiplier: this.currentMultiplier,
                        foundWords: gameState.foundWords.length
                    });
                })
                .catch(err => {
                    console.error('❌ Firebase 동기화 실패:', err);
                });
        } else {
            console.warn('⚠️ updateGameState 함수 없음 - Firebase 연동 불가');
        }
        
        // 파티클 효과 (Object Pooling 최적화)
        this.selectedCells.forEach((cellData, index) => {
            // 파티클 방출 후 자동 제거 타이머
            this.time.delayedCall(index * 50, () => {
                if (this.goldenParticles && this.goldenParticles.active) {
                    this.goldenParticles.setPosition(cellData.originalX, cellData.originalY);
                    this.goldenParticles.emitParticle(8);
                }
            });
        });
        
        // 사운드 효과 (옵션)
        // this.sound.play('wordFound');
        
        // UI 업데이트
        updateScoreUI();
        markWordAsFound(word);
        
        // 선택 초기화
        this.clearSelection();
        this.clearAdjacentGuides();
        
        // 게임 완료 체크
        if (this.foundWords.size >= 10) {
            this.handleGameComplete();
        }
    }
    
    /**
     * ==========================================
     * 셀을 찾은 상태로 표시
     * ==========================================
     */
    markCellAsFound(cellData) {
        // 찾은 단어 색상으로 변경 (Sky Blue → Success Green)
        this.tweens.add({
            targets: cellData.bg,
            fillColor: { from: 0x3b82f6, to: 0x10b981 },
            alpha: 0.85,
            scale: 1.15,
            duration: 300,
            ease: 'Back.easeOut',
            yoyo: true,
            onComplete: () => {
                cellData.bg.setScale(1);
            }
        });
        
        this.tweens.add({
            targets: cellData.text,
            color: { from: 0xffffff, to: 0xffffff },
            scale: 1.2,
            duration: 300,
            ease: 'Back.easeOut',
            yoyo: true,
            onComplete: () => {
                cellData.text.setScale(1.05);
            }
        });
        
        cellData.bg.setStrokeStyle(2, 0x10b981, 1);
    }
    
    /**
     * ==========================================
     * 게임 완료 처리 - Firebase 연동
     * ==========================================
     */
    handleGameComplete() {
        gameState.isGameActive = false;
        
        const timeElapsed = (Date.now() - this.gameStartTime) / 1000;
        
        console.log('🎉 게임 완료! 모든 단어를 찾았습니다!');
        
        // Vibration API: 완료 진동
        this.triggerVibration('complete');
        
        // Firebase에 최종 기록 저장
        if (typeof endGameSession === 'function') {
            endGameSession(this.score, this.currentMultiplier, gameState.foundWords, timeElapsed).catch(err => {
                console.error('게임 세션 종료 실패:', err);
            });
        }
        
        // 화면 진동 효과
        this.cameras.main.shake(500, 0.01);
        
        // 승리 파티클 효과
        for (let i = 0; i < 30; i++) {
            this.time.delayedCall(i * 50, () => {
                const x = Phaser.Math.Between(0, this.cameras.main.width);
                const y = Phaser.Math.Between(0, this.cameras.main.height);
                this.goldenParticles.setPosition(x, y);
                this.goldenParticles.emitParticle(10);
            });
        }
        
        // 게임 종료 이벤트
        const gameEndEvent = new CustomEvent('gameEnd', {
            detail: {
                score: this.score,
                multiplier: this.currentMultiplier,
                foundWords: this.foundWords.size,
                timeElapsed: timeElapsed,
                reason: 'complete'
            }
        });
        window.dispatchEvent(gameEndEvent);
        
        // 게임 종료 처리 (main.js 함수 호출)
        this.time.delayedCall(1500, () => {
            if (typeof handleGameEnd === 'function') {
                handleGameEnd();
            }
        });
    }

    /**
     * ==========================================
     * 셀 하이라이트 - Squash & Stretch 적용
     * ==========================================
     */
    highlightCell(cellData, highlight) {
        if (cellData.isFound) return;
        
        cellData.isSelected = highlight;
        
        if (highlight) {
            // 선택 시 - Inner Glow 효과와 Squash & Stretch (Sky Blue)
            this.tweens.add({
                targets: cellData.bg,
                fillColor: { from: 0xffffff, to: 0x3b82f6 }, // Sky Blue
                alpha: { from: 0.9, to: 1.0 },
                scaleX: 1.08,
                scaleY: 0.95,
                duration: 120,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: cellData.bg,
                        scaleX: 1.05,
                        scaleY: 1.05,
                        duration: 180,
                        ease: 'Elastic.easeOut'
                    });
                }
            });
            
            // Inner Glow - 태두리 밝게
            cellData.bg.setStrokeStyle(2, 0xc7d2fe, 0.8);
            
            this.tweens.add({
                targets: cellData.text,
                color: { from: 0xcbd5e1, to: 0xffffff },
                scale: 1.2,
                duration: 180,
                ease: 'Back.easeOut'
            });
            
            // 강화된 파티클 효과
            this.sparkleParticles.setPosition(cellData.originalX, cellData.originalY);
            this.sparkleParticles.emitParticle(5);
            
        } else {
            // 선택 해제 시 - 부드러운 복귀 (Light Mode)
            this.tweens.add({
                targets: cellData.bg,
                fillColor: { from: 0x3b82f6, to: 0xffffff },
                alpha: { from: 1.0, to: 0.9 },
                scaleX: 1,
                scaleY: 1,
                duration: 220,
                ease: 'Cubic.easeOut'
            });
            
            cellData.bg.setStrokeStyle(1, 0x3b82f6, 0.2);
            
            this.tweens.add({
                targets: cellData.text,
                color: { from: 0xffffff, to: 0x1e293b },
                scale: 1,
                duration: 220,
                ease: 'Cubic.easeOut'
            });
        }
    }

    /**
     * ==========================================
     * 선택 라인 그리기 - Bezier Curve 부드러운 곡선
     * ==========================================
     */
    drawSelectionLine() {
        this.selectionGraphics.clear();
        
        if (this.selectedCells.length < 2) return;
        
        // 셀 위치 좌표 배열 생성
        const points = this.selectedCells.map(cell => 
            new Phaser.Math.Vector2(cell.originalX, cell.originalY)
        );
        
        // 2개 셀만 선택된 경우 직선으로
        if (points.length === 2) {
            const x1 = points[0].x;
            const y1 = points[0].y;
            const x2 = points[1].x;
            const y2 = points[1].y;
            
            // 외곽 글로우 (Sky Blue)
            this.selectionGraphics.lineStyle(10, 0x3b82f6, 0.15);
            this.selectionGraphics.lineBetween(x1, y1, x2, y2);
            
            // 메인 라인
            this.selectionGraphics.lineStyle(5, 0x3b82f6, 0.7);
            this.selectionGraphics.lineBetween(x1, y1, x2, y2);
            
            // 내부 하이라이트
            this.selectionGraphics.lineStyle(2, 0xffffff, 0.5);
            this.selectionGraphics.lineBetween(x1, y1, x2, y2);
            
            return;
        }
        
        // 3개 이상 셀이 선택된 경우 Spline Curve 사용
        try {
            const curve = new Phaser.Curves.Spline(points);
            
            // 곡선 점 생성 (부드러운 곡선을 위해 많은 점 사용)
            const curvePoints = curve.getPoints(points.length * 15);
            
            // 외곽 글로우 (두꺼운 반투명 Sky Blue)
            this.selectionGraphics.lineStyle(12, 0x3b82f6, 0.12);
            this.selectionGraphics.beginPath();
            this.selectionGraphics.moveTo(curvePoints[0].x, curvePoints[0].y);
            for (let i = 1; i < curvePoints.length; i++) {
                this.selectionGraphics.lineTo(curvePoints[i].x, curvePoints[i].y);
            }
            this.selectionGraphics.strokePath();
            
            // 중간 글로우
            this.selectionGraphics.lineStyle(8, 0x3b82f6, 0.25);
            this.selectionGraphics.beginPath();
            this.selectionGraphics.moveTo(curvePoints[0].x, curvePoints[0].y);
            for (let i = 1; i < curvePoints.length; i++) {
                this.selectionGraphics.lineTo(curvePoints[i].x, curvePoints[i].y);
            }
            this.selectionGraphics.strokePath();
            
            // 메인 라인 (선명한 색상)
            this.selectionGraphics.lineStyle(5, 0x3b82f6, 0.8);
            this.selectionGraphics.beginPath();
            this.selectionGraphics.moveTo(curvePoints[0].x, curvePoints[0].y);
            for (let i = 1; i < curvePoints.length; i++) {
                this.selectionGraphics.lineTo(curvePoints[i].x, curvePoints[i].y);
            }
            this.selectionGraphics.strokePath();
            
            // 내부 하이라이트 (얇은 흰색선)
            this.selectionGraphics.lineStyle(2, 0xffffff, 0.7);
            this.selectionGraphics.beginPath();
            this.selectionGraphics.moveTo(curvePoints[0].x, curvePoints[0].y);
            for (let i = 1; i < curvePoints.length; i++) {
                this.selectionGraphics.lineTo(curvePoints[i].x, curvePoints[i].y);
            }
            this.selectionGraphics.strokePath();
            
        } catch (error) {
            console.warn('Spline curve 생성 실패, 직선 사용:', error);
            
            // Fallback: 직선으로 연결
            for (let i = 0; i < this.selectedCells.length - 1; i++) {
                const cell1 = this.selectedCells[i];
                const cell2 = this.selectedCells[i + 1];
                
                const x1 = cell1.originalX;
                const y1 = cell1.originalY;
                const x2 = cell2.originalX;
                const y2 = cell2.originalY;
                
                this.selectionGraphics.lineStyle(10, 0x667eea, 0.2);
                this.selectionGraphics.lineBetween(x1, y1, x2, y2);
                
                this.selectionGraphics.lineStyle(5, 0x667eea, 0.8);
                this.selectionGraphics.lineBetween(x1, y1, x2, y2);
                
                this.selectionGraphics.lineStyle(2, 0xffffff, 0.6);
                this.selectionGraphics.lineBetween(x1, y1, x2, y2);
            }
        }
    }

    /**
     * 선택 클리어
     */
    clearSelection() {
        this.selectedCells.forEach(cell => {
            if (!cell.isFound) {
                this.highlightCell(cell, false);
            }
        });
        
        this.selectedCells = [];
        this.selectionGraphics.clear();
        this.clearAdjacentGuides();
        this.hidePathPreview(); // 경로 미리보기 제거
        
        // 피드백 숨김
        const dragFeedback = document.getElementById('drag-feedback');
        if (dragFeedback) {
            dragFeedback.style.opacity = '0';
        }
    }

    /**
     * ==========================================
     * 틀린 선택 시 흔들기 - 강화된 피드백
     * ==========================================
     */
    shakeSelectedCells() {
        // Vibration API: 실패 진동
        this.triggerVibration('error');
        
        this.selectedCells.forEach((cell, index) => {
            // 좌우 흔들림
            this.tweens.add({
                targets: [cell.bg, cell.text],
                x: cell.originalX + 8,
                duration: 60,
                delay: index * 20,
                yoyo: true,
                repeat: 2,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    cell.bg.x = cell.originalX;
                    cell.text.x = cell.originalX;
                }
            });
            
            // 색상 플래시 (빨간색)
            this.tweens.add({
                targets: cell.bg,
                fillColor: { from: 0x667eea, to: 0xef4444 },
                duration: 100,
                delay: index * 20,
                yoyo: true,
                repeat: 1,
                ease: 'Cubic.easeInOut'
            });
        });
        
        // 진동 효과 (Cordova에서 지원 시) - 제거 (함수 호출로 대체)
        // triggerVibration('실패')
    }

    /**
     * ==========================================
     * Vibration API 통합 (성공/실패/커스텀)
     * ==========================================
     */
    triggerVibration(type) {
        if (!navigator.vibrate) return;
        
        const patterns = {
            success: [30, 50, 30], // 성공: 짧은 2번 진동
            error: [100], // 실패: 긴 1번 진동
            clear: [20], // 커스텀: 미세한 진동
            complete: [50, 100, 50, 100, 200] // 완료: 복잡한 패턴
        };
        
        const pattern = patterns[type] || [50];
        navigator.vibrate(pattern);
    }
    
    /**
     * ==========================================
     * 고급 파티클 시스템 생성
     * ==========================================
     */
    createAdvancedParticleSystem() {
        // 황금 파티클 텍스처
        const goldGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        goldGraphics.fillStyle(0xfbbf24, 1);
        goldGraphics.fillCircle(8, 8, 8);
        goldGraphics.generateTexture('goldParticle', 16, 16);
        goldGraphics.destroy();
        
        // 스파클 파티클 텍스처
        const sparkleGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        sparkleGraphics.fillStyle(0xffffff, 1);
        sparkleGraphics.fillCircle(4, 4, 4);
        sparkleGraphics.generateTexture('sparkleParticle', 8, 8);
        sparkleGraphics.destroy();
        
        // 황금 파티클 이미터 (단어 발견 시)
        this.goldenParticles = this.add.particles(0, 0, 'goldParticle', {
            speed: { min: 150, max: 300 },
            angle: { min: -120, max: -60 },
            scale: { start: 1.2, end: 0 },
            alpha: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: 1200,
            gravityY: -100,
            emitting: false,
            tint: [0xfbbf24, 0xf59e0b, 0xfcd34d]
        });
        this.goldenParticles.setDepth(100);
        
        // 스파클 파티클 이미터 (셀 선택 시)
        this.sparkleParticles = this.add.particles(0, 0, 'sparkleParticle', {
            speed: { min: 50, max: 100 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 0.8, end: 0 },
            blendMode: 'ADD',
            lifespan: 400,
            quantity: 1,
            emitting: false
        });
        this.sparkleParticles.setDepth(50);
    }

    /**
     * ==========================================
     * 단어 발견 파티클 효과 - 리더보드로 날아감
     * ==========================================
     */
    showWordFoundEffect() {
        this.selectedCells.forEach((cell, index) => {
            // 황금 파티클 폭발
            this.goldenParticles.setPosition(cell.originalX, cell.originalY);
            this.goldenParticles.explode(15);
            
            // 리더보드 방향으로 날아가는 파티클 (좌측 상단)
            const targetX = 100;
            const targetY = 100;
            
            for (let i = 0; i < 5; i++) {
                const particle = this.add.circle(
                    cell.originalX, 
                    cell.originalY, 
                    6, 
                    0xfbbf24
                );
                particle.setAlpha(0.8);
                particle.setBlendMode(Phaser.BlendModes.ADD);
                particle.setDepth(101);
                
                this.tweens.add({
                    targets: particle,
                    x: targetX + Phaser.Math.Between(-50, 50),
                    y: targetY + Phaser.Math.Between(-50, 50),
                    alpha: 0,
                    scale: 0.3,
                    duration: 800 + index * 100,
                    delay: i * 50,
                    ease: 'Cubic.easeInOut',
                    onComplete: () => {
                        particle.destroy();
                    }
                });
            }
        });
    }

    /**
     * ==========================================
     * 콤보 글로우 요소 생성 및 관리
     * ==========================================
     */
    createComboGlowElement() {
        // HTML에 동적으로 추가
        if (!document.querySelector('.combo-glow')) {
            const glowDiv = document.createElement('div');
            glowDiv.className = 'combo-glow';
            document.body.appendChild(glowDiv);
            this.comboGlowElement = glowDiv;
        } else {
            this.comboGlowElement = document.querySelector('.combo-glow');
        }
    }

    updateComboGlow() {
        if (!this.comboGlowElement) return;
        
        // 배수가 2.0 이상일 때 네온 글로우 활성화
        if (this.targetMultiplier >= 2.0) {
            this.comboGlowElement.classList.add('active');
        } else {
            this.comboGlowElement.classList.remove('active');
        }
    }

    /**
     * ==========================================
     * 게임 상태 리셋
     * ==========================================
     */
    resetGameState() {
        this.score = 0;
        this.targetMultiplier = 1.0;
        this.currentMultiplier = 1.0;
        this.foundWords.clear();
        this.selectedCells = [];
        this.gameStartTime = Date.now();
        this.timeLeft = this.gameTime;
        
        gameState.score = 0;
        gameState.multiplier = 1.0;
        gameState.foundWords = [];
        gameState.timeLeft = this.gameTime;
        
        this.updateComboGlow();
        updateScoreUI();
    }
    
    /**
     * ==========================================
     * 게임 타임아웃 처리
     * ==========================================
     */
    handleGameTimeout() {
        gameState.isGameActive = false;
        
        const timeElapsed = this.gameTime;
        
        console.log('⏰ 시간 초과! 게임 종료');
        
        // Vibration API: 시간 초과 진동
        this.triggerVibration('error');
        
        // Firebase에 최종 기록 저장
        if (typeof endGameSession === 'function') {
            endGameSession(this.score, this.currentMultiplier, gameState.foundWords, timeElapsed).catch(err => {
                console.error('게임 세션 종료 실패:', err);
            });
        }
        
        // 게임 종료 이벤트
        const gameEndEvent = new CustomEvent('gameEnd', {
            detail: {
                score: this.score,
                multiplier: this.currentMultiplier,
                foundWords: this.foundWords.size,
                timeElapsed: timeElapsed,
                reason: 'timeout'
            }
        });
        window.dispatchEvent(gameEndEvent);
    }

    /**
     * ==========================================
     * 매 프레임 업데이트 - Lerp + 타이머
     * ==========================================
     */
    update(time, delta) {
        if (!gameState.isGameActive) return;
        
        // 타이머 감소
        const elapsedSeconds = (Date.now() - this.gameStartTime) / 1000;
        this.timeLeft = Math.max(0, this.gameTime - elapsedSeconds);
        gameState.timeLeft = this.timeLeft;
        
        // 시간 초과 시 게임 종료
        if (this.timeLeft <= 0 && gameState.isGameActive) {
            this.handleGameTimeout();
            return;
        }
        
        // 목표 배수 감소 (초당 0.01씩)
        if (this.targetMultiplier > 1.0) {
            const decayAmount = this.multiplierDecayRate * (delta / 1000);
            this.targetMultiplier = Math.max(1.0, this.targetMultiplier - decayAmount);
        }
        
        // 현재 배수를 목표 배수로 Lerp (부드럽게 변화)
        const lerpAmount = this.multiplierLerpSpeed * (delta / 16.67); // 60fps 기준 정규화
        this.currentMultiplier = Phaser.Math.Linear(
            this.currentMultiplier, 
            this.targetMultiplier, 
            lerpAmount
        );
        
        gameState.multiplier = this.currentMultiplier;
        
        // 콤보 글로우 업데이트
        this.updateComboGlow();
        
        // UI 업데이트 (0.1초마다)
        if (Math.floor(time / 100) !== Math.floor((time - delta) / 100)) {
            updateScoreUI();
        }
    }
}
