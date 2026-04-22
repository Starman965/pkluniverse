# Firebase Setup

This rebuild expects a new Firebase project for the Blackhawk club app.

## What to create

In Firebase, create:

1. A new project for the rebuild
2. A Web app inside that project
3. Authentication with the Google provider enabled
4. Firestore Database
5. Storage

Cloud Functions can wait until we need trusted server-side actions such as guarded team creation or role repair flows.

## What you need to put in `.env`

Copy `.env.example` to `.env` and fill in:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

These values come from the Firebase Web app config.

## Authorized domains

In Firebase Authentication, add the domains you will use:

- `localhost`
- `127.0.0.1`
- your GitHub Pages domain
- your custom domain if you later use one

For this repo structure, the intended GitHub Pages app URL is:

- the root URL of the dedicated project repo, for example `https://yourname.github.io/your-repo/`

If you later attach a custom domain, add that domain in Firebase Auth authorized domains too.

## Important naming note

Your current Firebase web config still points to the existing Firebase project identifiers:

- `pxl-league.firebaseapp.com`
- `pxl-league`
- `pxl-league.firebasestorage.app`

So even though the product naming is now `PKL`, the Firebase config values should stay exactly as provided unless you create a brand-new Firebase project with `pkl`-based identifiers.

## Suggested first Firestore shape

The current scaffold is being built around:

- `users/{uid}`
- `clubs/{clubId}`
- `clubs/{clubId}/admins/{uid}`
- `clubs/{clubId}/teams/{teamId}`
- `clubs/{clubId}/teams/{teamId}/members/{uid}`
- `clubs/{clubId}/teams/{teamId}/players/{playerId}`
- `clubs/{clubId}/teams/{teamId}/games/{gameId}`
- `clubs/{clubId}/teams/{teamId}/newsPosts/{postId}`

## What I will need from you

When you are ready, send me:

1. Confirmation that the new Firebase project exists
2. The Firebase web app config values, or confirmation that you added them to `.env`
3. Whether you want me to scaffold initial Firestore rules and indexes next
