# Decoder Web Application

A modern, responsive "Decoder" web application built with vanilla JavaScript and HTML.

## Features

### For Participants
-- **Welcome Screen**: Enter your name and start the Decoder
-- **Decoder Screen**: 
  - Question cards with 4 multiple-choice options
  - Progress bar showing completion
  - 15-second timer with visual countdown
  - Instant feedback (Correct ✅ / Wrong ❌)
- **Summary Screen**:
  - Score percentage and statistics
  - Correct/Wrong answer breakdown
  - Your rank on the leaderboard
  - Detailed answer review
  - Redeem code modal for perfect scorers (with copy button)
- **Leaderboard**: View top 10 scorers sorted by score and time

### For Admins
**Secure Login**: Default admin credentials are:

- Username: `jeevan`
- Password: `jeevuabhi123`

For security, change the default password immediately by running `setAdminPassword('your-strong-password')` in the browser console.
-- **Question Management**: Add, edit, and delete Decoder questions
- **Redeem Code Settings**: Configure the code shown to perfect scorers
- **Site Text Settings**: Customize welcome title, subtitle, and instructions
- **Performance Dashboard**: View participant statistics and performance data

## Getting Started

1. Open `index.html` in a web browser
2. Enter your name and click "Start Decoder"
3. Answer questions within 15 seconds
4. View your results and rank on the leaderboard

## Admin Access

- **Keyboard Shortcut**: Press `Ctrl + Shift + A` to open the admin login modal (hidden in UI)
- **Configure Admin**: To configure an admin password, run the following in the browser console:

```js
// Replace <your-password> with a strong one
setAdminPassword('<your-password>')
```

After setting the password, use the keyboard shortcut to open the login modal and sign in using the admin username (default: `jeevan`) and whichever password you set.

On mobile devices without a physical keyboard, the admin modal can be opened using a hidden gesture: long-press (1 second) or tap the logo 5 times quickly to show the admin login modal.

To clear a configured admin password, run the following in the browser console:

```js
clearAdminPassword()
```

This will clear the admin password (and log out any existing admin session).

To set a custom admin username, run:

```js
setAdminUsername('jeevan')
```

This updates the username used for admin login (default: `jeevan`).

## Importing Questions (Text & File)

- The app allows importing questions by pasting JSON into the import modal or by selecting a `.json` or `.txt` file.
- Accepted field names: `question`, `options` (or `responses`), and `correctAnswer` (or `correctAnswerIndex`, or `answer` as string/number). The tool tries to normalize common variants and shapes.
- The import function attempts to auto-correct common JSON issues (smart quotes, trailing commas, single quotes, unquoted keys, comments) and normalize question shapes.
- Before importing, you can preview the import in the browser console with `previewImportedQuestions(text)`. Example:

```js
const sample = "[{'question':'What is 2+2?','responses':['3','4','5','6'],'correctAnswerIndex':1}]";
const preview = previewImportedQuestions(sample);
console.log(preview);
```

- When you press 'Import from Text' or 'Import from File', the app will show a summary: how many questions were valid, how many were auto-corrected, and how many were invalid (skipped). Corrections are logged in the console for review.

Examples (these are supported and will be parsed or corrected):

```json
[{"question":"What is 2+2?","options":["3","4","5","6"],"correctAnswer":1}]
```

```json
[{"question":"Which is the capital?","responses":["Paris","London","Rome","Berlin"],"correctAnswerIndex":0}]
```

Bad JSON with single quotes is auto-corrected:

```js
[{'question':'O\'clock?','options':['a','b','c','d'],'correctAnswer':2}]
```

## Mobile / Android

- This site includes metadata and a manifest so it can be installed to Android devices as a Progressive Web App (PWA).
- To install on Android (Chrome): open the site in Chrome -> tap the three-dot menu -> Add to Home screen -> follow prompts. The app will appear with a simple icon and run in standalone mode.
- For better mobile experience, enable "Add to Home screen" and launch from the home screen to run the PWA in standalone mode.
- To optimize for different devices, the layout uses responsive Tailwind classes and adjusts button sizes for touch devices.

### Testing on Android / Device Emulation

- Using Android device: Open the Chrome browser on your Android phone. Visit the URL (or your local server) and verify layout, form interactions, and the 'Add to Home screen' option.
- Using Chrome DevTools: Open the site in desktop Chrome and press F12 to open DevTools. Toggle the device toolbar (Ctrl+Shift+M) and choose a phone preset like 'Pixel 2/3' to simulate mobile viewport and touch. This helps verify responsive layout.
- PWA Install: On supported browsers, after visiting the site you should get an install prompt (or use the browser menu -> Add to Home screen). The small install banner also appears in the site UI when the browser fires the 'beforeinstallprompt' event.

## Design Features

- Modern gradient color scheme (blue/purple/teal)
- Smooth animations and transitions
- Fully responsive for desktop and mobile
- Tailwind CSS styling via CDN
- Inter/Roboto typography

## Data Storage

All data is stored in browser localStorage:
- Questions
- Leaderboard
- Site settings
- Redeem codes

## Cloud / Firebase notes

This copy of the app has been modified to run in local-only mode: Firebase SDKs, Cloud Functions, and Firestore rules are not required and have been removed from the shipped files. The app stores questions, leaderboard and settings in browser localStorage and uses client-side checks (48-hour cooldown, simple Gmail validation) to prevent casual duplicate attempts.

If you later want to re-enable cloud features, re-add Firebase SDKs to `index.html`, restore the `functions` and `firebase.rules` files, and provide a valid `FIREBASE_CONFIG` in `app.js` (the original cloud integration code is present in earlier commits if needed).



## Browser Support

Works in all modern browsers that support:
- ES6 JavaScript
- LocalStorage API
- CSS Grid and Flexbox

## License

Free to use and modify.

