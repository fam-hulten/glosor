// Glosor — PWA
// Loads glosor-data.json, presents Swedish words with audio (sv + en), lets user type the English translation.

let words = [];
let meta = {};
let currentIndex = 0;
let revealed = false;
let streak = 0;
let deferredInstallPrompt = null;

const audio = new Audio();
audio.preload = 'auto';

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
const revealBtn = document.getElementById('revealBtn');
const shareBtn = document.getElementById('shareBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstall');
const shuffleBtn = document.getElementById('shuffleBtn');
const streakCounter = document.getElementById('streakCounter');
const streakNum = document.getElementById('streakNum');

const allButtons = () => [listenSvBtn, listenEnBtn, checkBtn, revealBtn, shareBtn, prevBtn, nextBtn];

async function loadData() {
  try {
    const res = await fetch('glosor-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const allWords = data.words || [];
    // Filtrera bort arkiverade ord (active: false). active !== false = default aktiv.
    words = allWords.filter(w => w.active !== false);
    meta = data.meta || {};
    if (meta.title) titleEl.textContent = meta.title;
    if (meta.subtitle) subtitleEl.textContent = meta.subtitle;
    if (!words.length) throw new Error('Inga glosor i datafilen');
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
  // Slumpa ordning en gång per session
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  totalSpan.textContent = words.length;
  renderProgress();
  updateUI();
  // Spela svenska audio automatiskt vid start
  setTimeout(() => playAudio('sv'), 400);
}

function shuffleWords() {
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  currentIndex = 0;
  updateUI();
  playAudio('sv');
  shuffleBtn.textContent = '✅';
  setTimeout(() => { shuffleBtn.textContent = '🔀 Blanda om'; }, 800);
}

function renderProgress() {
  progressBar.innerHTML = '';
  words.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < currentIndex) dot.classList.add('completed');
    if (i === currentIndex) dot.classList.add('active');
    progressBar.appendChild(dot);
  });
}

function playAudio(lang) {
  const word = words[currentIndex];
  if (!word) return;
  const audioFile = lang === 'en' ? word.audio_en : word.audio_sv;
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function normalize(str) {
  return str.toLowerCase().trim();
}

function checkGuess() {
  const word = words[currentIndex];
  const guess = normalize(guessInput.value);
  if (!guess) {
    feedbackEl.textContent = 'Skriv ditt svar först';
    feedbackEl.className = 'feedback feedback-hint';
    return;
  }
  const correct = normalize(word.en);
  // Acceptera flera alternativ om word.en_alts finns (kommaseparerade)
  const alts = (word.en_alts || '').split(',').map(s => normalize(s)).filter(Boolean);
  const allCorrect = [correct, ...alts];
  if (allCorrect.includes(guess)) {
    feedbackEl.innerHTML = `✓ Rätt! <span class="en-answer">${escapeHtml(word.en)}</span>`;
    feedbackEl.className = 'feedback feedback-correct';
    revealBtn.textContent = '👁 Visa svaret';
    revealed = false;
    streak++;
    streakNum.textContent = streak;
    streakCounter.classList.add('visible');
    streakCounter.classList.remove('pulse');
    void streakCounter.offsetWidth;
    streakCounter.classList.add('pulse');
    setTimeout(() => streakCounter.classList.remove('pulse'), 500);
  } else {
    feedbackEl.innerHTML = `✗ Inte rätt.<br>Du skrev: <strong>${escapeHtml(guessInput.value.trim())}</strong><br>Rätt: <span class="en-answer">${escapeHtml(word.en)}</span>`;
    feedbackEl.className = 'feedback feedback-wrong';
    streak = 0;
    streakCounter.classList.remove('visible');
  }
}

function reveal() {
  const word = words[currentIndex];
  const guess = guessInput.value.trim();
  if (revealed) {
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    revealed = false;
    revealBtn.textContent = '👁 Visa svaret';
    return;
  }
  const userPart = guess ? `Du skrev: <strong>${escapeHtml(guess)}</strong><br>` : '';
  feedbackEl.innerHTML = `${userPart}Svar: <span class="en-answer">${escapeHtml(word.en)}</span>`;
  feedbackEl.className = 'feedback feedback-reveal';
  revealed = true;
  revealBtn.textContent = '🙈 Dölj';
}

function nextWord() {
  if (currentIndex < words.length - 1) {
    const card = document.querySelector('.card');
    card.classList.add('slide-out-left');
    setTimeout(() => {
      currentIndex++;
      updateUI();
      playAudio('sv');
      card.classList.remove('slide-out-left');
      card.classList.add('slide-in');
      setTimeout(() => card.classList.remove('slide-in'), 300);
    }, 250);
  }
}

function prevWord() {
  if (currentIndex > 0) {
    const card = document.querySelector('.card');
    card.classList.add('slide-out-right');
    setTimeout(() => {
      currentIndex--;
      updateUI();
      playAudio('sv');
      card.classList.remove('slide-out-right');
      card.classList.add('slide-in');
      setTimeout(() => card.classList.remove('slide-in'), 300);
    }, 250);
  }
}

async function shareApp() {
  const shareData = {
    title: meta.title || 'Glosor',
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
    shareBtn.textContent = '⚠️ Kunde inte dela';
  }
}

// Events
listenSvBtn.addEventListener('click', () => playAudio('sv'));
listenEnBtn.addEventListener('click', () => playAudio('en'));
checkBtn.addEventListener('click', checkGuess);
revealBtn.addEventListener('click', reveal);
shareBtn.addEventListener('click', shareApp);
nextBtn.addEventListener('click', nextWord);
prevBtn.addEventListener('click', prevWord);

guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) reveal();
    else checkGuess();
  }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nextWord(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prevWord(); }
  else if (e.key === 's' || e.key === 'S') { e.preventDefault(); playAudio('sv'); }
  else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); playAudio('en'); }
  else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); reveal(); }
});

audio.addEventListener('ended', () => {
  audioIndicator.classList.remove('playing');
});

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

dismissInstallBtn?.addEventListener('click', () => {
  installHint.hidden = true;
});

shuffleBtn?.addEventListener('click', shuffleWords);

function updateUI() {
  const word = words[currentIndex];
  currentSpan.textContent = currentIndex + 1;
  revealed = false;
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  guessInput.value = '';
  guessInput.disabled = false;
  revealBtn.textContent = '👁 Visa svaret';
  streak = 0;
  streakCounter.classList.remove('visible');

  if (word) {
    svWordEl.textContent = word.sv;
  }

  audioIndicator.classList.remove('playing', 'error');
  audioIndicator.textContent = '';
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === words.length - 1;
  renderProgress();
  guessInput.focus();
}

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  });
}

loadData();
