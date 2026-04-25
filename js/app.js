/**
 * Main Application Logic for Zhanki
 */

const state = {
    currentView: 'study',
    cards: [],
    dueCards: [],
    currentCard: null,
    isRevealed: false
};

// DOM Elements
const views = {
    study: document.getElementById('view-study'),
    cards: document.getElementById('view-cards'),
    settings: document.getElementById('view-settings')
};

const navBtns = {
    study: document.getElementById('btn-study'),
    cards: document.getElementById('btn-cards'),
    settings: document.getElementById('btn-settings')
};

// --- Live JSON Data Management ---
/**
 * Fetches the latest JSON and merges it with DB progress.
 * This is the source of truth for the current card set.
 */
async function getLiveCards() {
    try {
        const response = await fetch(`data/default_cards.json?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });

        if (!response.ok) throw new Error('Could not load default_cards.json');

        const masterCards = await response.json();
        const dbCards = await window.db.getAllCards();

        // Merge master list with DB progress
        const liveCards = masterCards.map(master => {
            const progress = dbCards.find(c => c.hanzi === master.hanzi);
            if (progress) {
                // If progress exists, merge master content with it
                return {
                    ...progress,
                    pinyin: master.pinyin,
                    meaning: master.meaning,
                    exampleZh: master.exampleZh,
                    exampleKo: master.exampleKo
                };
            } else {
                // If new card in JSON, create it
                const newCard = window.SRS.createCard(master, true);
                // Save to DB silently so it has an ID next time
                window.db.addCard(newCard);
                return newCard;
            }
        });

        // Return ONLY the cards defined in the JSON master list
        // This ensures "제깍제깍" reflection of deletions in the JSON
        return liveCards;
    } catch (err) {
        console.error('Live fetch failed, falling back to DB only:', err);
        return await window.db.getAllCards();
    }
}

// --- Navigation ---
function switchView(viewName) {
    state.currentView = viewName;

    Object.keys(navBtns).forEach(key => {
        navBtns[key].classList.toggle('active', key === viewName);
    });

    Object.keys(views).forEach(key => {
        views[key].classList.toggle('active', key === viewName);
    });

    if (viewName === 'study') loadStudySession();
    if (viewName === 'cards') renderCardList();
}

// --- Study Session ---
async function loadStudySession() {
    const allCards = await getLiveCards();
    const now = Date.now();
    const todayStr = new Date().toLocaleDateString();
    
    // Load limit from localStorage or default to 20
    const savedLimit = localStorage.getItem('zhanki-new-limit') || 20;
    document.getElementById('new-cards-limit').value = savedLimit;
    const dailyLimit = parseInt(savedLimit);

    // 1. Due Cards
    const dueCards = allCards.filter(card => {
        if (!card.lastReviewed) return false; // Brand new card
        
        if (card.status === 'review') {
            return card.nextReview <= now; // Due today
        } else {
            // learning or relearning
            return card.nextReview <= now + 10 * 60 * 1000;
        }
    });

    // 2. New Cards (Never studied)
    const availableNewCards = allCards.filter(card => !card.lastReviewed);

    // 3. Count how many new cards were started today
    const startedTodayCount = allCards.filter(card => 
        card.startedDate === todayStr
    ).length;

    const remainingNewCount = Math.max(0, dailyLimit - startedTodayCount);
    const selectedNewCards = availableNewCards.slice(0, remainingNewCount);

    state.dueCards = [...dueCards, ...selectedNewCards];
    
    document.getElementById('count-due').textContent = state.dueCards.length;

    if (state.dueCards.length > 0) {
        showNextCard();
    } else {
        showEmptyState();
    }
}

function showNextCard() {
    state.currentCard = state.dueCards[0];
    state.isRevealed = false;

    document.getElementById('reveal-content').classList.add('hidden');
    document.getElementById('study-controls').classList.add('hidden');
    document.getElementById('hanzi-wrapper').classList.remove('shrunk');
    document.getElementById('card-hint').textContent = '클릭해서 정답 확인';
    document.getElementById('flashcard').style.cursor = 'pointer';

    document.getElementById('card-hanzi').textContent = state.currentCard.hanzi;
    document.getElementById('card-pinyin').textContent = state.currentCard.pinyin;
    document.getElementById('card-meaning').textContent = state.currentCard.meaning;
    document.getElementById('card-example-zh').textContent = state.currentCard.exampleZh || '';
    document.getElementById('card-example-ko').textContent = state.currentCard.exampleKo || '';

    // 학습 완료 시 숨겼던 예문 박스를 다시 표시
    const exampleBox = document.querySelector('.example-box');
    if (exampleBox) exampleBox.style.display = 'block';
}

function toggleReveal() {
    if (!state.currentCard || state.isRevealed) {
        return;
    }
    state.isRevealed = true;
    document.getElementById('reveal-content').classList.remove('hidden');
    document.getElementById('study-controls').classList.remove('hidden');
    document.getElementById('hanzi-wrapper').classList.add('shrunk');
    document.getElementById('card-hint').textContent = ''; // 문구 제거

    const labels = window.SRS.getIntervalLabels(state.currentCard);
    document.querySelectorAll('.srs-btn').forEach((btn, index) => {
        const intervalSpan = btn.querySelector('.interval');
        if (intervalSpan) {
            intervalSpan.textContent = labels[index];
        }
    });
}

async function handleGrade(grade) {
    const updatedCard = window.SRS.calculate(state.currentCard, grade);
    
    // Set startedDate if it's the very first review
    if (!state.currentCard.lastReviewed) {
        updatedCard.startedDate = new Date().toLocaleDateString();
    }
    
    // Track the date this card was reviewed to manage daily limits
    updatedCard.lastReviewedDate = new Date().toLocaleDateString();
    
    await window.db.updateCard(updatedCard);

    state.dueCards.shift();

    const now = Date.now();
    if (updatedCard.nextReview <= now + 10 * 60 * 1000) {
        state.dueCards.push(updatedCard);
    }

    document.getElementById('count-due').textContent = state.dueCards.length;

    if (state.dueCards.length > 0) {
        showNextCard();
    } else {
        showEmptyState();
    }
}

function showEmptyState() {
    state.currentCard = null;
    document.getElementById('card-hanzi').textContent = '🎉';
    document.getElementById('card-pinyin').textContent = '';
    document.getElementById('card-meaning').innerHTML = '오늘의 학습을<br>모두 마쳤습니다!';
    document.getElementById('card-example-zh').textContent = '';
    document.getElementById('card-example-ko').textContent = '';
    document.getElementById('study-controls').classList.add('hidden');
    document.getElementById('reveal-content').classList.remove('hidden'); // 다시 보여줌
    // 예문 박스만 골라서 숨김
    const exampleBox = document.querySelector('.example-box');
    if (exampleBox) exampleBox.style.display = 'none';
    document.getElementById('hanzi-wrapper').classList.remove('shrunk');
    document.getElementById('card-hint').textContent = '내일 다시 만나요!';
    document.getElementById('flashcard').style.cursor = 'default';
}

// --- Card Management ---
async function renderCardList() {
    const cards = await getLiveCards();
    const tbody = document.getElementById('card-list-body');
    tbody.innerHTML = '';

    cards.forEach(card => {
        const tr = document.createElement('tr');
        const nextDate = card.nextReview ? new Date(card.nextReview).toLocaleDateString() : '-';

        tr.innerHTML = `
            <td>${card.hanzi}</td>
            <td>${card.pinyin}</td>
            <td>${card.meaning}</td>
            <td>${nextDate}</td>
            <td>
                <button class="btn-icon edit" onclick="editCard(${card.id})"><i data-lucide="edit-2"></i></button>
                <button class="btn-icon delete" onclick="deleteCard(${card.id})"><i data-lucide="trash-2"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    window.lucide.createIcons();
}

async function deleteCard(id) {
    if (confirm('정말 이 카드를 삭제하시겠습니까? (기본 단어는 JSON에서 삭제해야 영구적으로 사라집니다)')) {
        await window.db.deleteCard(id);
        renderCardList();
    }
}

window.editCard = async (id) => {
    const cards = await window.db.getAllCards();
    const card = cards.find(c => c.id === id);
    if (card) {
        document.getElementById('modal-title').textContent = '카드 수정';
        document.getElementById('field-id').value = card.id;
        document.getElementById('field-hanzi').value = card.hanzi;
        document.getElementById('field-pinyin').value = card.pinyin;
        document.getElementById('field-meaning').value = card.meaning;
        document.getElementById('field-example-zh').value = card.exampleZh || '';
        document.getElementById('field-example-ko').value = card.exampleKo || '';
        document.getElementById('modal-card-form').classList.add('active');
    }
};

// --- Modal Logic ---
document.getElementById('btn-add-card').onclick = () => {
    document.getElementById('modal-title').textContent = '카드 추가';
    document.getElementById('card-form').reset();
    document.getElementById('field-id').value = '';
    document.getElementById('modal-card-form').classList.add('active');
};

document.getElementById('btn-close-modal').onclick = () => {
    document.getElementById('modal-card-form').classList.remove('active');
};

document.getElementById('card-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('field-id').value;
    const data = {
        hanzi: document.getElementById('field-hanzi').value,
        pinyin: document.getElementById('field-pinyin').value,
        meaning: document.getElementById('field-meaning').value,
        exampleZh: document.getElementById('field-example-zh').value,
        exampleKo: document.getElementById('field-example-ko').value,
    };

    if (id) {
        const cards = await window.db.getAllCards();
        const existing = cards.find(c => c.id == id);
        await window.db.updateCard({ ...existing, ...data });
    } else {
        const newCard = window.SRS.createCard(data);
        await window.db.addCard(newCard);
    }

    document.getElementById('modal-card-form').classList.remove('active');
    if (state.currentView === 'cards') renderCardList();
    if (state.currentView === 'study') loadStudySession();
};

// --- Export/Import ---
document.getElementById('btn-export').onclick = async () => {
    const cards = await window.db.getAllCards();
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhanki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
};

document.getElementById('btn-import').onclick = () => {
    document.getElementById('import-file').click();
};

document.getElementById('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const cards = JSON.parse(event.target.result);
            for (const card of cards) {
                await window.db.updateCard(card);
            }
            alert('데이터를 성공적으로 가져왔습니다!');
            location.reload();
        } catch (err) {
            alert('파일 형식이 잘못되었습니다.');
        }
    };
    reader.readAsText(file);
};

// --- Reset Progress ---
document.getElementById('btn-reset-progress').onclick = async () => {
    if (confirm('모든 단어의 학습 기록(복습 일정 등)이 초기화됩니다. 계속하시겠습니까?')) {
        await window.db.resetAllProgress();
        alert('모든 학습 기록이 초기화되었습니다.');
        if (state.currentView === 'study') loadStudySession();
        if (state.currentView === 'cards') renderCardList();
    }
};

// --- Initialize ---
document.addEventListener('DOMContentLoaded', async () => {
    await window.db.init();

    navBtns.study.onclick = () => switchView('study');
    navBtns.cards.onclick = () => switchView('cards');
    navBtns.settings.onclick = () => switchView('settings');

    document.getElementById('flashcard').onclick = toggleReveal;

    document.querySelectorAll('.srs-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            handleGrade(parseInt(btn.dataset.grade));
        };
    });

    // Settings listeners
    document.getElementById('new-cards-limit').onchange = (e) => {
        localStorage.setItem('zhanki-new-limit', e.target.value);
        if (state.currentView === 'study') loadStudySession();
    };

    switchView('study');
});


