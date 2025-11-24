// Quiz Application State
const quizApp = {
    participantName: '',
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    score: 0,
    startTime: null,
    endTime: null,
    leaderboard: [],
    isAdmin: false,
    redeemCodes: {
        rank1: '',
        rank2: '',
        rank3: '',
        rank4: '',
        rank5: '',
    },
    redeemCodesGiven: {
        rank1: false,
        rank2: false,
        rank3: false,
        rank4: false,
        rank5: false,
    },
    redeemRecipients: {
        rank1: null,
        rank2: null,
        rank3: null,
        rank4: null,
        rank5: null,
    },
    siteSettings: {
        welcomeTitle: 'Welcome to Decoder!',
        welcomeSubtitle: 'Test your knowledge and compete with others',
        quizInstructions: 'Read each question carefully and select your answer within 15 seconds.',
    },
    timer: null,
    timeLeft: 15,
    // Cloud sync flag (off by default). Admin can enable and provide Firebase config.
    cloudSyncEnabled: false,
    // When true, the app requires a Firebase Auth sign-in (Google) before participants can start
    // Default is false to allow a quick Gmail-only flow. Admin can toggle this if desired.
    requireAuth: false,
    // When true, require that the Gmail is verified either via Firebase Auth or via API validation before starting the quiz
    enforceVerifiedEmail: false,
    authUser: null,
};

// Expose for UI helpers (ui.js) which may run after this file and expects window.quizApp
if (typeof window !== 'undefined' && !window.quizApp) window.quizApp = quizApp;

// Sample questions
const sampleQuestions = [
    {
        id: 1,
        question: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 2,
    },
    {
        id: 2,
        question: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
        correctAnswer: 1,
    },
    {
        id: 3,
        question: 'What is 2 + 2?',
        options: ['3', '4', '5', '6'],
        correctAnswer: 1,
    },
];

// Initialize App
function initApp() {
    loadFromLocalStorage();
    
    // Load sample questions if none exist
    if (quizApp.questions.length === 0) {
        // Prefer built-in sampleQuestions, but also try to fetch external sample-questions.json
        // Map external file shape to internal shape when necessary
        const applyQuestions = (questionsArray) => {
            if (!Array.isArray(questionsArray) || questionsArray.length === 0) return false;
            // detect common external shapes and map
            const mapped = questionsArray.map((q, idx) => {
                // If already in internal shape
                if (q.question && Array.isArray(q.options) && typeof q.correctAnswer === 'number') {
                    return { id: Date.now() + idx + Math.random(), question: q.question, options: q.options, correctAnswer: q.correctAnswer };
                }

                // sample-questions.json shape: { question, responses, correctAnswerIndex }
                if (q.question && Array.isArray(q.responses) && typeof q.correctAnswerIndex === 'number') {
                    return { id: Date.now() + idx + Math.random(), question: q.question, options: q.responses, correctAnswer: q.correctAnswerIndex };
                }

                // other possible shape: { question, options, answer } where answer may be index or value
                if (q.question && Array.isArray(q.options) && (typeof q.answer === 'number' || typeof q.answer === 'string')) {
                    let correct = typeof q.answer === 'number' ? q.answer : q.options.indexOf(q.answer);
                    if (correct < 0) correct = 0;
                    return { id: Date.now() + idx + Math.random(), question: q.question, options: q.options, correctAnswer: correct };
                }

                // Fallback minimal mapping
                return {
                    id: Date.now() + idx + Math.random(),
                    question: q.question || `Question ${idx + 1}`,
                    options: (q.options || q.responses || ['Option 1','Option 2','Option 3','Option 4']).slice(0,4).concat(['','','','']).slice(0,4),
                    correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : (typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0),
                };
            });

            quizApp.questions = mapped;
            saveToLocalStorage();
            return true;
        };

        // First apply the built-in sampleQuestions
        if (!applyQuestions(sampleQuestions)) {
            // Try to fetch external JSON file located next to the app
            fetch('sample-questions.json')
                .then(res => res.json())
                .then(json => {
                    if (!applyQuestions(json)) {
                        // fallback to built-in
                        quizApp.questions = sampleQuestions;
                        saveToLocalStorage();
                    }
                })
                .catch(err => {
                    console.warn('Could not load external sample-questions.json:', err);
                    // fallback to built-in sampleQuestions
                    quizApp.questions = sampleQuestions;
                    saveToLocalStorage();
                });
        }
    }
    
    // Generate redeem codes if not exists
    if (!quizApp.redeemCodes.rank1) {
        generateAllRedeemCodesInternal();
        saveToLocalStorage();
    }
    
    // Update welcome screen with settings
    updateWelcomeScreen();
    // Update welcome auth UI based on current auth state / requirement
    try { updateWelcomeAuthUI(); } catch (e) {}

    // Detect touch devices and add 'touch' class so we can adjust styles
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        document.documentElement.classList.add('touch');
        // Make extra-large touch targets for primary buttons and interactive elements
        document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(el => {
            el.classList.add('touch-friendly');
        });
    }
    
    // Ensure an admin username exists. If not, set default username to 'jeevan'
    if (!localStorage.getItem('adminUsername')) {
        localStorage.setItem('adminUsername', 'decoder');
        console.info("Admin username defaulting to 'decoder'. Run setAdminUsername('yourName') to change it.");
    }

    // Ensure an admin password exists. If not, set default password to 'jeevuabhi123' (hashed).
    if (!localStorage.getItem('adminPasswordHash')) {
        (async () => {
            try {
                const defaultPassword = 'jeevuabhi123';
                const hash = await sha256Hex(defaultPassword);
                localStorage.setItem('adminPasswordHash', hash);
                console.warn('Default admin password has been set. For security, change it immediately using setAdminPassword("yourNewPassword").');
            } catch (err) {
                console.error('Failed to set default admin password:', err);
            }
        })();
    }

    // Check if admin is already logged in and keep them logged in
    // For security, never automatically restore an admin session on page load.
    // Require password entry every time. Clear any persisted adminAuthenticated flag.
    if (localStorage.getItem('adminAuthenticated') === 'true') {
        localStorage.removeItem('adminAuthenticated');
    }
    quizApp.isAdmin = false;

    // Initialize cloud automatically if a config is present
    try {
        if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) {
            const ok = initCloud();
            if (ok) {
                quizApp.cloudSyncEnabled = true;
                // attempt to load remote state and merge
                cloudLoadAll().catch(() => {});
                // If there's an email link in the URL, handle it (email link sign-in)
                try {
                    if (window.auth) handleEmailSignInLink();
                } catch (e) {}
            }
        }
    } catch (e) {
        // silent
    }

    // Update UI for welcome auth and continue button
    try { updateWelcomeAuthUI(); updateContinueBtnVisibility(); } catch (e) {}
}

// UI helpers for welcome auth state
function updateWelcomeAuthUI() {
    const signInBtn = document.getElementById('google-signin-btn');
    const signOutBtn = document.getElementById('signout-btn');
    const signedInEl = document.getElementById('signed-in-as');
    const startBtn = document.querySelector('#welcome-form button[type="submit"]');
    const emailInput = document.getElementById('email-input');
    const emailLabel = document.querySelector('label[for="email-input"]');

    if (quizApp.requireAuth && window.auth) {
        if (quizApp.authUser) {
            if (signInBtn) signInBtn.classList.add('hidden');
            if (signOutBtn) signOutBtn.classList.remove('hidden');
            if (signedInEl) {
                signedInEl.classList.remove('hidden');
                signedInEl.textContent = `Signed in as ${quizApp.authUser.email}`;
            }
            if (startBtn) startBtn.removeAttribute('disabled');
            if (emailInput) emailInput.classList.add('hidden');
            if (emailLabel) emailLabel.classList.add('hidden');
            // Check server verification state for this user
            try {
                const em = (quizApp.authUser && quizApp.authUser.email) ? quizApp.authUser.email.toLowerCase() : null;
                if (em && window.checkParticipantVerifiedOnServer) {
                    checkParticipantVerifiedOnServer(em).then(r => {
                        const verifiedBadge = document.getElementById('verified-badge');
                        if (r && r.verified) {
                            if (verifiedBadge) { verifiedBadge.classList.remove('hidden'); verifiedBadge.textContent = 'Verified'; }
                        } else {
                            if (verifiedBadge) verifiedBadge.classList.add('hidden');
                        }
                    }).catch(e => {});
                }
            } catch (e) {}
        } else {
            if (signInBtn) signInBtn.classList.remove('hidden');
            if (signOutBtn) signOutBtn.classList.add('hidden');
            if (signedInEl) signedInEl.classList.add('hidden');
            if (startBtn) startBtn.setAttribute('disabled', 'true');
            if (emailInput) emailInput.classList.add('hidden');
            if (emailLabel) emailLabel.classList.add('hidden');
        }
    } else {
        // If auth not required, show sign-in button optionally and keep regular start flow enabled
        if (signInBtn && window.auth) signInBtn.classList.remove('hidden');
        if (signOutBtn) signOutBtn.classList.add('hidden');
        if (signedInEl) signedInEl.classList.add('hidden');
        if (startBtn) startBtn.removeAttribute('disabled');
        // Ensure email input is visible for quick start mode
        if (emailInput) emailInput.classList.remove('hidden');
        if (emailLabel) emailLabel.classList.remove('hidden');
        // Hide verification badge for local-only mode
        const verifiedBadge = document.getElementById('verified-badge');
        if (verifiedBadge) verifiedBadge.classList.add('hidden');
        // If the cloud functions are available and a validator exists, show the API-based validator button
        const apiVerifyBtn = document.getElementById('validate-email-btn');
        if (apiVerifyBtn) {
            if (window.funcs && typeof window.funcs.httpsCallable === 'function') apiVerifyBtn.classList.remove('hidden'); else apiVerifyBtn.classList.add('hidden');
        }
    }
}

function updateContinueBtnVisibility() {
    const continueBtn = document.getElementById('continue-btn');
    const stored = localStorage.getItem('participantEmail') || '';
    if (!stored) { if (continueBtn) continueBtn.classList.add('hidden'); return; }
    const email = stored.trim().toLowerCase();
    if (quizApp.requireAuth && quizApp.authUser) {
        if ((quizApp.authUser.email || '').toLowerCase() === email) {
            if (continueBtn) continueBtn.classList.remove('hidden');
            return;
        }
        if (continueBtn) continueBtn.classList.add('hidden');
        return;
    }
    if (continueBtn) continueBtn.classList.remove('hidden');
}

// Sign-in and out helpers
function signInWithGoogle() {
    // Cloud Auth is disabled in local-only mode. Inform the user and suggest local Gmail flow.
    alert('Google sign-in is unavailable — this copy runs in local-only mode. Please enter your Gmail and start the quiz.');
}

function signOutGoogle() {
    // No-op in local-only mode
    alert('Sign-out is unavailable in local-only mode.');
}

// Email link (magic link) verification flow
async function sendEmailVerificationLink() {
    const emailInput = document.getElementById('email-input');
    if (!emailInput) return alert('Email input not found');
    const email = (emailInput.value || '').toString().trim().toLowerCase();
    if (!email) return alert('Please enter your Gmail address to receive verification link');
    if (!window.auth) {
        // Cloud/Auth not available. Fall back to a local verification flow so users can continue.
        // Mark the entered Gmail as the participant email locally and show the verified badge.
        try {
            const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
            if (!gmailRegex.test(email)) return alert('Please enter a valid Gmail address (example: you@gmail.com)');
            quizApp.participantEmail = email;
            localStorage.setItem('participantEmail', quizApp.participantEmail);
            const verifiedBadge = document.getElementById('verified-badge');
            if (verifiedBadge) { verifiedBadge.classList.remove('hidden'); verifiedBadge.textContent = 'Verified (local)'; }
            updateWelcomeAuthUI(); updateContinueBtnVisibility();
            alert('Email marked verified locally. You can now start the quiz.');
        } catch (err) {
            console.error('Local verification fallback failed', err);
            return alert('Verification failed. Please try again later.');
        }
        return;
    }
    // Use action code settings: return to current location
    const actionCodeSettings = {
        url: window.location.href,
        handleCodeInApp: true,
    };
    try {
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
        localStorage.setItem('emailToVerify', email);
        const verifyHelp = document.getElementById('verify-help');
        if (verifyHelp) verifyHelp.classList.remove('hidden');
        alert('Verification link sent. Check your inbox and click the link to sign in.');
    } catch (err) {
        console.error('Failed to send sign-in link', err);
        alert('Failed to send sign-in link. Please try again or enable Google sign-in.');
    }
}

