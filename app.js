// Glosor — PWA v7 (mode-toggle + prev/next + auto-advance på rätt)
//
// Läge:
//   • Papper: Rätta visar facit direkt, användaren jämför med papper och
//     markerar själv ✓ Rätt / ✗ Fel. Fel ord flyttas till slutet av listan.
//   • App: Skriv in översättningen, Rätta jämför mot en (+ en_alts).
//     Rätt → ✓ visas, auto-advance ~0.8s. Fel → ✗ med diff, [Nästa →] manuell.
//     INGEN self-mark i app-läge — appen graderar.
//
// Navigation (alltid tillgänglig, båda lägen):
//   • ← Bak / Nästa → navigerar genom listan.
//   • Rätta påverkar listan (mastered + fel-ord till slutet) oavsett var vi är.

let allWords = [];
let order = [];           // Aktuell ordning av ord-ID:n (shufflas en gång, fel-ord flyttas dynamiskt)
let currentIndex = 0;      // Pekare i order[]
let masteredThisSession = [];
let sessionRepeats = 0;
let currentCard = null;
let revealed = false;
let streak = 0;
let deferredInstallPrompt = null;

let appMode = 'paper'; // 'paper' | 'app' (persists in localStorage)
const MODE_KEY = 'glosor-mode';

const audio = new Audio();
audio.preload = 'auto';

const cardEl = document.querySelector('.card');
const svWordEl = document.getElementById('svWord');
const audioIndicator = document.getElementById('audioIndicator');
const currentSpan = document.getElementById('current');
const totalSpan = document.getElementById('total');
const progressBar = document.getElementById('progressBar');
const titleEl = document.getElementById('title');
const subtitleEl = document.querySelector('.subtitle');
const hintEl = document.getElementById('hint');
const feedbackEl = document.getElementById('feedback');

const listenSvBtn = document.getElementById('listenSvBtn');
const listenEnBtn = document.getElementById('listenEnBtn');
const checkBtn = document.getElementById('checkBtn');
const guessInput = document.getElementById('guessInput');
const inputRow = document.getElementById('inputRow');
const selfAssessEl = document.getElementById('selfAssess');
const rattBtn = document.getElementById('rattBtn');
const felBtn = document.getElementById('felBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shareBtn = document.getElementById('shareBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const streakCounter = document.getElementById('streakCounter');
const streakNum = document.getElementById('streakNum');
const modeToggle = document.getElementById('modeToggle');
const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstall');
const summaryEl = document.getElementById('summary');
const startOverBtn = document.getElementById('startOverBtn');
const summaryMasteredEl = document.getElementById('summaryMastered');
const summaryRepeatsEl = document.getElementById('summaryRepeats');
const summaryTotalEl = document.getElementById('summaryTotal');

const allButtons = () => [listenSvBtn, listenEnBtn, checkBtn, rattBtn, felBtn, prevBtn, nextBtn, shareBtn, shuffleBtn];

async function loadData() {
  try {
    const res = await fetch('glosor-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    allWords = (data.words || []).filter(w => w.active !== false);
    const meta = data.meta || {};
    if (meta.title) titleEl.textContent = meta.title;
    if (meta.subtitle) subtitleEl.textContent = meta.subtitle;
    if (!allWords.length) throw new Error('Inga glosor i datafilen');
    init();
  } catch (err) {
    console.error('Kunde inte ladda glosor-data.json:', err);
    showError('Kunde inte ladda data. Kontrollera att glosor-data.json finns.');
  }
}

function showError(msg) {
  svWordEl.textContent = '⚠️';
  hintEl.textContent = msg;
  hintEl.classList.add('error-state');
  allButtons().forEach(b => b.disabled = true);
}

function loadMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'paper' || stored === 'app') appMode = stored;
  } catch {}
}

function saveMode() {
  try {
    localStorage.setItem(MODE_KEY, appMode);
  } catch {}
}

