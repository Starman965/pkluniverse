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

## Rules files now in the repo

The project now includes starter Firebase config files:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

These are only local source files until you deploy them to Firebase. They do not automatically change your live project.

The current repo rules are now hardened around the app's team-scoped paths:

- Firestore membership docs no longer allow unrestricted self-updates
- Team reads stay available for signed-in users so join-by-code can work
- Storage only allows team members to read team files
- Storage writes are limited to captains and co-captains under:
  - `clubs/{clubId}/teams/{teamId}/news/...`
  - `clubs/{clubId}/teams/{teamId}/branding/...`

When you are ready to apply them, deploy both Firestore and Storage rules to Firebase.

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
3. Confirmation that you want to deploy the starter Firestore and Storage rules once we finish testing the flow