// Handle incoming email link signins
async function handleEmailSignInLink() {
    if (!window.auth) return;
    const href = window.location.href;
    try {
        if (auth.isSignInWithEmailLink(href)) {
            // We try to get email from localStorage
            let email = localStorage.getItem('emailToVerify') || '';
            if (!email) {
                email = prompt('Enter your email to confirm sign-in (same one you requested):');
            }
            if (!email) return;
            // Sign in with link
            const result = await auth.signInWithEmailLink(email, href);
            quizApp.authUser = result.user;
            quizApp.participantEmail = (result.user && result.user.email) ? result.user.email.toLowerCase() : email.toLowerCase();
            localStorage.setItem('participantEmail', quizApp.participantEmail);
            // Clean up
            localStorage.removeItem('emailToVerify');
            // Update UI
            updateWelcomeAuthUI();
            updateContinueBtnVisibility();
            // If cloud and functions available, verify participant on server
            try {
                if (window.verifyParticipantEmailOnServer) {
                    await verifyParticipantEmailOnServer(quizApp.participantEmail);
                }
            } catch (e) { console.warn('Server verification failed', e); }
            alert('Signed in via email link successfully. You can now start the quiz.');
        }
    } catch (err) {
        console.error('Email link sign-in failed', err);
    }
}

// Expose helpers
if (typeof window !== 'undefined') {
    window.signInWithGoogle = signInWithGoogle;
    window.signOutGoogle = signOutGoogle;
}

// Validate email via API provider without requiring Google sign-in
async function validateParticipantEmailWithoutAuth() {
    const emailInput = document.getElementById('email-input');
    if (!emailInput) return alert('Email input not found');
    const email = (emailInput.value || '').toString().trim().toLowerCase();
    if (!email) return alert('Please enter your Gmail address to validate');
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(email)) return alert('Please enter a valid Gmail address (example: you@gmail.com)');
    // If server-side validator is not available, fall back to local mark so users aren't blocked.
    if (!window.validateEmailViaApiOnServer) {
        quizApp.participantEmail = email;
        localStorage.setItem('participantEmail', quizApp.participantEmail);
        const verifiedBadge = document.getElementById('verified-badge');
        if (verifiedBadge) { verifiedBadge.classList.remove('hidden'); verifiedBadge.textContent = 'Verified (local)'; }
        updateContinueBtnVisibility();
        alert('Email marked verified locally. You can now start the quiz.');
        return;
    }
    try {
        const result = await validateEmailViaApiOnServer(email, true);
        if (result && result.valid) {
            quizApp.participantEmail = email;
            localStorage.setItem('participantEmail', quizApp.participantEmail);
            // Show verified badge
            const verifiedBadge = document.getElementById('verified-badge');
            if (verifiedBadge) { verifiedBadge.classList.remove('hidden'); verifiedBadge.textContent = 'Verified'; }
            updateContinueBtnVisibility();
            alert('Email validated and marked verified on the server. You can now start the quiz.');
        } else {
            alert('Email validation failed. Please ensure the email exists or use Google sign-in.');
        }
    } catch (err) {
        console.error('Validation failed', err);
        alert('Validation failed. Try again later.');
    }
}

if (typeof window !== 'undefined') window.validateParticipantEmailWithoutAuth = validateParticipantEmailWithoutAuth;

// Update admin status indicator
function updateAdminStatusIndicator() {
    const adminStatus = document.getElementById('admin-status');
    if (adminStatus) {
        if (quizApp.isAdmin) {
            adminStatus.classList.remove('hidden');
        } else {
            adminStatus.classList.add('hidden');
        }
    }
}

// LocalStorage functions
function saveToLocalStorage() {
    localStorage.setItem('quizQuestions', JSON.stringify(quizApp.questions));
    localStorage.setItem('quizLeaderboard', JSON.stringify(quizApp.leaderboard));
    localStorage.setItem('quizSettings', JSON.stringify(quizApp.siteSettings));
    localStorage.setItem('quizRedeemCodes', JSON.stringify(quizApp.redeemCodes));
    localStorage.setItem('redeemCodesGiven', JSON.stringify(quizApp.redeemCodesGiven));
    localStorage.setItem('redeemRecipients', JSON.stringify(quizApp.redeemRecipients));
}

function loadFromLocalStorage() {
    const storedQuestions = localStorage.getItem('quizQuestions');
    const storedLeaderboard = localStorage.getItem('quizLeaderboard');
    const storedSettings = localStorage.getItem('quizSettings');
    const storedRedeemCodes = localStorage.getItem('quizRedeemCodes');
    const storedRedeemCodesGiven = localStorage.getItem('redeemCodesGiven');
    const storedRedeemRecipients = localStorage.getItem('redeemRecipients');
    
    if (storedQuestions) quizApp.questions = JSON.parse(storedQuestions);
    if (storedLeaderboard) quizApp.leaderboard = JSON.parse(storedLeaderboard);
    if (storedSettings) quizApp.siteSettings = JSON.parse(storedSettings);
    if (storedRedeemCodes) quizApp.redeemCodes = JSON.parse(storedRedeemCodes);
    if (storedRedeemCodesGiven) quizApp.redeemCodesGiven = JSON.parse(storedRedeemCodesGiven);
    if (storedRedeemRecipients) quizApp.redeemRecipients = JSON.parse(storedRedeemRecipients);
    
    // Migrate old single redeem code to new system if exists
    const oldRedeemCode = localStorage.getItem('quizRedeemCode');
    if (oldRedeemCode && !quizApp.redeemCodes.rank1) {
        quizApp.redeemCodes.rank1 = oldRedeemCode;
        generateAllRedeemCodesInternal();
        saveToLocalStorage();
        localStorage.removeItem('quizRedeemCode');
        localStorage.removeItem('redeemCodeGiven');
    }
}

/* -----------------------
   Cloud integration removed
   The project has been converted to local-only mode: Firebase / Cloud Functions / Firestore
   references have been removed. To keep existing UI checks functional, provide lightweight
   stubs for cloud helper functions so the app falls back to localStorage-only behavior.
   ----------------------- */

// Cloud disabled stub config
const FIREBASE_CONFIG = null;

function initCloud() {
    // Cloud features are disabled in this copy. This function is intentionally a no-op.
    console.info('Cloud features are disabled. Running in local-only mode.');
    window.db = null;
    window.funcs = null;
    window.auth = null;
    return false;
}

// Stubs for server-side helpers (return safe fallbacks so calling code can handle gracefully)
async function validateEmailViaApiOnServer(email, markVerified = true) {
    // Cloud validation not available
    return { valid: false, reason: 'cloud-disabled' };
}

async function verifyParticipantEmailOnServer(email) {
    return { ok: false, error: 'cloud-disabled' };
}

async function checkParticipantVerifiedOnServer(email) {
    return { verified: false };
}

async function submitResultToServer(entry) {
    // No-op: cloud submission disabled — caller should fall back to local persistence
    return { status: 'local', entry };
}

async function assignRedeemOnServer(email) {
    return { assigned: false, reason: 'cloud-disabled' };
}

async function registerParticipantToServer(data) {
    // Return allowed so client can continue local flow
    return { status: 'created' };
}

// Expose stubs to window for compatibility
if (typeof window !== 'undefined') {
    window.initCloud = initCloud;
    window.validateEmailViaApiOnServer = validateEmailViaApiOnServer;
    window.verifyParticipantEmailOnServer = verifyParticipantEmailOnServer;
    window.checkParticipantVerifiedOnServer = checkParticipantVerifiedOnServer;
    window.submitResultToServer = submitResultToServer;
    window.assignRedeemOnServer = assignRedeemOnServer;
    window.registerParticipantToServer = registerParticipantToServer;
    window.cloudSaveQuizResult = async function () { return Promise.reject(new Error('cloud-disabled')); };
    window.cloudSaveAll = async function () { return Promise.reject(new Error('cloud-disabled')); };
    window.cloudLoadAll = async function () { return Promise.reject(new Error('cloud-disabled')); };
    window.migrateLocalToCloud = async function () { return Promise.reject(new Error('cloud-disabled')); };
}

// Register a participant at start (optional server-side registration; can help block attempts earlier)
async function registerParticipantToServer(data) {
    if (window.funcs && typeof window.funcs.httpsCallable === 'function') {
        try {
            const callable = window.funcs.httpsCallable('registerParticipant');
            const resp = await callable(data);
            return resp.data || resp;
        } catch (err) {
            console.error('Error calling registerParticipant', err);
            throw err;
        }
    }
    // If functions not available, return an object indicating local allow
    return { status: 'created' };
}

if (typeof window !== 'undefined') {
    window.registerParticipantToServer = registerParticipantToServer;
}

// Expose helper for admin (console) to save a single result to cloud for testing
if (typeof window !== 'undefined') {
    window.cloudSaveQuizResult = cloudSaveQuizResult;
}

function cloudSaveAll() {
    // Cloud disabled - provide a rejecting stub so callers fall back to local-only behavior
    return Promise.reject(new Error('cloud-disabled'));
}

function cloudLoadAll() {
    // Cloud disabled - provide a rejecting stub so callers fall back to local-only behavior
    return Promise.reject(new Error('cloud-disabled'));
}

function migrateLocalToCloud(dryRun = true) {
    // Cloud disabled - return a preview for dryRun, otherwise reject
    const preview = {
        questions: quizApp.questions.length,
        leaderboard: quizApp.leaderboard.length,
        redeemCodes: Object.keys(quizApp.redeemCodes).length,
    };
    if (dryRun) {
        console.info('Migration preview (cloud disabled):', preview);
        return Promise.resolve(preview);
    }
    return Promise.reject(new Error('cloud-disabled'));
}

// Expose helpers for the admin via console
if (typeof window !== 'undefined') {
    window.initCloud = initCloud;
    window.cloudSaveAll = cloudSaveAll;
    window.cloudLoadAll = cloudLoadAll;
    window.migrateLocalToCloud = migrateLocalToCloud;
}

// Generate all 5 redeem codes (internal helper)
function generateAllRedeemCodesInternal() {
    if (!quizApp.redeemCodes.rank1) quizApp.redeemCodes.rank1 = 'RANK1' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!quizApp.redeemCodes.rank2) quizApp.redeemCodes.rank2 = 'RANK2' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!quizApp.redeemCodes.rank3) quizApp.redeemCodes.rank3 = 'RANK3' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!quizApp.redeemCodes.rank4) quizApp.redeemCodes.rank4 = 'RANK4' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!quizApp.redeemCodes.rank5) quizApp.redeemCodes.rank5 = 'RANK5' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// --- Admin security helpers ---
