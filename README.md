# Block Lending

A tiny Carousell for up to ten neighbours in one block. Neighbours list things they're happy to lend, such as a drill, a ladder or a steamboat pot, and ask to borrow each other's.

- **One record:** an item, picked from a list of common things (each with an icon) or "Others"
- **One shared action:** ask to borrow. The owner then lends it or declines, and later marks it returned.
- **One rule:** everyone sees every item. Only the owner can change their item, and only the person who asked can cancel a request.
- **Login:** join with your name, unit, a 4-digit PIN and the block's join code. The group is capped at 10 members.

## Run it

Needs Node 22.5 or later, for the built-in SQLite. There's nothing to install.

```
JOIN_CODE=yourcode npm start      # http://localhost:3003  (PORT=… to change)
npm run reset                     # stop the server first; deletes the database
```

The data is saved to `data/lending.db`, a single SQLite file. See [PLAN.md](PLAN.md) for the full spec and API.
