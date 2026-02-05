/**
 * Word Generator - 단어 그리드 생성 및 관리
 */
class WordGenerator {
    constructor(gridSize = 12) {
        this.gridSize = gridSize;
        this.grid = [];
        this.words = [];
        this.placedWords = [];
    }

    /**
     * 기본 단어 리스트 (실제로는 더 많은 단어 필요)
     */
    getWordList() {
        return [
            'JAVASCRIPT', 'PHASER', 'GAME', 'PUZZLE', 'WORD',
            'CODE', 'DEVELOP', 'FIREBASE', 'MOBILE', 'CORDOVA',
            'ARCADE', 'PHYSICS', 'SCENE', 'SPRITE', 'ANIMATION',
            'SCORE', 'LEADER', 'BOARD', 'PLAYER', 'TOUCH'
        ];
    }

    /**
     * 랜덤으로 10개의 단어 선택
     */
    selectRandomWords() {
        const wordList = this.getWordList();
        const shuffled = wordList.sort(() => 0.5 - Math.random());
        this.words = shuffled.slice(0, 10);
        return this.words;
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
     * 단어를 그리드에 배치
     */
    placeWord(word, row, col, direction) {
        const directions = {
            horizontal: [0, 1],
            vertical: [1, 0],
            diagonal: [1, 1]
        };

        const [dx, dy] = directions[direction];
        const positions = [];

        for (let i = 0; i < word.length; i++) {
            const x = row + (dx * i);
            const y = col + (dy * i);
            
            if (x >= this.gridSize || y >= this.gridSize) {
                return false;
            }
            
            if (this.grid[x][y] !== '' && this.grid[x][y] !== word[i]) {
                return false;
            }
            
            positions.push({ x, y });
        }

        // 단어 배치
        for (let i = 0; i < word.length; i++) {
            this.grid[positions[i].x][positions[i].y] = word[i];
        }

        this.placedWords.push({
            word: word,
            positions: positions,
            direction: direction
        });

        return true;
    }

    /**
     * 모든 단어를 그리드에 배치 시도
     */
    placeAllWords() {
        const directions = ['horizontal', 'vertical', 'diagonal'];
        
        for (const word of this.words) {
            let placed = false;
            let attempts = 0;
            const maxAttempts = 100;

            while (!placed && attempts < maxAttempts) {
                const row = Math.floor(Math.random() * this.gridSize);
                const col = Math.floor(Math.random() * this.gridSize);
                const direction = directions[Math.floor(Math.random() * directions.length)];

                placed = this.placeWord(word, row, col, direction);
                attempts++;
            }

            if (!placed) {
                console.warn(`Could not place word: ${word}`);
            }
        }
    }

    /**
     * 빈 공간을 랜덤 알파벳으로 채우기
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
     * 완전한 그리드 생성
     */
    generateGrid() {
        this.selectRandomWords();
        this.createEmptyGrid();
        this.placeAllWords();
        this.fillEmptySpaces();
        
        return {
            grid: this.grid,
            words: this.words,
            placedWords: this.placedWords
        };
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