function setAppMode(mode) {
  appMode = mode;
  saveMode();
  // Update toggle UI
  modeToggle?.querySelectorAll('.mode-opt').forEach(b => {
    const isActive = b.dataset.mode === mode;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  // Update hint
  if (mode === 'paper') {
    hintEl.textContent = 'Lyssna, skriv svaret på papper och tryck Rätta för att se facit.';
  } else {
    hintEl.textContent = 'Lyssna och skriv den engelska översättningen.';
  }
  // Show/hide input row
  if (inputRow) {
    inputRow.hidden = (mode === 'paper');
  }
  // Reset transient state
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  if (guessInput) {
    guessInput.value = '';
    guessInput.disabled = false;
  }
  checkBtn.disabled = false;
  selfAssessEl.classList.add('hidden');
  revealed = false;
}

function init() {
  // Fisher-Yates shuffle → order
  order = allWords.map(w => w.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  currentIndex = 0;
  masteredThisSession = [];
  sessionRepeats = 0;
  streak = 0;
  totalSpan.textContent = allWords.length;
  if (summaryTotalEl) summaryTotalEl.textContent = allWords.length;
  updateStreak();
  renderProgress();
  renderCard();
}

function renderCard() {
  if (currentIndex >= order.length) {
    showSummary();
    return;
  }
  const id = order[currentIndex];
  currentCard = allWords.find(w => w.id === id);
  if (!currentCard) {
    currentIndex++;
    renderCard();
    return;
  }
  svWordEl.textContent = currentCard.sv;
  currentSpan.textContent = currentIndex + 1;
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  audioIndicator.classList.remove('playing', 'error');
  audioIndicator.textContent = '';

  // Nollställ state
  selfAssessEl.classList.add('hidden');
  checkBtn.disabled = false;
  if (guessInput) {
    guessInput.value = '';
    guessInput.disabled = false;
  }
  revealed = false;

  // Nav-knappar
  if (prevBtn) prevBtn.disabled = currentIndex === 0;
  if (nextBtn) nextBtn.disabled = currentIndex >= order.length - 1;

  renderProgress();
  // Spela SV-audio automatiskt efter 400ms
  setTimeout(() => playAudio('sv'), 400);
  // Fokusera input om app-läge
  if (appMode === 'app' && guessInput) {
    setTimeout(() => guessInput.focus(), 500);
  }
}

function nextWord() {
  if (currentIndex < order.length - 1) {
    currentIndex++;
    renderCard();
  } else if (currentIndex === order.length - 1) {
    showSummary();
  }
}

function prevWord() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCard();
  }
}

function playAudio(lang) {
  if (!currentCard) return;
  const audioFile = lang === 'en' ? currentCard.audio_en : currentCard.audio_sv;
  if (!audioFile) {
    audioIndicator.textContent = `⚠️ Ingen ${lang === 'en' ? 'engelsk' : 'svensk'} audio för detta ord`;
    audioIndicator.classList.add('error');
    return;
  }
  audio.src = audioFile;
  audio.currentTime = 0;
  audioIndicator.textContent = `🔊 Spelar ${lang === 'en' ? 'engelska' : 'svenska'}…`;
  audioIndicator.classList.remove('error');
  audioIndicator.classList.add('playing');
  const p = audio.play();
  if (p && p.catch) p.catch(err => console.error('Audio playback failed:', err));
}

function normalize(str) {
  return str.toLowerCase().trim();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function buildAcceptedAnswers(card) {
  const accepted = [normalize(card.en)];
  if (card.en_alts) {
    card.en_alts.split(',').forEach(alt => {
      const trimmed = alt.trim();
      if (trimmed) accepted.push(normalize(trimmed));
    });
  }
  return accepted;
}

function buildDiffFeedback(guessText, correctText) {
  let highlightedGuess = '';
  let i = 0;
  while (i < guessText.length && i < correctText.length) {
    if (guessText[i].toLowerCase() === correctText[i].toLowerCase()) {
      highlightedGuess += escapeHtml(guessText[i]);
    } else {
      highlightedGuess += `<span class="wrong-letter">${escapeHtml(guessText[i])}</span>`;
    }
    i++;
  }
  if (guessText.length > correctText.length) {
    highlightedGuess += `<span class="wrong-letter">${escapeHtml(guessText.slice(i))}</span>`;
  } else if (guessText.length < correctText.length) {
    highlightedGuess += `<span class="missing-letter">${escapeHtml(correctText.slice(i))}</span>`;
  }
  return `✗ Inte rätt.<br>Du skrev: <strong>${highlightedGuess}</strong><br>Rätt: <strong>${escapeHtml(correctText)}</strong>`;
}

function checkGuess() {
  if (!currentCard || revealed) return;

  // Pappersläge: visa facit direkt, användaren jämför med papper och markerar själv.
  if (appMode === 'paper') {
    feedbackEl.innerHTML = `Svar: <span class="en-answer">${escapeHtml(currentCard.en)}</span>`;
    feedbackEl.className = 'feedback feedback-reveal';
    revealed = true;
    selfAssessEl.classList.remove('hidden');
    checkBtn.disabled = true;
    return;
  }

  // App-läge: jämför input mot facit
  const guess = normalize(guessInput.value);
  if (!guess) {
    feedbackEl.textContent = 'Skriv ditt svar först';
    feedbackEl.className = 'feedback feedback-hint';
    return;
  }

  const accepted = buildAcceptedAnswers(currentCard);

  if (accepted.includes(guess)) {
    // Rätt: ✓ visas, auto-advance efter ~0.8s, INGA knappar
    feedbackEl.innerHTML = `✓ Rätt! <strong>${escapeHtml(currentCard.en)}</strong>`;
    feedbackEl.className = 'feedback feedback-correct';
    checkBtn.disabled = true;
    guessInput.disabled = true;
    revealed = true;
    masteredThisSession.push(currentCard.id);
    streak++;
    updateStreak();
    renderProgress();
    setTimeout(() => nextWord(), 800);
  } else {
    // Fel: ✗ med diff, ordet till slutet av listan, [Nästa →] manuell
    feedbackEl.innerHTML = buildDiffFeedback(guessInput.value.trim(), currentCard.en);
    feedbackEl.className = 'feedback feedback-wrong';
    checkBtn.disabled = true;
    guessInput.disabled = true;
    revealed = true;
    streak = 0;
    updateStreak();
    sessionRepeats++;
    // Flytta ordet till slutet av listan (currentIndex pekar nu på nästa)
    const wordId = order.splice(currentIndex, 1)[0];
    order.push(wordId);
    renderProgress();
    // Uppdatera nav-knappar (nextBtn kan ha blivit enabled)
    if (nextBtn) nextBtn.disabled = false;
    // Fokusera Nästa → så det är tydligt att det är nästa steg
    if (nextBtn) nextBtn.focus();
  }
}

function selfAssess(correct) {
  // Används bara i pappersläge (app-läge använder checkGuess direkt).
  if (!currentCard || !revealed) return;

  if (correct) {
    masteredThisSession.push(currentCard.id);
    streak++;
  } else {
    const wordId = order.splice(currentIndex, 1)[0];
    order.push(wordId);
    sessionRepeats++;
    streak = 0;
  }
  updateStreak();
  renderProgress();
  nextWord();
}

function renderProgress() {
  progressBar.innerHTML = '';
  const masteredSet = new Set(masteredThisSession);
  for (let i = 0; i < order.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (masteredSet.has(order[i])) dot.classList.add('completed');
    else if (i === currentIndex) dot.classList.add('active');
    progressBar.appendChild(dot);
  }
}

function updateStreak() {
  streakNum.textContent = streak;
  streakCounter.classList.toggle('visible', streak > 0);
  if (streak > 0) {
    streakCounter.classList.remove('pulse');
    void streakCounter.offsetWidth;
    streakCounter.classList.add('pulse');
    setTimeout(() => streakCounter.classList.remove('pulse'), 500);
  }
}

function showSummary() {
  cardEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  if (summaryMasteredEl) summaryMasteredEl.textContent = masteredThisSession.length;
  if (summaryRepeatsEl) summaryRepeatsEl.textContent = sessionRepeats;
  if (summaryTotalEl) summaryTotalEl.textContent = allWords.length;
}

function startOver() {
  cardEl.classList.remove('hidden');
  summaryEl.classList.add('hidden');
  init();
}

function shuffleWords() {
  init();
  shuffleBtn.textContent = '✅';
  setTimeout(() => { shuffleBtn.textContent = '🔀 Blanda om'; }, 800);
}

async function shareApp() {
  const shareData = {
    title: titleEl.textContent || 'Glosor',
    text: 'Öva glosor med audio på svenska och engelska',
    url: window.location.href
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Share failed:', err);
    }
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    const orig = shareBtn.textContent;
    shareBtn.textContent = '✓ Länk kopierad';
    setTimeout(() => { shareBtn.textContent = orig; }, 2000);
  } catch (err) {
    console.error('Clipboard failed:', err);
  }
}

// Events
listenSvBtn.addEventListener('click', () => playAudio('sv'));
listenEnBtn.addEventListener('click', () => playAudio('en'));
checkBtn.addEventListener('click', checkGuess);
rattBtn.addEventListener('click', () => selfAssess(true));
felBtn.addEventListener('click', () => selfAssess(false));
prevBtn?.addEventListener('click', prevWord);
nextBtn?.addEventListener('click', () => {
  // Om revealed (fel i app-läge, eller self-mark i papper-läge), hantera word-move
  if (!revealed) {
    nextWord();
    return;
  }
  // I app-läge efter fel: ordet är redan flyttat till slutet, bara advance
  if (appMode === 'app') {
    nextWord();
  } else {
    // Papper-läge: användaren ska ha markerat först — om de trycker Nästa utan att markera, advance ändå
    nextWord();
  }
});
shareBtn.addEventListener('click', shareApp);
shuffleBtn.addEventListener('click', shuffleWords);
startOverBtn.addEventListener('click', startOver);

// Enter i input-fältet triggar Rätta (app-läge)
guessInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!revealed) checkGuess();
  }
});

