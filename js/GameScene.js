/**
 * GameScene - 메인 게임 Scene
 * 단어 퍼즐 게임의 핵심 로직과 렌더링을 담당
 */
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        
        // 게임 설정
        this.gridSize = 12;
        this.cellSize = 60;
        this.gridPadding = 10;
        
        // 게임 상태
        this.wordGenerator = null;
        this.gridData = null;
        this.cellSprites = [];
        this.selectedCells = [];
        this.foundWords = new Set();
        
        // 점수 시스템
        this.score = 0;
        this.multiplier = 1.0;
        this.multiplierDecayRate = 0.01; // 초당 0.01 감소
        
        // 선택 관련
        this.isSelecting = false;
        this.selectionLine = null;
        this.selectionGraphics = null;
        
        // 파티클 이펙트
        this.particles = null;
    }

    preload() {
        // 필요한 에셋이 있다면 여기서 로드
        // 예: this.load.image('particle', 'assets/particle.png');
    }

    create() {
        // 배경 설정
        this.cameras.main.setBackgroundColor('#ffffff');
        
        // 단어 생성기 초기화
        this.wordGenerator = new WordGenerator(this.gridSize);
        const generatedData = this.wordGenerator.generateGrid();
        this.gridData = generatedData.grid;
        
        // UI에 단어 리스트 표시
        updateWordListUI(generatedData.words);
        
        // 그리드 그리기
        this.createGrid();
        
        // 선택 시스템 초기화
        this.initializeSelection();
        
        // 파티클 시스템 생성 (간단한 버전)
        this.createParticleSystem();
        
        // 게임 시작
        this.resetGameState();
        gameState.isGameActive = true;
    }

    /**
     * 그리드 생성 및 렌더링
     */
    createGrid() {
        const offsetX = (this.cameras.main.width - (this.cellSize * this.gridSize)) / 2;
        const offsetY = (this.cameras.main.height - (this.cellSize * this.gridSize)) / 2;
        
        this.cellSprites = [];
        
        for (let row = 0; row < this.gridSize; row++) {
            this.cellSprites[row] = [];
            
            for (let col = 0; col < this.gridSize; col++) {
                const x = offsetX + col * this.cellSize + this.cellSize / 2;
                const y = offsetY + row * this.cellSize + this.cellSize / 2;
                
                // 셀 배경
                const cellBg = this.add.rectangle(x, y, this.cellSize - 2, this.cellSize - 2, 0xf0f0f0);
                cellBg.setStrokeStyle(2, 0xcccccc);
                cellBg.setInteractive({ useHandCursor: true });
                
                // 텍스트
                const letter = this.gridData[row][col];
                const text = this.add.text(x, y, letter, {
                    fontSize: '24px',
                    fontFamily: 'Arial',
                    color: '#333333',
                    fontStyle: 'bold'
                });
                text.setOrigin(0.5);
                
                // 셀 데이터 저장
                const cellData = {
                    bg: cellBg,
                    text: text,
                    row: row,
                    col: col,
                    letter: letter,
                    isSelected: false,
                    isFound: false
                };
                
                // 이벤트 핸들러
                cellBg.on('pointerdown', () => this.onCellPointerDown(cellData));
                cellBg.on('pointerover', () => this.onCellPointerOver(cellData));
                cellBg.on('pointerup', () => this.onCellPointerUp());
                
                this.cellSprites[row][col] = cellData;
            }
        }
        
        // 전역 포인터업 이벤트
        this.input.on('pointerup', () => this.onCellPointerUp());
    }

    /**
     * 선택 시스템 초기화
     */
    initializeSelection() {
        this.selectionGraphics = this.add.graphics();
        this.selectionGraphics.setDepth(10);
    }

    /**
     * 셀 클릭 시작
     */
    onCellPointerDown(cellData) {
        if (!gameState.isGameActive) return;
        
        this.isSelecting = true;
        this.selectedCells = [cellData];
        this.highlightCell(cellData, true);
    }

    /**
     * 셀 위로 드래그
     */
    onCellPointerOver(cellData) {
        if (!this.isSelecting || !gameState.isGameActive) return;
        
        // 이미 선택된 셀인지 확인
        if (this.selectedCells.includes(cellData)) return;
        
        // 연속된 셀만 선택 가능하도록 (선택적)
        if (this.selectedCells.length > 0) {
            const lastCell = this.selectedCells[this.selectedCells.length - 1];
            const distance = Math.max(
                Math.abs(cellData.row - lastCell.row),
                Math.abs(cellData.col - lastCell.col)
            );
            
            // 인접한 셀만 허용 (상하좌우 및 대각선)
            if (distance > 1) return;
        }
        
        this.selectedCells.push(cellData);
        this.highlightCell(cellData, true);
        this.drawSelectionLine();
    }

    /**
     * 셀 선택 종료
     */
    onCellPointerUp() {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        this.validateSelection();
        this.clearSelection();
    }

    /**
     * 셀 하이라이트
     */
    highlightCell(cellData, highlight) {
        if (cellData.isFound) return;
        
        cellData.isSelected = highlight;
        
        if (highlight) {
            cellData.bg.setFillStyle(0x667eea);
            cellData.text.setColor('#ffffff');
        } else {
            cellData.bg.setFillStyle(0xf0f0f0);
            cellData.text.setColor('#333333');
        }
    }

    /**
     * 선택 라인 그리기
     */
    drawSelectionLine() {
        this.selectionGraphics.clear();
        
        if (this.selectedCells.length < 2) return;
        
        this.selectionGraphics.lineStyle(4, 0x667eea, 0.8);
        
        const offsetX = (this.cameras.main.width - (this.cellSize * this.gridSize)) / 2;
        const offsetY = (this.cameras.main.height - (this.cellSize * this.gridSize)) / 2;
        
        this.selectionGraphics.beginPath();
        
        for (let i = 0; i < this.selectedCells.length; i++) {
            const cell = this.selectedCells[i];
            const x = offsetX + cell.col * this.cellSize + this.cellSize / 2;
            const y = offsetY + cell.row * this.cellSize + this.cellSize / 2;
            
            if (i === 0) {
                this.selectionGraphics.moveTo(x, y);
            } else {
                this.selectionGraphics.lineTo(x, y);
            }
        }
        
        this.selectionGraphics.strokePath();
    }

    /**
     * 선택 검증
     */
    validateSelection() {
        if (this.selectedCells.length < 2) return;
        
        const selectedWord = this.selectedCells.map(cell => cell.letter).join('');
        const validWord = this.wordGenerator.validateSelection(
            this.selectedCells.map(cell => ({ row: cell.row, col: cell.col }))
        );
        
        if (validWord && !this.foundWords.has(validWord)) {
            this.onWordFound(validWord);
        } else {
            // 틀린 선택 - 진동 애니메이션
            this.shakeSelectedCells();
        }
    }

    /**
     * 단어 발견 처리
     */
    onWordFound(word) {
        this.foundWords.add(word);
        gameState.foundWords.push(word);
        
        // 점수 계산
        const baseScore = 100;
        const earnedScore = baseScore * this.multiplier;
        this.score += earnedScore;
        gameState.score = this.score;
        
        // 배수 증가
        this.multiplier += 0.5;
        gameState.multiplier = this.multiplier;
        
        // UI 업데이트
        updateScoreUI();
        markWordAsFound(word);
        
        // 셀을 찾은 상태로 표시
        this.selectedCells.forEach(cell => {
            cell.isFound = true;
            cell.bg.setFillStyle(0x28a745);
            cell.text.setColor('#ffffff');
        });
        
        // 파티클 효과
        this.showWordFoundEffect();
        
        // 게임 종료 체크
        if (this.foundWords.size >= 10) {
            this.time.delayedCall(1000, () => {
                handleGameEnd();
            });
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
    }

    /**
     * 틀린 선택 시 흔들기 애니메이션
     */
    shakeSelectedCells() {
        this.selectedCells.forEach(cell => {
            this.tweens.add({
                targets: [cell.bg, cell.text],
                x: '+=10',
                duration: 50,
                yoyo: true,
                repeat: 2
            });
        });
    }

    /**
     * 파티클 시스템 생성
     */
    createParticleSystem() {
        // 간단한 파티클 이펙트를 위한 그래픽 생성
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffd700);
        graphics.fillCircle(5, 5, 5);
        graphics.generateTexture('particle', 10, 10);
        graphics.destroy();
        
        // 파티클 이미터 생성 (사용 시에만 활성화)
        this.particles = this.add.particles(0, 0, 'particle', {
            speed: { min: 100, max: 200 },
            scale: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: 600,
            gravityY: 200,
            emitting: false
        });
    }

    /**
     * 단어 발견 효과
     */
    showWordFoundEffect() {
        this.selectedCells.forEach(cell => {
            const offsetX = (this.cameras.main.width - (this.cellSize * this.gridSize)) / 2;
            const offsetY = (this.cameras.main.height - (this.cellSize * this.gridSize)) / 2;
            
            const x = offsetX + cell.col * this.cellSize + this.cellSize / 2;
            const y = offsetY + cell.row * this.cellSize + this.cellSize / 2;
            
            this.particles.setPosition(x, y);
            this.particles.explode(10);
        });
    }

    /**
     * 게임 상태 리셋
     */
    resetGameState() {
        this.score = 0;
        this.multiplier = 1.0;
        this.foundWords.clear();
        this.selectedCells = [];
        
        gameState.score = 0;
        gameState.multiplier = 1.0;
        gameState.foundWords = [];
        
        updateScoreUI();
    }

    /**
     * 매 프레임 업데이트 - 점수 배수 감소
     */
    update(time, delta) {
        if (!gameState.isGameActive) return;
        
        // 점수 배수 감소 (초당 0.01씩)
        if (this.multiplier > 1.0) {
            const decayAmount = this.multiplierDecayRate * (delta / 1000);
            this.multiplier = Math.max(1.0, this.multiplier - decayAmount);
            gameState.multiplier = this.multiplier;
            
            // UI 업데이트 (0.1초마다)
            if (Math.floor(time / 100) !== Math.floor((time - delta) / 100)) {
                updateScoreUI();
            }
        }
    }
}