async function sha256Hex(str) {
    // Uses the Web Crypto API to hash the string and return hex digest
    if (!str) return '';
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await (crypto.subtle || crypto.webkitSubtle).digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Set admin password (console utility). Usage: setAdminPassword('your-strong-password')
window.setAdminPassword = async function(password) {
    if (!password || typeof password !== 'string') {
        console.error('Password must be a non-empty string');
        return;
    }
    const hash = await sha256Hex(password);
    localStorage.setItem('adminPasswordHash', hash);
    // Reset any failed login counters
    localStorage.removeItem('adminLoginFailures');
    localStorage.removeItem('adminLockExpiry');
    console.info('Admin password has been set. You can now log in using the Admin Login (Ctrl+Shift+A).');
}

// Clear admin password (console utility)
window.clearAdminPassword = function() {
    localStorage.removeItem('adminPasswordHash');
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminLoginFailures');
    localStorage.removeItem('adminLockExpiry');
    quizApp.isAdmin = false;
    updateAdminStatusIndicator();
    console.info('Admin password cleared and logged out.');
}

// Get admin username (stored or default 'jeevan')
function getAdminUsername() {
    return localStorage.getItem('adminUsername') || 'jeevan';
}

// Set admin username (console utility). Usage: setAdminUsername('jeevan')
window.setAdminUsername = function(username) {
    if (!username || typeof username !== 'string') {
        console.error('Username must be a non-empty string');
        return;
    }
    const trimmed = username.trim();
    if (trimmed.length === 0) {
        console.error('Username must not be empty');
        return;
    }
    localStorage.setItem('adminUsername', trimmed);
    console.info(`Admin username set to '${trimmed}'. Use this username when logging in.`);
};

// (generateAllRedeemCodes is implemented later near admin-redeem settings to keep all admin helpers in one place)

// Update welcome screen with settings
function updateWelcomeScreen() {
    document.getElementById('welcome-title').textContent = quizApp.siteSettings.welcomeTitle || 'Welcome to Decoder!';
    document.getElementById('welcome-subtitle').textContent = quizApp.siteSettings.welcomeSubtitle || 'Test your knowledge and compete with others';
    document.getElementById('quiz-instructions').textContent = quizApp.siteSettings.quizInstructions || 'Read each question carefully and select your answer within 15 seconds.';
}

// Welcome Screen
document.getElementById('welcome-form').addEventListener('submit', (e) => {
    e.preventDefault();
    // If the app requires Auth we must have authUser (ensure cloud and auth enabled)
    if (quizApp.requireAuth) {
        if (!quizApp.authUser) {
            alert('Please sign in with Google before starting the quiz.');
            return;
        }
    }
    // If not using Auth, or as fallback, use email input value (normalize to lower case)
    const emailInputEl = document.getElementById('email-input');
    const email = (emailInputEl && !emailInputEl.classList.contains('hidden')) ? (emailInputEl.value || '').trim().toLowerCase() : (quizApp.authUser ? (quizApp.authUser.email || '').toLowerCase() : '');
    // simple gmail validation if we have an email (fallback for non-auth flow)
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (email && !gmailRegex.test(email)) {
        alert('Please enter a valid Gmail address (example: you@gmail.com)');
        return;
    }
    // Prevent same gmail from retaking within 48 hours. Allow retake after 48h.
    const cooldownMs = 48 * 60 * 60 * 1000; // 48 hours
    const matches = quizApp.leaderboard.filter(l => ((l.email || l.name || '').toString().toLowerCase() === email));
    if (matches.length > 0) {
        // Find most recent participation
        const latest = matches.reduce((a, b) => ((a.timestamp || 0) > (b.timestamp || 0) ? a : b));
        const lastTs = latest.timestamp || 0;
        const age = Date.now() - lastTs;
        // Allow exception for a specific repeated participant
        const exemptEmail = 'jeevu2502006@gmail.com';
        if (email && email.toLowerCase() === exemptEmail) {
            // exempt: allow retake regardless of cooldown
        } else if (age < cooldownMs) {
            const remaining = cooldownMs - age;
            const hrs = Math.floor(remaining / (1000 * 60 * 60));
            const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
            return;
        }
    }
    // If the app enforces verified email, ensure it's verified (via server flag or API validation)
    const maybeStart = async () => {
        localStorage.setItem('participantEmail', email);
        quizApp.participantEmail = email;
        startQuiz(email);
    };

    if (quizApp.enforceVerifiedEmail) {
        ensureEmailVerifiedBeforeStart(email).then(ok => {
            if (ok) maybeStart();
        }).catch(err => {
            console.warn('Email verify before start failed', err);
        });
    } else {
        localStorage.setItem('participantEmail', email);
        quizApp.participantEmail = email;
        startQuiz(email);
    }
});

// Continue as previous quick access
function continueAsPrevious() {
    const stored = localStorage.getItem('participantEmail');
    if (!stored) return;
    const email = stored.trim().toLowerCase();
    // If auth is required, ensure auth user matches stored email
    if (quizApp.requireAuth && quizApp.authUser && quizApp.authUser.email.toLowerCase() !== email) {
        alert('Please sign in with the same Google account used previously to continue.');
        return;
    }
    // Check 48h cooldown same as welcome flow
    const cooldownMs = 48 * 60 * 60 * 1000;
    const matches = quizApp.leaderboard.filter(l => ((l.email || l.name || '').toString().toLowerCase() === email));
    if (matches.length > 0) {
        const latest = matches.reduce((a, b) => ((a.timestamp || 0) > (b.timestamp || 0) ? a : b));
        const lastTs = latest.timestamp || 0;
        const age = Date.now() - lastTs;
        // Allow exception for a specific repeated participant
        const exemptEmail = 'jeevu2502006@gmail.com';
        if (email && email.toLowerCase() === exemptEmail) {
            // exempt: allow retake regardless of cooldown
        } else if (age < cooldownMs) {
            const remaining = cooldownMs - age;
            const hrs = Math.floor(remaining / (1000 * 60 * 60));
            const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
            return;
        }
    }
    // set input value and start
    const input = document.getElementById('email-input');
    if (input) input.value = email;
    quizApp.participantEmail = email;
    startQuiz(email);
}

async function startQuiz(name) {
    // If the provided name is an email, ensure it hasn't participated within the cooldown period
    const normalized = (name || '').toString().trim().toLowerCase();
    if (normalized) {
        // Local-only cooldown check (48 hours)
        const cooldownMs = 48 * 60 * 60 * 1000; // 48 hours
        const matches = quizApp.leaderboard.filter(l => ((l.email || l.name || '').toString().toLowerCase() === normalized));
        if (matches.length > 0) {
            const latest = matches.reduce((a, b) => ((a.timestamp || 0) > (b.timestamp || 0) ? a : b));
            const lastTs = latest.timestamp || 0;
            const age = Date.now() - lastTs;
            // Allow exception for a specific repeated participant
            const exemptEmail = 'jeevu2502006@gmail.com';
            if (normalized === exemptEmail) {
                // exempt: allow retake regardless of cooldown
            } else if (age < cooldownMs) {
                const remaining = cooldownMs - age;
                const hrs = Math.floor(remaining / (1000 * 60 * 60));
                const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
                return;
            }
        }
    }

    // If user is signed in and has a display name, prefer that for display; otherwise use the provided name/email
    quizApp.participantName = (quizApp.authUser && quizApp.authUser.displayName) ? quizApp.authUser.displayName : name;
    // If cloud sync enabled, try to register participant server-side to enforce start cooldowns early
    if (quizApp.cloudSyncEnabled && typeof registerParticipantToServer === 'function') {
        try {
            const reg = await registerParticipantToServer({
                email: (quizApp.participantEmail || name || '').toString().toLowerCase(),
                userId: quizApp.authUser ? quizApp.authUser.uid : null,
                displayName: quizApp.authUser ? quizApp.authUser.displayName : null,
            });
            if (reg && reg.status === 'cooldown') {
                const remaining = Math.max(0, (48 * 3600 * 1000) - (Date.now() - (reg.lastTs || 0)));
                const hrs = Math.floor(remaining / (1000 * 60 * 60));
                const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
                return;
            }
        } catch (err) {
            console.warn('Participant registration failed (cloud), falling back to local flow', err);
        }
    }
    quizApp.currentQuestionIndex = 0;
    quizApp.answers = [];
    quizApp.score = 0;
    quizApp.startTime = Date.now();
    quizApp.endTime = null;
    
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    
    loadQuestion();
}

// Quiz Screen
function loadQuestion() {
    const question = quizApp.questions[quizApp.currentQuestionIndex];
    if (!question) {
        finishQuiz();
        return;
    }
    
    // Update progress
    const progress = ((quizApp.currentQuestionIndex + 1) / quizApp.questions.length) * 100;
    document.getElementById('question-counter').textContent = `Question ${quizApp.currentQuestionIndex + 1} of ${quizApp.questions.length}`;
    document.getElementById('progress-percent').textContent = `${Math.round(progress)}%`;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    
    // Update question text
    document.getElementById('question-text').textContent = question.question;
    
    // Create options
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        // Add relative/overflow-hidden so we can position the recording badge inside
        button.className = 'relative overflow-hidden w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 cursor-pointer active:scale-[0.98]';
        button.innerHTML = `<span class="text-gray-900 font-medium">${option}</span>`;
        // pass the event so we can animate the clicked button
        button.onclick = (e) => handleOptionSelect(e, index);
        optionsContainer.appendChild(button);
    });
    
    // Reset timer
    resetTimer();
}

function resetTimer() {
    clearInterval(quizApp.timer);
    quizApp.timeLeft = 15;
    
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');
    const timerIcon = document.getElementById('timer-icon');
    
    timerText.textContent = `${quizApp.timeLeft}s`;
    timerBar.style.width = '100%';
    timerIcon.className = 'w-5 h-5 text-blue-500';
    timerBar.className = 'h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-linear rounded-full';
    
    quizApp.timer = setInterval(() => {
        quizApp.timeLeft--;
        const progress = (quizApp.timeLeft / 15) * 100;
        
        timerText.textContent = `${quizApp.timeLeft}s`;
        timerBar.style.width = `${progress}%`;
        
        if (quizApp.timeLeft <= 5) {
            timerText.className = 'text-lg font-bold text-red-600';
            timerIcon.className = 'w-5 h-5 text-red-500 animate-pulse';
            timerBar.className = 'h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-1000 ease-linear rounded-full';
        }
        
        if (quizApp.timeLeft <= 0) {
            clearInterval(quizApp.timer);
            handleTimeUp();
        }
    }, 1000);
}

function handleTimeUp() {
    clearInterval(quizApp.timer);
    showFeedback(false, 'Time Up!');
    submitAnswer(-1);
    
    setTimeout(() => {
        nextQuestion();
    }, 2000);
}

function handleOptionSelect(event, index) {
    clearInterval(quizApp.timer);

    const question = quizApp.questions[quizApp.currentQuestionIndex];
    // Disable all options but DO NOT reveal which is correct while the quiz is operating
    const options = document.querySelectorAll('#options-container button');
    options.forEach((btn) => {
        btn.disabled = true;
        btn.classList.remove('hover:border-blue-300', 'hover:bg-blue-50', 'cursor-pointer');
        btn.classList.add('cursor-not-allowed', 'opacity-80');
    });

    // Animate the clicked button with a recording badge
    try {
        const clickedBtn = event?.currentTarget || options[index];
        if (clickedBtn) {
            clickedBtn.classList.add('selected-recording');
            // create badge
            const badge = document.createElement('div');
            badge.className = 'recorded-badge';
            badge.innerHTML = `<span class="dot" aria-hidden></span><span>Answer recorded</span>`;
            // set contrasting bg if button bg is light
            badge.style.background = 'linear-gradient(90deg, rgba(59,130,246,0.95), rgba(99,102,241,0.95))';
            clickedBtn.appendChild(badge);
            // Remove badge after short time to keep DOM clean (it will be replaced when loading next question)
            setTimeout(() => {
                try { clickedBtn.classList.remove('selected-recording'); } catch (e) {}
                try { if (badge && badge.parentNode) badge.parentNode.removeChild(badge); } catch (e) {}
            }, 1200);
        }
    } catch (e) {
        // ignore animation errors
    }

    // Neutral feedback (do not reveal correctness during the quiz)
    showFeedback(null, 'Answer recorded');
    submitAnswer(index);

    // Proceed to next question quickly
    setTimeout(() => {
        nextQuestion();
    }, 800);
}

