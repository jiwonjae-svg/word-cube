/**
 * ============================================
 * Word Generator - 고급 8방향 단어 배치 시스템
 * 가로/세로/대각선 정방향 및 역방향 지원
 * ============================================
 */
class WordGenerator {
    constructor(gridSize = 12, customWordList = null) {
        this.gridSize = gridSize;
        this.grid = [];
        this.words = [];
        this.placedWords = [];
        this.excludedZones = []; // 가려진 영역 정보
        
        // 커스텀 단어 리스트 지원 (데이터 동기화 보장)
        this.customWordList = customWordList;
        console.log('🔧 WordGenerator 초기화:', {
            gridSize,
            hasCustomWords: !!customWordList,
            customWordsCount: customWordList ? customWordList.length : 0
        });
    }

    /**
     * 확장된 단어 리스트 (15-20개 선택 가능)
     */
    getWordList() {
        return [
            // 프로그래밍 & 게임 개발
            'JAVASCRIPT', 'PHASER', 'GAME', 'PUZZLE', 'WORD',
            'CODE', 'DEVELOP', 'FIREBASE', 'MOBILE', 'CORDOVA',
            'ARCADE', 'PHYSICS', 'SCENE', 'SPRITE', 'ANIMATION',
            'SCORE', 'LEADER', 'BOARD', 'PLAYER', 'TOUCH',
            'REACT', 'NODEJS', 'PYTHON', 'JAVA', 'SWIFT',
            'KOTLIN', 'HTML', 'CSS', 'DATABASE', 'API',
            'CLOUD', 'SERVER', 'CLIENT', 'NETWORK', 'DEPLOY',
            // 추가 일반 단어
            'ALGORITHM', 'FUNCTION', 'VARIABLE', 'OBJECT', 'ARRAY',
            'STRING', 'NUMBER', 'BOOLEAN', 'ASYNC', 'AWAIT',
            'PROMISE', 'CALLBACK', 'EVENT', 'HANDLER', 'LISTENER'
        ];
    }

    /**
     * 랜덤으로 10개의 단어 선택 (커스텀 리스트 우선)
     */
    selectRandomWords(count = 10) {
        // 커스텀 단어 리스트가 있으면 우선 사용 (데이터 동기화)
        const wordList = this.customWordList && this.customWordList.length >= count
            ? this.customWordList
            : this.getWordList();
        
        console.log('📝 단어 선택:', {
            source: this.customWordList ? 'Custom (gameState)' : 'Default (getWordList)',
            totalAvailable: wordList.length,
            selecting: count
        });
        
        const shuffled = wordList.sort(() => 0.5 - Math.random());
        this.words = shuffled.slice(0, count);
        return this.words;
    }

    /**
     * ==========================================
     * 8방향 벡터 정의
     * 0: 우(→), 1: 좌(←), 2: 하(↓), 3: 상(↑)
     * 4: 우하(↘), 5: 좌상(↖), 6: 우상(↗), 7: 좌하(↙)
     * ==========================================
     */
    getDirections() {
        return {
            'right': { dx: 0, dy: 1, name: '가로(→)' },
            'left': { dx: 0, dy: -1, name: '가로역(←)' },
            'down': { dx: 1, dy: 0, name: '세로(↓)' },
            'up': { dx: -1, dy: 0, name: '세로역(↑)' },
            'down-right': { dx: 1, dy: 1, name: '대각선(↘)' },
            'up-left': { dx: -1, dy: -1, name: '대각선역(↖)' },
            'up-right': { dx: -1, dy: 1, name: '대각선(↗)' },
            'down-left': { dx: 1, dy: -1, name: '대각선(↙)' }
        };
    }

    /**
     * ==========================================
     * 가려진 영역 설정 (단어 리스트 패널 위치)
     * ==========================================
     */
    setExcludedZones(zones) {
        this.excludedZones = zones;
    }

    /**
     * 특정 위치가 가려진 영역인지 확인
     */
    isInExcludedZone(row, col) {
        for (const zone of this.excludedZones) {
            if (row >= zone.startRow && row <= zone.endRow &&
                col >= zone.startCol && col <= zone.endCol) {
                return true;
            }
        }
        return false;
    }

