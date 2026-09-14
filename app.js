// Glosor — PWA v3 (queue + self-assessment, samma mönster som begrepp)
// Laddar glosor-data.json, queue-baserad träning med ratt/fel self-assessment.
// Efter Rätta: användaren markerar själv om det blev rätt eller fel. Fel ord
// flyttas till slutet av kön. Session klar när alla ord är avbockade.

let allWords = [];
let queue = [];
let masteredThisSession = [];
let sessionRepeats = 0;
let currentCard = null;
let revealed = false;
let streak = 0;
let deferredInstallPrompt = null;

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
const guessInput = document.getElementById('guessInput');
const feedbackEl = document.getElementById('feedback');

const listenSvBtn = document.getElementById('listenSvBtn');
const listenEnBtn = document.getElementById('listenEnBtn');
const checkBtn = document.getElementById('checkBtn');
const selfAssessEl = document.getElementById('selfAssess');
const rattBtn = document.getElementById('rattBtn');
const felBtn = document.getElementById('felBtn');
const shareBtn = document.getElementById('shareBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const streakCounter = document.getElementById('streakCounter');
const streakNum = document.getElementById('streakNum');
const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstall');
const summaryEl = document.getElementById('summary');
const startOverBtn = document.getElementById('startOverBtn');
const summaryMasteredEl = document.getElementById('summaryMastered');
const summaryRepeatsEl = document.getElementById('summaryRepeats');
const summaryTotalEl = document.getElementById('summaryTotal');

const allButtons = () => [listenSvBtn, listenEnBtn, checkBtn, rattBtn, felBtn, shareBtn, shuffleBtn];

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
  guessInput.disabled = true;
}

function init() {
  // Shuffle IDs (Fisher-Yates) — samma mönster som begrepp init()
  const ids = allWords.map(w => w.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  queue = ids;
  masteredThisSession = [];
  sessionRepeats = 0;
  streak = 0;
  totalSpan.textContent = allWords.length;
  if (summaryTotalEl) summaryTotalEl.textContent = allWords.length;
  updateStreak();
  renderProgress();
  nextCard();
}

function nextCard() {
  if (queue.length === 0) {
    showSummary();
    return;
  }
  const id = queue[0];
  currentCard = allWords.find(w => w.id === id);
  if (!currentCard) {
    queue.shift();
    nextCard();
    return;
  }
  revealed = false;
  renderCard();
}

function renderCard() {
  if (!currentCard) return;
  svWordEl.textContent = currentCard.sv;
  currentSpan.textContent = masteredThisSession.length + 1;
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  guessInput.value = '';
  guessInput.disabled = false;
  guessInput.focus();
  audioIndicator.classList.remove('playing', 'error');
  audioIndicator.textContent = '';

  // Nollställ self-assessment state för nytt kort
  selfAssessEl.classList.add('hidden');
  checkBtn.disabled = false;

  renderProgress();
  // Spela SV-audio automatiskt efter 400ms (samma som begrepp INITIAL_DELAY_MS)
  setTimeout(() => playAudio('sv'), 400);
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

function checkGuess() {
  if (!currentCard || revealed) return;
  const guess = normalize(guessInput.value);
  const correct = normalize(currentCard.en);
  const alts = (currentCard.en_alts || '').split(',').map(s => normalize(s)).filter(Boolean);
  const allCorrect = [correct, ...alts];
  const isCorrect = guess && allCorrect.includes(guess);

  if (guess) {
    if (isCorrect) {
      feedbackEl.innerHTML = `✓ Rätt! <span class="en-answer">${escapeHtml(currentCard.en)}</span>`;
      feedbackEl.className = 'feedback feedback-correct';
    } else {
      feedbackEl.innerHTML = `✗ Inte rätt.<br>Du skrev: <strong>${escapeHtml(guessInput.value.trim())}</strong><br>Rätt: <span class="en-answer">${escapeHtml(currentCard.en)}</span>`;
      feedbackEl.className = 'feedback feedback-wrong';
    }
  } else {
    feedbackEl.innerHTML = `Svar: <span class="en-answer">${escapeHtml(currentCard.en)}</span>`;
    feedbackEl.className = 'feedback feedback-reveal';
  }

  revealed = true;
  selfAssessEl.classList.remove('hidden');
  checkBtn.disabled = true;

  // Auto-fokusera föreslagen knapp (användaren kan overrida)
  if (isCorrect) {
    rattBtn.focus();
  } else {
    felBtn.focus();
  }
}

function selfAssess(correct) {
  if (!currentCard || !revealed) return;

  if (correct) {
    queue.shift();
    masteredThisSession.push(currentCard.id);
    streak++;
  } else {
    // Flytta aktuellt kort från front till slutet av kön (begrepp-mönster)
    const cardId = queue.shift();
    queue.push(cardId);
    sessionRepeats++;
    streak = 0;
  }

  updateStreak();
  renderProgress();
  nextCard();
}

function renderProgress() {
  progressBar.innerHTML = '';
  for (let i = 0; i < allWords.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < masteredThisSession.length) dot.classList.add('completed');
    else if (i === masteredThisSession.length) dot.classList.add('active');
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
shareBtn.addEventListener('click', shareApp);
shuffleBtn.addEventListener('click', shuffleWords);
startOverBtn.addEventListener('click', startOver);

guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!revealed) checkGuess();
  }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); playAudio('sv'); }
  else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); playAudio('en'); }
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

loadData();