function showFeedback(isCorrect, message) {
    const feedback = document.getElementById('feedback-message');
    const feedbackIcon = document.getElementById('feedback-icon');
    const feedbackText = document.getElementById('feedback-text');
    // Neutral/positive/negative styling. If isCorrect is null -> neutral gray
    let bgClass = 'bg-gray-700';
    let icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01"></path></svg>';
    if (isCorrect === true) { bgClass = 'bg-green-500'; icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"></path></svg>'; }
    if (isCorrect === false) { bgClass = 'bg-red-500'; icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'; }

    feedback.className = `fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up ${bgClass} text-white`;
    feedbackIcon.innerHTML = icon;

    feedbackText.textContent = message;
    feedback.classList.remove('hidden');

    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 1400);
}

function submitAnswer(selectedIndex) {
    const question = quizApp.questions[quizApp.currentQuestionIndex];
    const isCorrect = selectedIndex === question.correctAnswer;
    
    quizApp.answers.push({
        questionId: question.id,
        selectedIndex,
        isCorrect,
        timeSpent: 15 - quizApp.timeLeft,
    });
    
    if (isCorrect) {
        quizApp.score++;
    }
}

function nextQuestion() {
    if (quizApp.currentQuestionIndex < quizApp.questions.length - 1) {
        quizApp.currentQuestionIndex++;
        loadQuestion();
    } else {
        finishQuiz();
    }
}

async function finishQuiz() {
    quizApp.endTime = Date.now();
    const timeTaken = Math.floor((quizApp.endTime - quizApp.startTime) / 1000);
    
    const newEntry = {
        id: Date.now(),
        name: quizApp.participantName,
        // store email explicitly from runtime state if available, fall back to participantName
        email: (quizApp.participantEmail || quizApp.participantName || '').toString().toLowerCase(),
        userId: (quizApp.authUser && quizApp.authUser.uid) ? quizApp.authUser.uid : null,
        displayName: (quizApp.authUser && quizApp.authUser.displayName) ? quizApp.authUser.displayName : null,
        score: quizApp.score,
        totalQuestions: quizApp.questions.length,
        timeTaken,
        timestamp: Date.now(),
    };
    
    // Decide whether to persist to cloud (if enabled) or to local storage
    const normalizedEmail = (newEntry.email || '').toString().toLowerCase();
    const existingIndex = quizApp.leaderboard.findIndex(entry => ((entry.email || entry.name || '').toString().toLowerCase() === normalizedEmail));

    if (quizApp.cloudSyncEnabled && typeof submitResultToServer === 'function') {
        try {
            const cloudRes = await submitResultToServer(newEntry);
            if (cloudRes && (cloudRes.status === 'created' || cloudRes.status === 'updated')) {
                // Update local to reflect what the cloud accepted
                if (existingIndex !== -1) quizApp.leaderboard[existingIndex] = newEntry; else quizApp.leaderboard.push(newEntry);
            } else if (cloudRes && cloudRes.status === 'cooldown') {
                const remaining = Math.max(0, (48 * 3600 * 1000) - (Date.now() - (cloudRes.lastTs || 0)));
                const hrs = Math.floor(remaining / (1000 * 60 * 60));
                const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
                // Update local timestamp for existing record if present
                if (existingIndex !== -1) quizApp.leaderboard[existingIndex].timestamp = (cloudRes.lastTs || quizApp.leaderboard[existingIndex].timestamp);
                // Skip further local recording
            } else if (cloudRes && cloudRes.status === 'noop') {
                if (existingIndex !== -1) quizApp.leaderboard[existingIndex].timestamp = (cloudRes.existing?.timestamp || quizApp.leaderboard[existingIndex].timestamp);
            }
        } catch (err) {
            // If cloud fails, fall back to local storage behavior and still record the result locally
            console.warn('Cloud save failed, falling back to local behavior', err);
            if (existingIndex !== -1) {
                const existing = quizApp.leaderboard[existingIndex];
                const shouldReplace = (newEntry.score > existing.score) || (newEntry.score === existing.score && newEntry.timeTaken < existing.timeTaken);
                if (shouldReplace) quizApp.leaderboard[existingIndex] = newEntry;
                else quizApp.leaderboard[existingIndex].timestamp = newEntry.timestamp;
            } else {
                quizApp.leaderboard.push(newEntry);
            }
        }
    } else {
        // Local-only upsert
        if (existingIndex !== -1) {
            const existing = quizApp.leaderboard[existingIndex];
            const shouldReplace = (newEntry.score > existing.score) || (newEntry.score === existing.score && newEntry.timeTaken < existing.timeTaken);
            if (shouldReplace) quizApp.leaderboard[existingIndex] = newEntry;
            else quizApp.leaderboard[existingIndex].timestamp = newEntry.timestamp;
        } else {
            quizApp.leaderboard.push(newEntry);
        }
    }

    // Sorting helps determine ranks globally; showLeaderboard will display only the top 10.
    quizApp.leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeTaken - b.timeTaken;
    });

    // Try to persist to cloud (Firestore) when configured. We use a transaction to ensure atomic
    // checks for duplicates and cooldown enforcement server-side. If cloud isn't enabled, fall back
    // to local storage behavior.
    if (quizApp.cloudSyncEnabled && typeof cloudSaveQuizResult === 'function') {
        try {
            const cloudRes = await cloudSaveQuizResult(newEntry);
            if (cloudRes && (cloudRes.status === 'created' || cloudRes.status === 'updated')) {
                // Replace/insert local copy to match cloud
                const idx = quizApp.leaderboard.findIndex(e => ((e.email || e.name || '').toString().toLowerCase() === normalizedEmail));
                if (idx !== -1) quizApp.leaderboard[idx] = newEntry; else quizApp.leaderboard.push(newEntry);
                quizApp.leaderboard.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken));
            } else if (cloudRes && cloudRes.status === 'cooldown') {
                // If cloud transaction indicates cooldown, show message and do not persist locally
                const remaining = Math.max(0, (48 * 3600 * 1000) - (Date.now() - (cloudRes.lastTs || 0)));
                const hrs = Math.floor(remaining / (1000 * 60 * 60));
                const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                alert(`This Gmail has already taken the quiz. You can retake after ${hrs}h ${mins}m.`);
                // Update local leaderboard timestamp for the participant if exists
                if (existingIndex !== -1) quizApp.leaderboard[existingIndex].timestamp = (cloudRes.lastTs || quizApp.leaderboard[existingIndex].timestamp);
            } else {
                // noop — either cloud said no update required, or unexpected return. Keep local behavior.
            }
        } catch (err) {
            // Cloud write failed - keep local behavior but log.
            console.warn('Cloud save failed; falling back to local leaderboard only', err);
        }
    }
    
    saveToLocalStorage();
    // Attempt to let the server assign redeem codes atomically if funcs are available
    try {
        if (quizApp.cloudSyncEnabled && window.assignRedeemOnServer) {
            const assignRes = await assignRedeemOnServer(normalizedEmail);
            if (assignRes && (assignRes.assigned === true || assignRes.assigned)) {
                const rank = assignRes.rank || assignRes.assignedRank || null;
                if (rank) {
                    // update local UI state to reflect server assignment
                    const rankKey = `rank${rank}`;
                    quizApp.redeemCodesGiven[rankKey] = true;
                    quizApp.redeemRecipients[rankKey] = normalizedEmail;
                    saveToLocalStorage();
                    if ((quizApp.participantEmail || '').toString().toLowerCase() === normalizedEmail) {
                        setTimeout(() => { showRedeemModal(rank); }, 600);
                    }
                }
            }
        }
    } catch (err) {
        console.warn('assignRedeemOnServer failed', err);
    }

    showSummary();
}

// Summary Screen
function showSummary() {
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('summary-screen').classList.remove('hidden');
    
    const totalQuestions = quizApp.questions.length;
    const correctAnswers = quizApp.score;
    const wrongAnswers = totalQuestions - correctAnswers;
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);
    const isPerfectScore = correctAnswers === totalQuestions;
    
    // Update score display
    document.getElementById('score-percentage').textContent = `${percentage}%`;
    document.getElementById('correct-count').textContent = correctAnswers;
    document.getElementById('wrong-count').textContent = wrongAnswers;
    
    // Update rank
    const sortedLeaderboard = [...quizApp.leaderboard].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeTaken - b.timeTaken;
    });

    // Determine current rank by matching email or name (handles migrated/older entries).
    // Use normalized comparisons (lowercase strings) to avoid mismatches.
    const currentRank = sortedLeaderboard.findIndex(entry => ((entry.email || entry.name || '').toString().toLowerCase() === (quizApp.participantName || '').toString().toLowerCase())) + 1 || sortedLeaderboard.length + 1;
    document.getElementById('rank-number').textContent = `#${currentRank}`;
    
    // Update title
    document.getElementById('summary-title').textContent = `Decoder Complete, ${quizApp.participantName}!`;
    
    // Update icon for perfect score
    if (isPerfectScore) {
        document.getElementById('summary-icon').className = 'bg-gradient-to-r from-yellow-400 to-yellow-500 p-4 rounded-full animate-pulse';
    }
    
    // Show answer review
    showAnswerReview();

    // Hide the "Play Again" button to prevent immediate replay from the summary screen
    try {
        const playBtn = document.getElementById('play-again-btn');
        if (playBtn) playBtn.classList.add('hidden');
    } catch (e) {
        // ignore
    }
    
    // Award redeem codes to the top 5 perfect scorers for this quiz (based on the current totalQuestions)
    if (isPerfectScore) {
        const assigned = awardRedeemCodesToTopPerfectScorers();
        // If this participant was assigned a redeem rank, show the redeem modal
        if (assigned && assigned.assignedRankForCurrentUser) {
            saveToLocalStorage();
            setTimeout(() => { showRedeemModal(assigned.assignedRankForCurrentUser); }, 1000);
        }
    }
}

function showAnswerReview() {
    const container = document.getElementById('answer-review');
    container.innerHTML = '';
    
    quizApp.questions.forEach((question, index) => {
        const answer = quizApp.answers[index];
        const isCorrect = answer?.isCorrect;
        
        const reviewItem = document.createElement('div');
        reviewItem.className = `p-4 rounded-xl border-2 ${
            isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        }`;
        
        const icon = isCorrect
            ? '<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            : '<svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        
        let optionsHtml = '';
        question.options.forEach((option, optIndex) => {
            const isSelected = answer?.selectedIndex === optIndex;
            const isCorrectAnswer = optIndex === question.correctAnswer;
            
            let className = 'text-sm text-gray-600';
            let prefix = '';
            
            if (isCorrectAnswer) {
                className = 'text-sm text-green-700 font-semibold';
                prefix = '✓ ';
            } else if (isSelected && !isCorrectAnswer) {
                className = 'text-sm text-red-700 font-semibold';
                prefix = '✗ ';
            }
            
            optionsHtml += `<div class="${className}">${prefix}${option}</div>`;
        });
        
        reviewItem.innerHTML = `
            <div class="flex items-start gap-3 mb-2">
                ${icon}
                <p class="font-medium text-gray-900 flex-1">${question.question}</p>
            </div>
            <div class="ml-8 space-y-1">
                ${optionsHtml}
            </div>
        `;
        
        container.appendChild(reviewItem);
    });
}

// Redeem Modal
function showRedeemModal(rank = 1) {
    const rankKey = `rank${rank}`;
    const code = quizApp.redeemCodes[rankKey] || '';
    document.getElementById('redeem-code').textContent = code;
    const awardText = (rank >= 1 && rank <= 5) ? `🏅 Rank #${rank}` : 'Perfect Score';
    document.getElementById('redeem-code-text').textContent = `Congratulations! ${awardText}! Here's your redeem code:`;
    document.getElementById('redeem-modal').setAttribute('data-rank', rank);
    document.getElementById('redeem-modal').classList.remove('hidden');

    // Show remaining unused redeem codes (count + ranks) but do NOT reveal the code strings
    try {
        const remaining = getUnusedRedeemCodes();
        const remainingCount = remaining.length;
        const rankNames = remaining.map(rk => `#${rk.replace('rank','')}`);
        const remEl = document.getElementById('redeem-remaining');
        if (remEl) {
            if (remainingCount === 0) remEl.textContent = 'No unused redeem codes remaining.';
            else remEl.textContent = `Remaining unused redeem codes: ${remainingCount} (ranks: ${rankNames.join(', ')})`;
        }
    } catch (e) {
        // ignore
    }
}

// Get redeem code by rank
function getRedeemCodeForRank(rank) {
    const rankKey = `rank${rank}`;
    return quizApp.redeemCodes[rankKey] || '';
}

// Return an array of rank keys (e.g. ['rank2','rank4']) that have not yet been given
function getUnusedRedeemCodes() {
    if (!quizApp.redeemCodesGiven) return [];
    return Object.keys(quizApp.redeemCodesGiven).filter(k => !quizApp.redeemCodesGiven[k]);
}

// Assign an unused redeem code (rank 1..5) to a participant identified by email or name.
function assignRedeemToPerfectScorer(identifier, desiredRank) {
    if (!identifier) return null;
    const id = identifier.toString().toLowerCase();
    // Don't assign a new code to the same user if they already have one
    const alreadyAssigned = Object.keys(quizApp.redeemRecipients || {}).find(k => (quizApp.redeemRecipients[k] || '').toString().toLowerCase() === id);
    if (alreadyAssigned) return null; // user already has a redeem code

    const desired = Number(desiredRank) || null;
    // Only award redeem codes to top 5 ranks
    if (!desired || desired < 1 || desired > 5) return null;
    // Prefer desired rank if it has an unused code
    if (desired && desired >= 1 && desired <= 5) {
        const rk = `rank${desired}`;
        if (!quizApp.redeemCodesGiven[rk]) {
            quizApp.redeemCodesGiven[rk] = true;
            quizApp.redeemRecipients[rk] = id;
            return desired;
        }
    }
    // Otherwise assign the lowest-numbered unused rank
    for (let r = 1; r <= 5; r++) {
        const rk = `rank${r}`;
        if (!quizApp.redeemCodesGiven[rk]) {
            quizApp.redeemCodesGiven[rk] = true;
            quizApp.redeemRecipients[rk] = id;
            return r;
        }
    }
    // No unused codes
    return null;
}