// Mode toggle
modeToggle?.addEventListener('click', e => {
  const opt = e.target.closest('.mode-opt');
  if (!opt) return;
  const newMode = opt.dataset.mode;
  if (newMode === appMode) return;
  setAppMode(newMode);
  renderCard();
});

// Tangentbord: piltangenter för ← Bak / Nästa → (globalt — input-target hanteras ovan)
document.addEventListener('keydown', e => {
  // Skip om target är input eller contenteditable (input-hanteraren tar Enter, men piltangenter bör också skipas om användaren redigerar)
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) {
    // Tillåt piltangenter för cursor-rörelse i input
    return;
  }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevWord(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextWord(); }
  else if (e.key === 's' || e.key === 'S') { e.preventDefault(); playAudio('sv'); }
  else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); playAudio('en'); }
  else if (e.key === 'Enter') { e.preventDefault(); if (!revealed) checkGuess(); }
  else if (e.key === 'r' || e.key === 'R') { if (revealed) selfAssess(true); }
  else if (e.key === 'f' || e.key === 'F') { if (revealed) selfAssess(false); }
});

audio.addEventListener('ended', () => audioIndicator.classList.remove('playing'));
audio.addEventListener('error', () => {
  audioIndicator.classList.remove('playing');
  audioIndicator.classList.add('error');
  audioIndicator.textContent = '⚠️ Kunde inte spela ljud';
});

// PWA install
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installHint.hidden = false;
  installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installHint.hidden = true;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (outcome === 'accepted') console.log('PWA install accepted');
});

dismissInstallBtn?.addEventListener('click', () => { installHint.hidden = true; });

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  });
}

// Initiera läge från localStorage (eller default = paper)
loadMode();
setAppMode(appMode);

loadData();