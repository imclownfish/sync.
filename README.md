# sync.

An anime discovery and personal progress tracker. It is a static website: anime data comes from AniList, and visitors can keep their watchlist locally or sign in with Google to sync it privately through Firebase.

## Run locally

Open `index.html` with a static-file server, or enable GitHub Pages and use the included workflow.

## Scope

`sync.` is a tracker and discovery app. It does not host or stream copyrighted episodes.

## Firebase

The site uses the browser Firebase SDK for Google Authentication and Cloud Firestore. The client configuration lives in `firebase.js`; Firebase configuration identifiers are intentionally public in web apps, while `firestore.rules` protects each user's document. Deploy `firestore.rules` in the Firebase Console before enabling the account button in production.