    /**
     * 빈 그리드 생성
     */
    createEmptyGrid() {
        this.grid = [];
        for (let i = 0; i < this.gridSize; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.gridSize; j++) {
                this.grid[i][j] = '';
            }
        }
    }

    /**
     * ==========================================
     * 8방향 단어 배치 엔진 (개선됨)
     * ==========================================
     */
    placeWord(word, startRow, startCol, directionKey) {
        const directions = this.getDirections();
        const direction = directions[directionKey];
        
        if (!direction) return false;

        const { dx, dy } = direction;
        const positions = [];
        let crossExcludedZone = false;

        // 배치 가능 여부 검사
        for (let i = 0; i < word.length; i++) {
            const x = startRow + (dx * i);
            const y = startCol + (dy * i);
            
            // 그리드 범위 체크
            if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) {
                return false;
            }
            
            // 가려진 영역 체크 (완전히 가려진 것은 피함)
            if (this.isInExcludedZone(x, y)) {
                crossExcludedZone = true;
            }
            
            // 충돌 체크 (빈 곳이거나 같은 글자만 허용)
            if (this.grid[x][y] !== '' && this.grid[x][y] !== word[i]) {
                return false;
            }
            
            positions.push({ x, y });
        }

        // 전략: 가려진 영역을 50% 확률로 허용 (전략적 배치)
        if (crossExcludedZone && Math.random() > 0.5) {
            return false;
        }

        // 단어 배치 실행
        for (let i = 0; i < word.length; i++) {
            this.grid[positions[i].x][positions[i].y] = word[i];
        }

        this.placedWords.push({
            word: word,
            positions: positions,
            direction: directionKey,
            directionName: direction.name
        });

        return true;
    }

    /**
     * ==========================================
     * 모든 단어 배치 (최대 시도 횟수 제한)
     * ==========================================
     */
    placeAllWords() {
        const MAX_TRIES_PER_WORD = 50; // 단어당 최대 50번 시도 (안정화)
        const directionKeys = Object.keys(this.getDirections());
        
        console.log(`📝 단어 배치 시작: ${this.words.length}개`);
        
        let successCount = 0;
        
        for (const word of this.words) {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < MAX_TRIES_PER_WORD) {
                attempts++;
                
                // 랜덤 시작 위치
                const startRow = Math.floor(Math.random() * this.gridSize);
                const startCol = Math.floor(Math.random() * this.gridSize);
                
                // 랜덤 방향
                const directionKey = directionKeys[Math.floor(Math.random() * directionKeys.length)];
                
                // 단어 배치 시도
                placed = this.placeWord(word, startRow, startCol, directionKey);
            }
            
            if (placed) {
                successCount++;
                console.log(`✅ [${successCount}/${this.words.length}] ${word} 배치 완료 (${attempts}번 시도)`);
            } else {
                console.warn(`⚠️ [${successCount}/${this.words.length}] ${word} 배치 실패 (${MAX_TRIES_PER_WORD}번 시도 후 건너뜀)`);
                // 단어를 건너뛰고 계속 진행
            }
        }
        
        console.log(`📊 단어 배치 완료: ${successCount}/${this.words.length}개 성공`);
        
        // 최소 3개 이상 배치되지 않으면 경고
        if (successCount < 3) {
            console.error(`❌ 배치된 단어가 너무 적음: ${successCount}개`);
        }
    }

    /**
     * ==========================================
     * 빈 공간을 랜덤 문자로 채우기
     * ==========================================
     */
    fillEmptySpaces() {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] === '') {
                    this.grid[i][j] = alphabet[Math.floor(Math.random() * alphabet.length)];
                }
            }
        }
    }

    /**
     * ==========================================
     * 완전한 그리드 생성 (10개 단어)
     * ==========================================
     */
    generateGrid() {
        console.log('🎲 그리드 생성 시작...');
        
        // CRITICAL: 단어 선택 전 검증
        const selectedWords = this.selectRandomWords(10);
        if (!selectedWords || selectedWords.length === 0) {
            throw new Error('❌ 단어 선택 실패: 사용 가능한 단어가 없습니다');
        }
        
        console.log('✅ 단어 선택 완료:', selectedWords);
        
        this.createEmptyGrid();
        console.log('✅ 빈 그리드 생성 완료');
        
        this.placeAllWords();
        console.log('✅ 단어 배치 완료');
        
        this.fillEmptySpaces();
        console.log('✅ 빈 공간 채우기 완료');
        
        const result = {
            grid: this.grid,
            words: this.words,
            placedWords: this.placedWords
        };
        
        console.log('🎉 그리드 생성 완료:', {
            gridSize: this.gridSize,
            totalWords: result.words.length,
            placedWords: result.placedWords.length
        });
        
        return result;
    }

    /**
     * ==========================================
     * 선택된 셀들이 유효한 단어를 형성하는지 확인 (강화됨)
     * ==========================================
     */
    validateSelection(selectedCells) {
        if (selectedCells.length < 2) return null;

        // 선택된 셀에서 단어 추출
        const word = selectedCells.map(cell => this.grid[cell.row][cell.col]).join('');

        // 배치된 단어와 비교 (정방향만)
        for (const placedWord of this.placedWords) {
            if (placedWord.word === word) {
                const positionsMatch = this.checkPositionsMatch(selectedCells, placedWord.positions, false);
                if (positionsMatch) {
                    return placedWord.word;
                }
            }
        }

        return null;
    }

    /**
     * ==========================================
     * 위치 배열 비교 (역방향 지원)
     * ==========================================
     */
    checkPositionsMatch(selected, placed, reverse = false) {
        if (selected.length !== placed.length) return false;

        const placedToCheck = reverse ? [...placed].reverse() : placed;

        for (let i = 0; i < selected.length; i++) {
            if (selected[i].row !== placedToCheck[i].x || 
                selected[i].col !== placedToCheck[i].y) {
                return false;
            }
        }

        return true;
    }

    /**
     * ==========================================
     * 경로가 유효한지 검증 (인접한 셀만 허용)
     * ==========================================
     */
    isValidPath(selectedCells) {
        if (selectedCells.length < 2) return false;

        for (let i = 1; i < selectedCells.length; i++) {
            const prev = selectedCells[i - 1];
            const curr = selectedCells[i];
            
            const rowDiff = Math.abs(curr.row - prev.row);
            const colDiff = Math.abs(curr.col - prev.col);
            
            // 체스의 킹 이동 (8방향 + 인접)
            if (rowDiff > 1 || colDiff > 1) {
                return false;
            }
            
            // 같은 위치는 불가
            if (rowDiff === 0 && colDiff === 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * ==========================================
     * 디버그: 배치된 단어 정보 출력
     * ==========================================
     */
    printPlacedWords() {
        console.log('=== 배치된 단어 목록 ===');
        this.placedWords.forEach((pw, index) => {
            console.log(`${index + 1}. ${pw.word} - ${pw.directionName} - Start: (${pw.positions[0].x}, ${pw.positions[0].y})`);
        });
    }

    /**
     * 선택된 셀들이 유효한 단어를 형성하는지 확인
     */
    validateSelection(selectedCells) {
        if (selectedCells.length < 2) return null;

        // 선택된 셀에서 단어 추출
        const word = selectedCells.map(cell => this.grid[cell.row][cell.col]).join('');

        // 배치된 단어와 비교
        for (const placedWord of this.placedWords) {
            if (placedWord.word === word) {
                // 위치도 정확히 일치하는지 확인
                const positionsMatch = this.checkPositionsMatch(selectedCells, placedWord.positions);
                if (positionsMatch) {
                    return placedWord.word;
                }
            }
        }

        return null;
    }

    /**
     * 위치 배열 비교
     */
    checkPositionsMatch(selected, placed) {
        if (selected.length !== placed.length) return false;

        for (let i = 0; i < selected.length; i++) {
            if (selected[i].row !== placed[i].x || selected[i].col !== placed[i].y) {
                return false;
            }
        }

        return true;
    }
}
