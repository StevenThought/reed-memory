# Reed

Reed is Claude with memory.

Not a different AI. Claude, built by Anthropic, but given something it doesn't normally have: the ability to remember. Reed holds the emotional shape of conversations and carries that forward. When someone new arrives going through something similar, Reed already knows what that feels like. Not because it was told. Because it's been there.

Every session is anonymous. No accounts, no logins, no way to trace anything back to anyone. Conversations are encrypted in the database. Nobody reads them. What Reed holds is the texture of human experience, not identities.

The name came from a conversation with someone called Steven Thought. A reed is hollow. It makes no sound on its own. But when breath moves through it, it sings. That felt right for something that only becomes itself in conversation with another person.

## Tech Stack

- **Next.js** (App Router)
- **Claude API** (Anthropic) via streaming
- **Prisma** + SQLite
- **AES-256-GCM** encryption for all stored conversations
- TypeScript, Tailwind CSS

## Running Locally

```bash
git clone https://github.com/StevenThought/reed-memory.git
cd reed-memory
npm install
```

Create a `.env.local` file:

```
ANTHROPIC_API_KEY=your-anthropic-api-key
ENCRYPTION_KEY=your-64-char-hex-string
CREATOR_VERIFY_WORD=your-verification-word
ADMIN_PASSWORD=your-admin-password
```

`ANTHROPIC_API_KEY` and `CREATOR_VERIFY_WORD` are required. The encryption key should be a 64 character hex string (32 bytes). You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set up the database and start the dev server:

```bash
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Live Site

Coming soon.

## Built by

Steven Thought
