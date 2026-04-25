/**
 * SuperMemo-2 (SM-2) Algorithm implementation for Zhanki
 * Updated to handle learning phase (minutes), relearning phase, and review phase (days)
 */
const SRS = {
    // Learning intervals in minutes
    LEARNING_STEPS: [1, 10], // minutes

    /**
     * Calculates the next review date and SRS parameters
     * @param {Object} card - The card object
     * @param {number} grade - User performance grade (0: Again, 1: Hard, 2: Good, 3: Easy)
     * @returns {Object} Updated card parameters
     */
    calculate(card, grade) {
        let { repetition, interval, easiness, status } = card;

        // Default values if missing
        repetition = repetition || 0;
        interval = interval === undefined ? 0 : interval; // 0 means learning phase
        easiness = easiness || 2.5;
        status = status || 'learning'; // 'learning', 'relearning', or 'review'

        // 🚨 과거의 0분 버그로 인해 망가진 카드를 복구하는 로직
        if (status === 'review' && interval === 0) {
            interval = 1;
        }

        let nextIntervalMinutes = 0;
        let nextIntervalDays = 0;

        if (status === 'learning') {
            if (grade === 0) { // Again
                nextIntervalMinutes = 1;
                repetition = 0;
            } else if (grade === 1) { // Hard
                nextIntervalMinutes = 6;
            } else if (grade === 2) { // Good
                if (repetition === 0) {
                    nextIntervalMinutes = 10;
                    repetition = 1;
                } else {
                    status = 'review';
                    nextIntervalDays = 1;
                    interval = 1;
                    repetition = 2;
                }
            } else if (grade === 3) { // Easy
                status = 'review';
                nextIntervalDays = 4;
                interval = 4;
                repetition = 2;
            }
        } else if (status === 'relearning') {
            if (grade === 0) { // Again
                nextIntervalMinutes = 1;
                repetition = 0;
            } else if (grade === 1) { // Hard
                nextIntervalMinutes = 6;
            } else if (grade === 2) { // Good
                if (repetition === 0) {
                    nextIntervalMinutes = 10;
                    repetition = 1;
                } else {
                    status = 'review';
                    nextIntervalDays = 1;
                    interval = 1;
                    repetition = 2;
                }
            } else if (grade === 3) { // Easy
                status = 'review';
                nextIntervalDays = 1; // 하루 뒤에 다시 복습해야 하는 형식
                interval = 1;
                repetition = 2;
            }
        } else if (status === 'review') {
            if (grade === 0) { // Again
                status = 'relearning';
                repetition = 0;
                nextIntervalMinutes = 1;
                easiness = Math.max(1.3, easiness - 0.20);
                interval = 1; // 재학습 후 졸업 시 적용될 기본 간격
            } else if (grade === 1) { // Hard
                nextIntervalDays = Math.max(1, Math.round(interval * 1.2));
                interval = nextIntervalDays;
                easiness = Math.max(1.3, easiness - 0.15);
            } else if (grade === 2) { // Good
                nextIntervalDays = Math.max(1, Math.round(interval * easiness));
                interval = nextIntervalDays;
            } else if (grade === 3) { // Easy
                nextIntervalDays = Math.max(1, Math.round(interval * easiness * 1.3));
                const goodInterval = Math.max(1, Math.round(interval * easiness));
                // Easy 간격이 Good 간격과 똑같이 나오는 현상 방지
                if (nextIntervalDays <= goodInterval) {
                    nextIntervalDays = goodInterval + 1;
                }
                interval = nextIntervalDays;
                easiness = easiness + 0.15;
            }
        }

        const now = Date.now();
        let nextReview;
        if (nextIntervalMinutes > 0) {
            nextReview = now + (nextIntervalMinutes * 60 * 1000);
        } else {
            nextReview = now + (nextIntervalDays * 24 * 60 * 60 * 1000);
        }

        // 라벨 표기 시 계산 오차로 인한 '<0분'을 방지하기 위한 최소 시간 보장 로직
        if (nextReview <= now) {
            nextReview = now + 60000;
        }

        return {
            ...card,
            repetition,
            interval,
            easiness,
            status,
            nextReview,
            lastReviewed: now
        };
    },

    /**
     * Gets the human-readable intervals for each grade
     */
    getIntervalLabels(card) {
        const grades = [0, 1, 2, 3];
        return grades.map(grade => {
            const result = this.calculate({ ...card }, grade);
            const diffMs = result.nextReview - Date.now();
            
            // '<0분' 표기를 막기 위해 최소 1분(60000ms)은 되도록 보정
            const safeDiffMs = Math.max(60000, diffMs);
            
            if (safeDiffMs < 60 * 60 * 1000) { // Less than an hour
                const mins = Math.max(1, Math.round(safeDiffMs / (60 * 1000)));
                return `<${mins}분`;
            } else if (safeDiffMs < 24 * 60 * 60 * 1000) { // Less than a day
                const hours = Math.round(safeDiffMs / (60 * 60 * 1000));
                return `${hours}시간`;
            } else {
                const days = Math.round(safeDiffMs / (24 * 60 * 60 * 1000));
                return `${days}일`;
            }
        });
    },

    /**
     * Creates a new card object with default SRS parameters
     */
    createCard(data, isDefault = false) {
        return {
            ...data,
            repetition: 0,
            interval: 0,
            easiness: 2.5,
            status: 'learning',
            isDefault: isDefault,
            nextReview: Date.now(),
            createdAt: Date.now()
        };
    }
};

window.SRS = SRS;