// Find top 5 perfect scorers for the current quiz and award unused redeem codes in rank order.
// Returns { assigned: [{rank, email}], assignedRankForCurrentUser: rankNumber|null }
function awardRedeemCodesToTopPerfectScorers() {
    const totalQs = quizApp.questions.length;
    if (!totalQs) return { assigned: [], assignedRankForCurrentUser: null };

    // Filter leaderboard by entries that perfectly scored for THIS quiz (totalQuestions matches)
    const perfects = quizApp.leaderboard
        .filter(e => typeof e.totalQuestions === 'number' && e.totalQuestions === totalQs && e.score === e.totalQuestions)
        .sort((a, b) => {
            if (a.timeTaken !== b.timeTaken) return a.timeTaken - b.timeTaken;
            return (a.timestamp || 0) - (b.timestamp || 0);
        });

    const assigned = [];
    let assignedRankForCurrentUser = null;
    // Iterate top 5 perfects and assign codes if unused
    for (let i = 0; i < Math.min(5, perfects.length); i++) {
        const rank = i + 1;
        const rk = `rank${rank}`;
        const entry = perfects[i];
        const id = (entry.email || entry.name || '').toString().toLowerCase();
        if (!quizApp.redeemCodesGiven[rk]) {
            // mark code as given and register recipient
            quizApp.redeemCodesGiven[rk] = true;
            quizApp.redeemRecipients[rk] = id;
            assigned.push({rank, email: id});
            // If this is the current participant, remember to show modal
            if ((quizApp.participantEmail || '').toString().toLowerCase() === id) assignedRankForCurrentUser = rank;
        }
    }

    return { assigned, assignedRankForCurrentUser };
}

function closeRedeemModal() {
    document.getElementById('redeem-modal').classList.add('hidden');
}

function copyRedeemCode() {
    const rank = parseInt(document.getElementById('redeem-modal').getAttribute('data-rank') || '1');
    const rankKey = `rank${rank}`;
    const code = quizApp.redeemCodes[rankKey] || '';
    navigator.clipboard.writeText(code).then(() => {
        const copyBtn = document.getElementById('copy-btn');
        const copyMessage = document.getElementById('copy-message');
        
        copyBtn.className = 'p-2 rounded-lg bg-green-100 text-green-600 transition-all';
        copyBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        copyMessage.textContent = 'Code copied to clipboard!';
        
        setTimeout(() => {
            copyBtn.className = 'p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-all';
            copyBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
            copyMessage.textContent = 'Click the copy button to copy the code';
        }, 2000);
    });
}

