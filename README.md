# Study Room

A private, real-time study room web app.

## Features

- Create a private room with a random 6-character code
- Friends join using the room code
- Real-time room chat
- Shared Pomodoro timer
- Custom study and break lengths
- Start / pause / reset / skip
- Everyone in the room sees the same timer
- Online member list
- Responsive single-page interface

## Run it

You need Node.js 18+.

```bash
npm install
npm start
```

Then open:

http://localhost:3000

To test multiple people on one computer, open the URL in multiple browser windows/tabs.

## Put it online

This app needs a Node.js host because Socket.IO provides the real-time connection.

Good simple options include Render, Railway, Fly.io, or a VPS. Set the start command to:

```bash
npm start
```

The app uses `process.env.PORT`, so hosts that provide a PORT variable work automatically.

## Privacy note

Rooms live in server memory. A room disappears when the last person leaves or the server restarts. Room codes are random and are the access mechanism. For a production app, add accounts/authentication, HTTPS, rate limiting, moderation, persistent storage, and stronger room access controls.
