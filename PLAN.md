# Block Lending — plan

A tiny Carousell for borrowing and lending within one HDB block.

## Who are the ten?

Up to ten neighbours in the same block (e.g. a corridor or floor chat group). They already know each other by name and unit number. They own things they rarely use: a drill, a ladder, a steamboat pot, a tent, board games. They'd rather borrow from next door than buy.

## What do they do together?

Neighbours post things they're happy to lend, and others ask to borrow them.

## Scope (from the brief)

| | |
|---|---|
| **One main record** | **Item**: kind (picked from a list of common things to lend, each with an icon, or "Others" with a typed name), title, short note, owner, status (`available` → `requested` → `lent` → back to `available`), borrower |
| **One shared action** | **Ask to borrow.** Any neighbour can request an available item, and the owner then lends it or declines. |
| **One rule** | Everyone in the group can **see** every item. Only the **owner** can edit, delete, lend or mark an item returned. Only the **requester** can cancel their own request. |

Out of scope: chat, photos, due dates, ratings, more than one block.

## Login

- **Join** with your name, unit number, a 4-digit PIN and the block's **join code** (set by whoever runs the server). The group closes at 10 members.
- **Log in** with your name + PIN. The session is a random token in an HttpOnly cookie, stored in the database.
- PINs are hashed with scrypt. After 5 wrong PINs for a name, that name is locked out for 5 minutes.

## Stack

- `server.js`: bare Node `http` server, with no dependencies. It serves `public/` and a small JSON API.
- Database: Node's built-in `node:sqlite`, a single file at `data/lending.db` (not committed).
- `public/`: `index.html`, `app.js`, `style.css` and `kinds.js` (the list of item kinds and their SVG icons, also `require`d by the server). Plain JS, no build step.

Run with `npm start` (port 3003, or `PORT=…`). The join code comes from `JOIN_CODE` (default `block123`).

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/join` `{name, unit, pin, code}` | anyone with the code, while < 10 members |
| POST | `/api/login` `{name, pin}` | members |
| POST | `/api/logout` | logged in |
| GET | `/api/me` | logged in |
| GET | `/api/items` | logged in (everyone sees everything) |
| POST | `/api/items` `{kind, title, note}` (title only used for `other`) | logged in |
| PATCH | `/api/items/:id` `{action}` | `request` / `cancel`: a non-owner; `lend` / `decline` / `returned` / `edit`: owner only |
| DELETE | `/api/items/:id` | owner only, and not while lent |