// Leaderboard Modal
function showLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '';
    
    if (quizApp.leaderboard.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
                </svg>
                <p class="text-gray-500">No scores yet. Be the first!</p>
            </div>
        `;
    } else {
        const sortedLeaderboard = [...quizApp.leaderboard].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeTaken - b.timeTaken;
        }).slice(0, 10);
        
        sortedLeaderboard.forEach((entry, index) => {
            const rank = index + 1;
            const rankColor = rank === 1 ? 'bg-yellow-50 border-yellow-200' :
                            rank === 2 ? 'bg-gray-50 border-gray-200' :
                            rank === 3 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200';
            
            let rankIcon = `<span class="text-gray-500 font-bold w-6 text-center">${rank}</span>`;
            if (rank === 1) {
                rankIcon = '<svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path></svg>';
            } else if (rank === 2) {
                rankIcon = '<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>';
            } else if (rank === 3) {
                rankIcon = '<svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            }
            
            const formatTime = (seconds) => {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            
            const item = document.createElement('div');
            item.className = `flex items-center gap-4 p-4 rounded-xl border-2 ${rankColor}`;
            const rankKey = `rank${rank}`;
            const isRedeemGiven = quizApp.redeemCodesGiven[rankKey] || false;
            const recipient = quizApp.redeemRecipients[rankKey] || '';
            const redeemCode = quizApp.redeemCodes[rankKey] || '';
            let redeemHtml = '';
            if (rank <= 5) {
                if (isRedeemGiven) {
                        // Show full code only to the recipient on this device (match by email/name). Otherwise show masked recipient.
                        const viewerId = ((quizApp.participantEmail || quizApp.participantName) || '').toString().toLowerCase();
                        const entryId = ((entry.email || entry.name) || '').toString().toLowerCase();
                        const recipientId = (recipient || '').toString().toLowerCase();
                        if (recipientId && viewerId && recipientId === viewerId && recipientId === entryId) {
                            redeemHtml = `<div class="text-xs text-blue-600 font-mono">Redeem: <strong>${redeemCode}</strong></div>`;
                        } else {
                            // Mask recipient for privacy (show first part and domain partially)
                            const masked = (() => {
                                if (!recipient) return '—';
                                try {
                                    const parts = recipient.split('@');
                                    const name = parts[0];
                                    const domain = parts[1] || '';
                                    const n = name.length;
                                    const visible = name.slice(0, Math.min(3, n));
                                    return `${visible}***@${domain}`;
                                } catch (e) { return recipient; }
                            })();
                            redeemHtml = `<div class="text-xs text-gray-500">Redeem given to ${masked}</div>`;
                        }
                } else {
                    redeemHtml = `<div class="text-xs text-gray-400">Redeem pending</div>`;
                }
            }
            item.innerHTML = `
                <div class="flex-shrink-0">${rankIcon}</div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-900 truncate">${entry.name || 'Player'}</h3>
                    <p class="text-sm text-gray-500">Score: ${entry.score}/${entry.totalQuestions}</p>
                </div>
                <div class="flex-shrink-0 text-right">
                    <p class="font-medium text-gray-900">${formatTime(typeof entry.timeTaken === 'number' ? entry.timeTaken : 0)}</p>
                    <p class="text-xs text-gray-500">Time</p>
                </div>
            `;
            if (redeemHtml) {
                const rDiv = document.createElement('div');
                rDiv.className = 'ml-4 flex-shrink-0 text-right';
                rDiv.innerHTML = redeemHtml;
                item.appendChild(rDiv);
            }
            container.appendChild(item);
        });
    }
    
    document.getElementById('leaderboard-modal').classList.remove('hidden');
}

function closeLeaderboard() {
    document.getElementById('leaderboard-modal').classList.add('hidden');
}

// Utility Functions
// Sanitize JSON-like text to correct common issues: smart quotes, trailing commas, unquoted keys, single quotes
function sanitizeJSONText(text) {
    if (typeof text !== 'string') return text;
    let t = text;
    // Replace smart quotes with straight quotes
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    // Remove // and /* */ comments
    t = t.replace(/\/\/.*(?=[\n\r])?/g, '');
    t = t.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove trailing commas before ] or }
    t = t.replace(/,\s*(?=[}\]])/g, '');
    // Convert backticks to double quotes
    t = t.replace(/`/g, '"');
    // Replace single-quoted property names/strings with double quotes when it looks like JSON
    // This is a heuristic; only do it when there are no double quotes or string-like patterns
    const singleQuotesCount = (t.match(/'/g) || []).length;
    const doubleQuotesCount = (t.match(/\"/g) || []).length;
    if (singleQuotesCount > 0 && doubleQuotesCount === 0) {
        t = t.replace(/'(.*?)'/g, '"$1"');
    }
    // Quote unquoted object keys: { key: to } -> { "key": to }
    t = t.replace(/([\{,]\s*)([A-Za-z0-9_\-]+)\s*:(?=\s*['"`\[{0-9a-zA-Z])/g, '$1"$2":');
    return t;
}

// Try to parse JSON leniently by applying progressive sanitizations
function parseJSONLenient(text) {
    if (!text || typeof text !== 'string') return { error: 'No input' };
    try {
        return { parsed: JSON.parse(text) };
    } catch (err1) {
        // Try sanitized version
        const t = sanitizeJSONText(text);
        try {
            return { parsed: JSON.parse(t), sanitized: t };
        } catch (err2) {
            // Last resort - try wrapping an object in array if it looks like an object
            try {
                const maybeArray = '[' + t + ']';
                const parsed = JSON.parse(maybeArray);
                return { parsed, sanitized: maybeArray };
            } catch (err3) {
                return { error: err3.message || err2.message || err1.message };
            }
        }
    }
}

// Parse a 'plain text' format where each line is: question | opt1 | opt2 | opt3 | opt4 | answer
function parsePlainTextLines(text) {
    if (!text || typeof text !== 'string') return { error: 'No input' };
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // Filter out obvious JSON/code artifacts to honor "plain-only" mode
    const lines = rawLines.filter(l => {
        const lower = l.toLowerCase();
        // Skip lines that look like JSON objects/arrays or contain JSON property keys
        if (/[\{\}\[\]]/.test(l)) return false;
        if (lower.includes('"question"') || lower.includes('"options"') || lower.includes('"correctanswer"') || lower.includes('correctanswer:') || lower.includes('correc' + 't')) return false;
        // Skip common JS/JSON artifacts
        if (l.startsWith('{') || l.startsWith('[') || l.endsWith('}') || l.endsWith(']')) return false;
        return true;
    });
    if (lines.length === 0) return { error: 'No lines found' };

    const parsed = [];
    const invalid = [];
    const corrections = [];

    lines.forEach((line, idx) => {
        // detect delimiter
        let delim = '|';
        if (line.includes('|')) {
            delim = '|';
        } else if (line.includes('\t')) {
            delim = '\t';
        } else if (line.includes(';')) {
            delim = ';';
        } else if ((line.match(/,/g) || []).length >= 2) {
            delim = ',';
        } else {
            // fallback: split by space and ' - ' or ':' separators
            if (line.includes(' - ')) delim = ' - ';
            else if (line.includes(' : ')) delim = ' : ';
            else delim = '|';
        }

        const parts = line.split(delim).map(p => p.trim()).filter(Boolean);
        if (parts.length < 3) {
            invalid.push({ index: idx + 1, reason: 'Not enough columns (expected question + options + answer)' });
            return;
        }

        const answerPart = parts[parts.length - 1];
        const questionPart = parts[0];
        const optionParts = parts.slice(1, parts.length - 1);

        // attempt to parse the answer: numeric index or text
        let correct = null;
        if (/^-?\d+$/.test(answerPart)) {
            // numeric
            let num = parseInt(answerPart, 10);
            // assume 1-based if num > options length
            if (num > 0 && num <= optionParts.length) {
                // probably 1-based
                correct = num - 1;
            } else if (num >= 0 && num < optionParts.length) {
                correct = num; // 0-based
            } else {
                // out of range, try clamp
                correct = Math.max(0, Math.min(optionParts.length - 1, num - 1));
            }
        } else {
            // string answer: match with options
            const idxFound = optionParts.findIndex(op => op.toLowerCase() === answerPart.toLowerCase());
            if (idxFound !== -1) correct = idxFound;
        }

        // fallback if no correct found
        if (correct === null) correct = 0;

        // normalize options (trim, remove quotes)
        const options = optionParts.map(o => o.replace(/^['"`]|['"`]$/g, '').trim());

        // If less than 2 options, mark invalid
        if (options.length < 2) {
            invalid.push({ index: idx + 1, reason: 'Not enough options (minimum 2 required), found ' + options.length });
            return;
        }

        // If more than 4 options, trim and mark correction
        if (options.length > 4) {
            const orig = [...options];
            options.splice(4);
            corrections.push({ index: idx + 1, reason: 'Trimmed >4 options', original: orig, fixed: options });
            if (correct >= 4) correct = 0; // adjust
        }

        parsed.push({ question: questionPart, options, correctAnswer: correct });
    });

    return { parsed, invalids: invalid, corrections };
}

// Preview an import string: parse, normalize, and return summary without changing state
function previewImportedQuestions(text, mode = 'auto') {
    // mode: 'auto' | 'json' | 'plain'
    let res = null;
    if (mode === 'plain') {
        // parse plain text lines
        const p = parsePlainTextLines(text);
        if (p.error) return { error: p.error };
        const parsedQuestions = p.parsed || [];
        // convert parsedQuestions to the same flow below: use normalize
        const importedQuestions = parsedQuestions.map(q => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
        res = { parsed: importedQuestions };
        res.sanitized = text;
        res.corrections = p.corrections || [];
    } else {
        res = parseJSONLenient(text);
        if (res.error && mode === 'auto') {
            // try plain text fallback
            const p = parsePlainTextLines(text);
            if (!p.error) {
                const importedQuestions = p.parsed.map(q => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
                res = { parsed: importedQuestions, sanitized: text, corrections: p.corrections || [] };
            } else {
                return { error: res.error };
            }
        } else if (res.error) return { error: res.error };
    }
    let importedQuestions = res.parsed;
    if (!Array.isArray(importedQuestions)) {
        const arr = findQuestionsArray(importedQuestions);
        if (arr) importedQuestions = arr;
    }
    if (!Array.isArray(importedQuestions)) return { error: 'Parsed content is not an array of questions' };

    const { validQuestions, invalidQuestions, corrections } = normalizeAndExtract(importedQuestions);
    const valid = validQuestions.map((q, i) => ({ index: i + 1, question: q }));
    const invalid = invalidQuestions;
    return { parsed: importedQuestions, valid, invalid, corrections };
}

// Find nested array within an object that looks like an array of question objects
function findQuestionsArray(obj) {
    if (!obj) return null;
    if (Array.isArray(obj) && obj.length > 0 && obj.every(item => typeof item === 'object' && (item.question || item.q || item.prompt))) {
        return obj;
    }
    if (typeof obj === 'object') {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const found = findQuestionsArray(obj[key]);
                if (found) return found;
            }
        }
    }
    return null;
}

// Normalize parsed questions array into valid questions, invalid entries, and correction info
function normalizeAndExtract(parsedQuestions) {
    const validQuestions = [];
    const invalidQuestions = [];
    const corrections = [];

    parsedQuestions.forEach((q, index) => {
        const nr = normalizeQuestion(q);
        if (!nr.ok) {
            invalidQuestions.push({ index: index + 1, reason: nr.reason, raw: q });
            return;
        }
        const nq = nr.question;
        if (q.question !== nq.question || JSON.stringify(q.options) !== JSON.stringify(nq.options) || q.correctAnswer !== nq.correctAnswer) {
            corrections.push({ index: index + 1, original: q, fixed: nq });
        }
        if (!Array.isArray(nq.options) || nq.options.length < 2) {
            invalidQuestions.push({ index: index + 1, reason: 'Options length < 2', raw: q, fixed: nq });
            return;
        }
        // Trim to 4 if necessary
        const options = (nq.options.length > 4 ? nq.options.slice(0, 4) : nq.options).map(opt => opt.trim());
        validQuestions.push({ id: Date.now() + index + Math.random(), question: nq.question, options, correctAnswer: nq.correctAnswer });
    });

    return { validQuestions, invalidQuestions, corrections };
}



// Normalize an incoming question object to expected shape: { question, options, correctAnswer }
function normalizeQuestion(q) {
    if (!q || typeof q !== 'object') return { ok: false, reason: 'Invalid question type' };
    const normalized = { id: Date.now() + Math.random(), question: '', options: [], correctAnswer: 0 };
    // Question text keys: question, q, prompt, title
    normalized.question = (q.question || q.q || q.prompt || q.title || '').toString().trim();
    if (!normalized.question) return { ok: false, reason: 'Missing question text' };
    // Options keys: options, responses, answers, choices
    let opts = q.options || q.responses || q.answers || q.choices || null;
    // If options look like object with text/correct keys
    if (Array.isArray(opts) && opts.length > 0 && typeof opts[0] === 'object') {
        const mapped = opts.map(o => o.text || o.value || o.label || String(o));
        const correctIndex = opts.findIndex(o => o.correct === true || o.isCorrect === true);
        opts = mapped;
        if (correctIndex !== -1) q.correctAnswer = correctIndex;
    }
    // If options is a single string (comma-separated), split
    if (!opts && typeof q.options === 'string') {
        opts = q.options.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(opts)) return { ok: false, reason: 'Options not found or not an array' };
    // Normalize options to strings
    const options = opts.map(opt => typeof opt === 'string' ? opt.trim() : (opt && (opt.text || opt.value)) ? (opt.text || opt.value).toString().trim() : String(opt));
    // If less than 2 options -> invalid
    if (options.length < 2) return { ok: false, reason: 'Options must have at least 2 items' };
    // If > 4 options, trim to first 4 and note
    if (options.length > 4) options.splice(4);
    // if < 4 but >=2, keep as-is but warn; however UI expects 4. We will allow 2..4
    // Determine the correct answer index
    let correct = null;
    if (typeof q.correctAnswer === 'number') {
        correct = q.correctAnswer;
    } else if (typeof q.correctAnswerIndex === 'number') {
        correct = q.correctAnswerIndex;
    } else if (typeof q.correct_answer === 'number') {
        correct = q.correct_answer;
    } else if (typeof q.answer === 'number') {
        correct = q.answer;
    } else if (typeof q.answer === 'string') {
        const idx = options.findIndex(o => o.toLowerCase().trim() === q.answer.toLowerCase().trim());
        if (idx !== -1) correct = idx;
    } else if (typeof q.correctAnswer === 'string') {
        const idx = options.findIndex(o => o.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim());
        if (idx !== -1) correct = idx;
    }
    // If still unknown, set to 0
    if (correct === null || typeof correct !== 'number' || correct < 0 || correct >= options.length) correct = 0;

    normalized.options = options;
    normalized.correctAnswer = correct;
    return { ok: true, question: normalized };
}

function resetQuiz() {
    quizApp.participantName = '';
    quizApp.currentQuestionIndex = 0;
    quizApp.answers = [];
    quizApp.score = 0;
    quizApp.startTime = null;
    quizApp.endTime = null;
    
    document.getElementById('summary-screen').classList.add('hidden');
    
    // If admin is logged in (in-memory), show admin dashboard; otherwise show welcome
    if (quizApp.isAdmin) {
        showAdminDashboard();
    } else {
        document.getElementById('welcome-screen').classList.remove('hidden');
    }
    document.getElementById('name-input').value = '';
}

function goHome() {
    document.getElementById('summary-screen').classList.add('hidden');
    // Always navigate back to the public welcome/start screen.
    // Hide any admin dashboard if visible but keep admin authentication state intact.
    document.getElementById('admin-dashboard') && document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('quiz-screen') && document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('welcome-screen') && document.getElementById('welcome-screen').classList.remove('hidden');
}

// Admin Functions
function showAdminLogin() {
    document.getElementById('admin-login-modal').classList.remove('hidden');
    const storedHash = localStorage.getItem('adminPasswordHash');
    const errorDiv = document.getElementById('admin-error');
    const usernameInput = document.getElementById('admin-username');
    if (usernameInput) usernameInput.value = getAdminUsername();
    if (!storedHash) {
        if (errorDiv) {
            errorDiv.textContent = 'Admin is not configured. Set the admin username & password via the browser console: setAdminUsername("jeevan"); setAdminPassword("yourPassword")';
            errorDiv.classList.remove('hidden');
        }
    } else {
        if (errorDiv) errorDiv.classList.add('hidden');
    }
}

function closeAdminLogin() {
    document.getElementById('admin-login-modal').classList.add('hidden');
}

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('admin-error');

    errorDiv.classList.add('hidden');

    // Basic validation
    const storedAdminUsername = getAdminUsername();
    if (username !== storedAdminUsername) {
        errorDiv.textContent = 'Invalid username';
        errorDiv.classList.remove('hidden');
        return;
    }

    const lockExpiry = parseInt(localStorage.getItem('adminLockExpiry') || '0', 10);
    if (Date.now() < lockExpiry) {
        errorDiv.textContent = 'Login temporarily locked due to multiple failed attempts. Try again later.';
        errorDiv.classList.remove('hidden');
        return;
    }

    const storedHash = localStorage.getItem('adminPasswordHash');
    if (!storedHash) {
        errorDiv.textContent = 'Admin is not configured. Set the admin password via the browser console using setAdminPassword("yourPassword").';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        const inputHash = await sha256Hex(password);
        if (inputHash === storedHash) {
            // Successful login
            quizApp.isAdmin = true;
            // Do NOT persist adminAuthenticated to localStorage to require password entry each time
            localStorage.removeItem('adminLoginFailures');
            localStorage.removeItem('adminLockExpiry');
            updateAdminStatusIndicator(); // Show admin status indicator (if it exists in UI)
            closeAdminLogin();
            showAdminDashboard();
        } else {
            // Failed login
            let failures = parseInt(localStorage.getItem('adminLoginFailures') || '0', 10);
            failures++;
            localStorage.setItem('adminLoginFailures', String(failures));
            if (failures >= 5) {
                const lockPeriodMs = 30 * 1000; // 30 seconds
                localStorage.setItem('adminLockExpiry', String(Date.now() + lockPeriodMs));
                localStorage.setItem('adminLoginFailures', '0');
                errorDiv.textContent = 'Too many failed attempts. Login has been temporarily locked.';
            } else {
                errorDiv.textContent = 'Invalid username or password';
            }
            errorDiv.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Error verifying admin password', err);
        errorDiv.textContent = 'An error occurred while attempting to log in. Try again later.';
        errorDiv.classList.remove('hidden');
    }
});

function logoutAdmin() {
    if (confirm('Are you sure you want to logout?')) {
        quizApp.isAdmin = false;
        // ensure no persisted admin auth flag remains
        localStorage.removeItem('adminAuthenticated');
        updateAdminStatusIndicator(); // Hide admin status indicator
        document.getElementById('admin-dashboard').classList.add('hidden');
        document.getElementById('welcome-screen').classList.remove('hidden');
    }
}

function showAdminDashboard() {
    // Check if admin is authenticated in-memory before showing dashboard
    const storedHash = localStorage.getItem('adminPasswordHash');
    if (quizApp.isAdmin && storedHash) {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('quiz-screen').classList.add('hidden');
        document.getElementById('summary-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        switchAdminTab('questions');
    } else {
        showAdminLogin();
    }
}

// Refresh admin data action: optionally clear performance and leaderboard data
function refreshAdminData() {
    if (!quizApp.isAdmin) {
        // If admin not logged in, just open admin dashboard (keeps current behavior)
        showAdminDashboard();
        return;
    }

    const choice = confirm('Refresh admin data. Click OK to CLEAR leaderboard and performance data, or Cancel to just open the admin dashboard.\n\nWARNING: This will permanently remove local leaderboard entries.');
    if (!choice) {
        // user cancelled clearing — just open dashboard
        showAdminDashboard();
        return;
    }

    // Clear leaderboard and related performance metadata
    quizApp.leaderboard = [];
    // Also clear redeem recipients and given flags so redeem state resets
    if (quizApp.redeemCodesGiven) {
        Object.keys(quizApp.redeemCodesGiven).forEach(k => quizApp.redeemCodesGiven[k] = false);
    }
    if (quizApp.redeemRecipients) {
        Object.keys(quizApp.redeemRecipients).forEach(k => quizApp.redeemRecipients[k] = null);
    }

    saveToLocalStorage();
    alert('Leaderboard and performance data cleared.');
    // Show performance tab so admin can verify data is gone
    switchAdminTab('performance');
}

function switchAdminTab(tab) {
    // Update tab styles
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
        btn.classList.add('text-gray-600');
    });
    
    document.getElementById(`tab-${tab}`).classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
    document.getElementById(`tab-${tab}`).classList.remove('text-gray-600');
    
    // Show content
    const content = document.getElementById('admin-content');
    
    if (tab === 'questions') {
        content.innerHTML = getQuestionsTabHTML();
        attachQuestionHandlers();
    } else if (tab === 'settings') {
        content.innerHTML = getSettingsTabHTML();
        attachSettingsHandlers();
    } else if (tab === 'redeem') {
        content.innerHTML = getRedeemTabHTML();
        attachRedeemHandlers();
    } else if (tab === 'performance') {
        content.innerHTML = getPerformanceTabHTML();
    }
}

function getQuestionsTabHTML() {
    let html = `
        <div class="space-y-6">
            <div class="flex justify-between items-center flex-wrap gap-4">
                <h2 class="text-xl font-bold text-gray-900">Question Management</h2>
                <div class="flex gap-2">
                    <button onclick="showImportQuestions()" class="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <span>Import Questions</span>
                    </button>
                    <button onclick="exportQuestions()" class="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                        <span>Export Questions</span>
                    </button>
                    <button onclick="showQuestionForm()" class="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        <span>Add Question</span>
                    </button>
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Correct Answer</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    quizApp.questions.forEach((question, index) => {
        html += `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                <td class="px-6 py-4 text-sm text-gray-900 max-w-md">${question.question}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${question.options[question.correctAnswer]}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="editQuestion(${question.id})" class="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        <span>Edit</span>
                    </button>
                    <button onclick="deleteQuestionConfirm(${question.id})" class="text-red-600 hover:text-red-900 inline-flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        <span>Delete</span>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

function getSettingsTabHTML() {
    return `
        <div class="space-y-6">
            <h2 class="text-xl font-bold text-gray-900">Site Text Settings</h2>
            <div class="bg-white rounded-xl shadow-md p-6 md:p-8 space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Welcome Title</label>
                    <input id="setting-welcome-title" type="text" value="${quizApp.siteSettings.welcomeTitle}" class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Welcome Subtitle</label>
                    <input id="setting-welcome-subtitle" type="text" value="${quizApp.siteSettings.welcomeSubtitle}" class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Decoder Instructions</label>
                    <textarea id="setting-quiz-instructions" class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900" rows="3">${quizApp.siteSettings.quizInstructions}</textarea>
                </div>
                <button onclick="saveSettings()" class="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                    Save Settings
                </button>
            </div>
        </div>
    `;
}

function getRedeemTabHTML() {
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#87CEEB', '#98FB98'];
    const rankLabels = ['🥇 Rank #1', '🥈 Rank #2', '🥉 Rank #3', '4️⃣ Rank #4', '5️⃣ Rank #5'];
    
    let codesHTML = '';
    for (let i = 1; i <= 5; i++) {
        const rankKey = `rank${i}`;
        const code = quizApp.redeemCodes[rankKey] || '';
    const isGiven = quizApp.redeemCodesGiven[rankKey] || false;
    const recipient = quizApp.redeemRecipients[rankKey] || '';
        
        codesHTML += `
            <div class="border-2 ${isGiven ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'} rounded-xl p-4">
                <div class="flex items-center justify-between mb-2">
                    <label class="block text-sm font-medium text-gray-700">${rankLabels[i-1]}</label>
                    <span class="text-xs px-2 py-1 rounded ${isGiven ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                        ${isGiven ? `✅ Given to ${recipient || '—'}` : '⏳ Pending'}
                    </span>
                </div>
                <input 
                    id="redeem-code-${i}" 
                    type="text" 
                    value="${code}" 
                    onchange="updateRedeemCode(${i}, this.value)"
                    class="w-full px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900 font-mono text-sm"
                    placeholder="Enter or generate code"
                />
                <p class="mt-1 text-xs text-gray-500">Shown to ${i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`} place with perfect score</p>
                ${recipient ? `<p class="text-xs text-gray-500 mt-1">Recipient: <strong>${recipient}</strong></p>` : ''}
            </div>
        `;
    }
    
    return `
        <div class="space-y-6">
            <h2 class="text-xl font-bold text-gray-900">Redeem Code Settings - Top 5 Users</h2>
            <div class="bg-white rounded-xl shadow-md p-6 md:p-8 space-y-4">
                ${codesHTML}
                <div class="flex gap-4 pt-4 border-t border-gray-200">
                    <button onclick="generateAllRedeemCodes(); switchAdminTab('redeem');" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                        Generate All Codes
                    </button>
                    <button onclick="resetAllRedeemCodeStatus()" class="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                        Reset All Status
                    </button>
                </div>
            </div>
        </div>
    `;
}

function getPerformanceTabHTML() {
    const totalParticipants = quizApp.leaderboard.length;
    const perfectScores = quizApp.leaderboard.filter(l => l.score === l.totalQuestions).length;
    const totalQuestions = quizApp.questions.length;
    
    let tableHTML = '';
    if (quizApp.leaderboard.length > 0) {
        const sorted = [...quizApp.leaderboard].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeTaken - b.timeTaken;
        });
        
        sorted.forEach((entry, index) => {
            const formatTime = (seconds) => {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            
            tableHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#${index + 1}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${entry.score}/${entry.totalQuestions}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${formatTime(entry.timeTaken)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${new Date(entry.timestamp).toLocaleDateString()}</td>
                </tr>
            `;
        });
    }
    
    return `
        <div class="space-y-6">
            <div class="flex items-center gap-2 mb-4">
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                </svg>
                <h2 class="text-xl font-bold text-gray-900">Performance Data</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="bg-white rounded-xl shadow-md p-6">
                    <div class="text-3xl font-bold text-blue-600 mb-2">${totalParticipants}</div>
                    <div class="text-gray-600">Total Participants</div>
                </div>
                <div class="bg-white rounded-xl shadow-md p-6">
                    <div class="text-3xl font-bold text-green-600 mb-2">${perfectScores}</div>
                    <div class="text-gray-600">Perfect Scores</div>
                </div>
                <div class="bg-white rounded-xl shadow-md p-6">
                    <div class="text-3xl font-bold text-purple-600 mb-2">${totalQuestions}</div>
                    <div class="text-gray-600">Total Questions</div>
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th class="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${tableHTML || '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No data available</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Admin handlers
function attachSettingsHandlers() {
    // Already handled in getSettingsTabHTML
}

function attachRedeemHandlers() {
    // Already handled in getRedeemTabHTML
}

function saveSettings() {
    quizApp.siteSettings = {
        welcomeTitle: document.getElementById('setting-welcome-title').value,
        welcomeSubtitle: document.getElementById('setting-welcome-subtitle').value,
        quizInstructions: document.getElementById('setting-quiz-instructions').value,
    };
    saveToLocalStorage();
    updateWelcomeScreen();
    alert('Settings saved!');
}

// Update single redeem code
function updateRedeemCode(rank, value) {
    const rankKey = `rank${rank}`;
    quizApp.redeemCodes[rankKey] = value;
    saveToLocalStorage();
}

// Generate all redeem codes (force regenerate - called from UI)
function generateAllRedeemCodes() {
    quizApp.redeemCodes = {
        rank1: 'RANK1' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        rank2: 'RANK2' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        rank3: 'RANK3' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        rank4: 'RANK4' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        rank5: 'RANK5' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    };
    saveToLocalStorage();
    if (quizApp.isAdmin) switchAdminTab('redeem');
    alert('All 5 redeem codes have been regenerated!');
}

// Reset all redeem code status
function resetAllRedeemCodeStatus() {
    if (confirm('Reset all redeem code status? This will allow the next top 5 perfect scorers to receive codes again.')) {
        quizApp.redeemCodesGiven = {
            rank1: false,
            rank2: false,
            rank3: false,
            rank4: false,
            rank5: false,
        };
        quizApp.redeemRecipients = {
            rank1: null,
            rank2: null,
            rank3: null,
            rank4: null,
            rank5: null,
        };
        saveToLocalStorage();
        if (quizApp.isAdmin) switchAdminTab('redeem');
        alert('All redeem code statuses have been reset!');
    }
}

// Import/Export Questions Functions (already added above)

function showQuestionForm(questionId = null) {
    const question = questionId ? quizApp.questions.find(q => q.id === questionId) : null;
    
    const formHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto">
                <h3 class="text-2xl font-bold text-gray-900 mb-6">${question ? 'Edit Question' : 'Add New Question'}</h3>
                <form id="question-form" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Question</label>
                        <textarea id="form-question" required class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900" rows="3">${question ? question.question : ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">Options</label>
                        <div class="space-y-3">
                            ${[0, 1, 2, 3].map(i => `
                                <div class="flex items-center gap-3">
                                    <input type="radio" name="correct-answer" value="${i}" ${question && question.correctAnswer === i ? 'checked' : i === 0 ? 'checked' : ''} class="w-4 h-4 text-blue-500">
                                    <input type="text" id="option-${i}" value="${question ? question.options[i] : ''}" placeholder="Option ${i + 1}" required class="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900">
                                    <span class="text-xs text-gray-500">Correct</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <button type="submit" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                            ${question ? 'Update Question' : 'Add Question'}
                        </button>
                        <button type="button" onclick="closeQuestionForm()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', formHTML);
    
    document.getElementById('question-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const questionText = document.getElementById('form-question').value;
        const options = [
            document.getElementById('option-0').value,
            document.getElementById('option-1').value,
            document.getElementById('option-2').value,
            document.getElementById('option-3').value,
        ];
        const correctAnswer = parseInt(document.querySelector('input[name="correct-answer"]:checked').value);
        
        if (questionId) {
            updateQuestion(questionId, { question: questionText, options, correctAnswer });
        } else {
            addQuestion({ question: questionText, options, correctAnswer });
        }
        
        closeQuestionForm();
        switchAdminTab('questions');
    });
}

function closeQuestionForm() {
    const form = document.querySelector('.fixed.inset-0.bg-black');
    if (form) form.remove();
}

function editQuestion(id) {
    showQuestionForm(id);
}

function addQuestion(questionData) {
    const newQuestion = {
        ...questionData,
        id: Date.now(),
    };
    quizApp.questions.push(newQuestion);
    saveToLocalStorage();
}

function updateQuestion(id, updatedData) {
    const index = quizApp.questions.findIndex(q => q.id === id);
    if (index !== -1) {
        quizApp.questions[index] = { ...updatedData, id };
        saveToLocalStorage();
    }
}

function deleteQuestionConfirm(id) {
    if (confirm('Are you sure you want to delete this question?')) {
        deleteQuestion(id);
        switchAdminTab('questions');
    }
}

function deleteQuestion(id) {
    quizApp.questions = quizApp.questions.filter(q => q.id !== id);
    saveToLocalStorage();
}

// Import Questions Functions
function showImportQuestions() {
    // Close any existing modals first
    const existingModal = document.querySelector('.fixed.inset-0.bg-black');
    if (existingModal) existingModal.remove();
    
    const formHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-2xl font-bold text-gray-900">Import Questions</h3>
                    <button onclick="closeImportQuestions()" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="flex items-center gap-3 mb-4">
                    <label class="text-sm text-gray-700 font-medium mr-3">Import mode:</label>
                    <label class="text-sm text-gray-600"><input type="radio" name="import-mode" value="plain" checked> Plain text (question|opt1|opt2|opt3|opt4|answer)</label>
                    <label class="text-sm text-gray-600"><input type="radio" name="import-mode" value="json"> JSON</label>
                </div>
                <p class="text-sm text-gray-600 mb-6">
                    Paste your questions in JSON format below. The tool will try to correct common JSON issues (smart quotes, trailing commas, single quotes, common key names). Accepted key names: <code>question</code>, <code>options</code> (or <code>responses</code>), and <code>correctAnswer</code> (or <code>correctAnswerIndex</code>, <code>answer</code>). Format should be:
                    <code class="block mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">[{"question":"What is 2+2?","options":["3","4","5","6"],"correctAnswer":1},{"question":"Who...","responses":["a","b","c","d"],"correctAnswerIndex":2}]</code>
                </p>
                <textarea 
                    id="import-questions-text" 
                    class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900 font-mono text-sm" 
                    rows="15"
                    placeholder='[{"question":"What is 2+2?","options":["3","4","5","6"],"correctAnswer":1},{"question":"Who...","responses":["a","b","c","d"],"correctAnswerIndex":2}]'
                ></textarea>
                <div class="mt-4 flex gap-4">
                    <button onclick="previewImportFromText()" class="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors">Preview</button>
                    <button onclick="importQuestionsFromText()" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                        Import from Text
                    </button>
                    <button onclick="closeImportQuestions()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors">
                        Cancel
                    </button>
                </div>
                <div class="mt-4 pt-4 border-t border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Or select a JSON file:</p>
                    <input type="file" id="import-file-input" accept=".json,.txt" class="w-full px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-gray-900">
                    <div class="mt-2 flex gap-2">
                        <button onclick="previewImportFromFile()" class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Preview File</button>
                        <button onclick="importQuestionsFromFile()" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Import from File</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', formHTML);
}

function closeImportQuestions() {
    const form = document.querySelector('.fixed.inset-0.bg-black');
    if (form) form.remove();
}

function importQuestionsFromText() {
    const textarea = document.getElementById('import-questions-text');
    if (!textarea) {
        alert('Text area not found. Please try again.');
        return;
    }
    
    const text = textarea.value.trim();
    
    if (!text) {
        alert('Please paste questions in the selected format (Plain or JSON)');
        return;
    }
    
    try {
        const mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'plain';
        let importedQuestions = [];
        let corrections = [];
        if (mode === 'plain') {
            const p = parsePlainTextLines(text);
            if (p.error) { alert('❌ Could not parse plain text: ' + p.error); return; }
            if (p.corrections && p.corrections.length) corrections = corrections.concat(p.corrections);
            importedQuestions = (p.parsed || []).map(q => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
        } else {
            const parseResult = parseJSONLenient(text);
            if (parseResult.sanitized) {
                console.info('Sanitized input JSON before parsing. You can view the sanitized JSON from parseResult.sanitized via parseJSONLenient in the console.');
            }
            if (parseResult.error) {
                alert('❌ Invalid JSON format. Could not parse input:\n\n' + parseResult.error);
                return;
            }
            importedQuestions = parseResult.parsed;
            if (parseResult.corrections) corrections = corrections.concat(parseResult.corrections);
        }
        // If object with `questions` property or nested array, extract it
        if (!Array.isArray(importedQuestions)) {
            const arr = findQuestionsArray(importedQuestions);
            if (arr) importedQuestions = arr;
        }
        
        if (!Array.isArray(importedQuestions)) {
            alert('Invalid format: Questions must be an array. Example:\n[{"question":"...", "options":["...","...","...","..."], "correctAnswer":0}]');
            return;
        }
        
        if (importedQuestions.length === 0) {
            alert('The array is empty. Please provide at least one question.');
            return;
        }
        
    // Normalize + validate the input array
    const { validQuestions: extractedValidQuestions, invalidQuestions: extractedInvalidQuestions, corrections: normCorrections } = normalizeAndExtract(importedQuestions);
    let validQuestions = extractedValidQuestions || [];
    let invalidQuestions = extractedInvalidQuestions || [];
    if (normCorrections && normCorrections.length) corrections = corrections.concat(normCorrections || []);
    
    if (validQuestions.length === 0) {
        let errorMsg = 'No valid questions found. Each question must have:\n';
        errorMsg += '- question: string (required)\n';
        errorMsg += '- options: array of 2-4 strings (required)\n';
        errorMsg += '- correctAnswer: number 0-(options-1) (required)\n\n';
        if (invalidQuestions.length > 0) {
            errorMsg += 'Errors found:\n';
            invalidQuestions.slice(0, 5).forEach(inv => {
                errorMsg += `Question ${inv.index}: ${inv.reason}\n`;
            });
        }
        alert(errorMsg);
        return;
    }
        
    let message = `Found ${validQuestions.length} valid question(s).`;
    if (corrections.length > 0) message += `\n${corrections.length} question(s) were automatically corrected.`;
    if (invalidQuestions.length > 0) message += `\n${invalidQuestions.length} invalid question(s) will be skipped.`;
    message += `\n\nAdd ${validQuestions.length} question(s) to existing questions?`;
        
        if (confirm(message)) {
            // Add questions to existing ones (not replace)
            quizApp.questions = [...quizApp.questions, ...validQuestions];
            saveToLocalStorage();
            closeImportQuestions();
            // Refresh the questions tab
            setTimeout(() => {
                switchAdminTab('questions');
                alert(`✅ Successfully imported ${validQuestions.length} question(s)!\n\nTotal questions: ${quizApp.questions.length}`);
                if (corrections.length > 0) {
                    console.info('Corrections made to imported questions:', corrections.slice(0, 10));
                }
            }, 100);
        }
    } catch (error) {
        alert('❌ Invalid JSON format. Please check your syntax:\n\n' + error.message + '\n\nExample format:\n[{"question":"What is 2+2?","options":["3","4","5","6"],"correctAnswer":1}]');
        console.error('Import error:', error);
    }
}

function previewImportFromText() {
    const textarea = document.getElementById('import-questions-text');
    if (!textarea) {
        alert('Text area not found. Please try again.');
        return;
    }
    const text = textarea.value.trim();
    if (!text) {
        alert('Please paste questions in the selected format (Plain or JSON) to preview');
        return;
    }

    const mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'auto';
    const preview = previewImportedQuestions(text, mode);
    if (preview.error) {
        alert('Could not parse input: ' + preview.error);
        return;
    }

    const validCount = preview.valid.length;
    const invalidCount = preview.invalid.length;
    const correctionsCount = preview.corrections.length;
    let msg = `Preview: ${validCount} valid, ${invalidCount} invalid, ${correctionsCount} corrected.`;
    msg += '\n\nClick OK to log details to the console (open DevTools)';
    if (confirm(msg)) {
        console.info('Preview valid items:', preview.valid.slice(0, 50));
        console.info('Preview invalid items:', preview.invalid.slice(0, 50));
        console.info('Preview corrections:', preview.corrections.slice(0, 50));
    }
}

function previewImportFromFile() {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput) {
        alert('File input not found. Please try again.');
        return;
    }
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a JSON or text file to preview');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result.trim();
        if (!text) {
            alert('File is empty');
            return;
        }
    const mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'auto';
    const preview = previewImportedQuestions(text, mode);
        if (preview.error) {
            alert('Could not parse file: ' + preview.error);
            return;
        }
        const validCount = preview.valid.length;
        const invalidCount = preview.invalid.length;
        const correctionsCount = preview.corrections.length;
        let msg = `Preview: ${validCount} valid, ${invalidCount} invalid, ${correctionsCount} corrected.`;
        msg += '\n\nClick OK to log details to the console (open DevTools)';
        if (confirm(msg)) {
            console.info('Preview valid items:', preview.valid.slice(0, 50));
            console.info('Preview invalid items:', preview.invalid.slice(0, 50));
            console.info('Preview corrections:', preview.corrections.slice(0, 50));
        }
    };
    reader.onerror = function () { alert('Could not read the file'); };
    reader.readAsText(file);
}

function importQuestionsFromFile() {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput) {
        alert('File input not found. Please try again.');
        return;
    }
    
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a JSON file first');
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.json') && !file.name.toLowerCase().endsWith('.txt')) {
        alert('Please select a JSON (.json) or text (.txt) file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result.trim();
            if (!text) {
                alert('File is empty');
                return;
            }
            
            const mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'auto';
            let importedQuestions = [];
            let corrections = [];
            if (mode === 'plain') {
                const p = parsePlainTextLines(text);
                if (p.error) { alert('❌ Could not parse plain text file: ' + p.error); return; }
                if (p.corrections && p.corrections.length) corrections = corrections.concat(p.corrections);
                importedQuestions = (p.parsed || []).map(q => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
            } else {
                const parseResult = parseJSONLenient(text);
                if (parseResult.sanitized) {
                    console.info('Sanitized file JSON before parsing. View the sanitized version via parseJSONLenient in console.');
                }
                if (parseResult.error) {
                    if (mode === 'auto') {
                        // try plain text fallback
                        const p = parsePlainTextLines(text);
                        if (!p.error) {
                            importedQuestions = (p.parsed || []).map(q => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
                            if (p.corrections && p.corrections.length) corrections = corrections.concat(p.corrections);
                        } else {
                            alert('❌ Invalid JSON format. Could not parse file:\n\n' + parseResult.error);
                            return;
                        }
                    } else {
                        alert('❌ Invalid JSON format. Could not parse file:\n\n' + parseResult.error);
                        return;
                    }
                } else {
                    importedQuestions = parseResult.parsed;
                    if (parseResult.corrections) corrections = corrections.concat(parseResult.corrections);
                }
            }
            // If object with `questions` property or nested array, extract it
            if (!Array.isArray(importedQuestions)) {
                const arr = findQuestionsArray(importedQuestions);
                if (arr) importedQuestions = arr;
            }
            
            if (!Array.isArray(importedQuestions)) {
                alert('Invalid format: Questions must be an array. Example:\n[{"question":"...", "options":["...","...","...","..."], "correctAnswer":0}]');
                return;
            }
            
            if (importedQuestions.length === 0) {
                alert('The array is empty. Please provide at least one question.');
                return;
            }
            
            // Validate and normalize each question
            const validQuestions = [];
            const invalidQuestions = [];
            
            importedQuestions.forEach((q, index) => {
                const normalizedResult = normalizeQuestion(q);
                if (!normalizedResult.ok) {
                    invalidQuestions.push({ index: index + 1, reason: normalizedResult.reason });
                    return;
                }
                const nq = normalizedResult.question;
                if (q.question !== nq.question || JSON.stringify(q.options) !== JSON.stringify(nq.options) || q.correctAnswer !== nq.correctAnswer) {
                    corrections.push({ index: index + 1, original: q, fixed: nq });
                }
                if (!Array.isArray(nq.options) || nq.options.length < 4) {
                    invalidQuestions.push({ index: index + 1, reason: 'Options must be an array with exactly 4 items (or at least 4) after autocorrection' });
                    return;
                }
                validQuestions.push({
                    id: Date.now() + index + Math.random(),
                    question: nq.question,
                    options: nq.options.map(opt => opt.trim()),
                    correctAnswer: nq.correctAnswer,
                });
            });
            
            if (validQuestions.length === 0) {
                let errorMsg = 'No valid questions found. Each question must have:\n';
                errorMsg += '- question: string (required)\n';
                errorMsg += '- options: array of exactly 4 strings (required)\n';
                errorMsg += '- correctAnswer: number 0-3 (required)\n\n';
                if (invalidQuestions.length > 0) {
                    errorMsg += 'Errors found:\n';
                    invalidQuestions.slice(0, 5).forEach(inv => {
                        errorMsg += `Question ${inv.index}: ${inv.reason}\n`;
                    });
                }
                alert(errorMsg);
                return;
            }
            
            let message = `Found ${validQuestions.length} valid question(s).`;
            if (corrections.length > 0) message += `\n${corrections.length} question(s) were automatically corrected.`;
            if (invalidQuestions.length > 0) message += `\n${invalidQuestions.length} invalid question(s) will be skipped.`;
            message += `\n\nAdd ${validQuestions.length} question(s) to existing questions?`;
            
            if (confirm(message)) {
                // Add questions to existing ones (not replace)
                quizApp.questions = [...quizApp.questions, ...validQuestions];
                saveToLocalStorage();
                closeImportQuestions();
                // Refresh the questions tab
                setTimeout(() => {
                    switchAdminTab('questions');
                    alert(`✅ Successfully imported ${validQuestions.length} question(s) from file!\n\nTotal questions: ${quizApp.questions.length}`);
                    if (corrections.length > 0) {
                        console.info('Corrections made to imported questions:', corrections.slice(0, 10));
                    }
                }, 100);
            }
        } catch (error) {
            alert('❌ Invalid JSON format. Please check your file:\n\n' + error.message + '\n\nExample format:\n[{"question":"What is 2+2?","options":["3","4","5","6"],"correctAnswer":1}]');
            console.error('Import error:', error);
        }
    };
    
    reader.onerror = function() {
        alert('❌ Error reading file. Please make sure the file is not corrupted and try again.');
    };
    
    reader.readAsText(file);
}

// Export Questions Function
function exportQuestions() {
    if (quizApp.questions.length === 0) {
        alert('No questions to export!');
        return;
    }
    
    const questionsToExport = quizApp.questions.map(q => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
    }));
    
    const jsonStr = JSON.stringify(questionsToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decoder-questions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exported ${questionsToExport.length} question(s) to JSON file!`);
}

// Add admin login button to welcome screen (can be added via browser console or a hidden link)
// For production, you might want to add a subtle admin link

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Admin access sequence: first press Ctrl+Shift+A to unlock a short window, then press Ctrl+J to open login.
// This makes admin entry more hidden. The unlock window lasts for 8 seconds.
(function() {
    let adminUnlockUntil = 0;
    const UNLOCK_WINDOW_MS = 8 * 1000; // 8 seconds

    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts while typing in inputs or textareas
        const target = e.target || e.srcElement;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : null;
        const isTyping = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
        if (isTyping) return;

        const key = (e.key || '').toLowerCase();
        const ctrlOrMeta = e.ctrlKey || e.metaKey; // support Cmd on macOS

        // Phase 1: Ctrl+Shift+A to arm
        if (e.ctrlKey && e.shiftKey && key === 'a') {
            e.preventDefault();
            adminUnlockUntil = Date.now() + UNLOCK_WINDOW_MS;
            // Do not reveal UI; provide a console hint for admins who know the flow
            console.info('Admin unlock armed for a short window. Press Ctrl+J now to open admin login.');
            return;
        }

        // Phase 2: Ctrl+J within the unlock window to open admin login/dashboard
        if (ctrlOrMeta && !e.shiftKey && key === 'j') {
            e.preventDefault();
            if (Date.now() <= adminUnlockUntil) {
                // armed -> show login (always require password)
                showAdminLogin();
            } else {
                // Not armed; ignore to keep admin access hidden
                // Optionally, you could flash a tiny hint in console without exposing UI
                console.warn('Admin access not armed. Press Ctrl+Shift+A then Ctrl+J within a short time window.');
            }
            return;
        }
    });
})();

// Ensure import/export functions are globally accessible
if (typeof window !== 'undefined') {
    window.showImportQuestions = showImportQuestions;
    window.closeImportQuestions = closeImportQuestions;
    window.importQuestionsFromText = importQuestionsFromText;
    window.importQuestionsFromFile = importQuestionsFromFile;
    window.exportQuestions = exportQuestions;
    // Helpers for debugging import behavior
    window.sanitizeJSONText = sanitizeJSONText;
    window.parseJSONLenient = parseJSONLenient;
    window.normalizeQuestion = normalizeQuestion;
    window.previewImportedQuestions = previewImportedQuestions;
}

// PWA Install Prompt handling (Android)
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('hidden');
    const installBtn = document.getElementById('install-cta');
    const dismissBtn = document.getElementById('install-dismiss');
    if (installBtn) {
        installBtn.onclick = async () => {
            try {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                deferredInstallPrompt = null;
            } catch (err) {
                console.warn('Install prompt failed', err);
            }
            if (banner) banner.classList.add('hidden');
        };
    }
    if (dismissBtn) {
        dismissBtn.onclick = () => {
            if (banner) banner.classList.add('hidden');
        };
    }
});

