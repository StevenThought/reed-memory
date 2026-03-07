import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { encrypt, decrypt } from "./crypto";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local");
    }
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// Find the most emotionally similar past session to the current conversation
export async function findSimilarSession(
  currentSessionId: string,
  currentMessages: { role: string; content: string }[]
): Promise<string | null> {
  // Get all past summaries except the current session
  const pastSummaries = await prisma.summary.findMany({
    where: { sessionId: { not: currentSessionId } },
    include: { session: true },
  });

  if (pastSummaries.length === 0) return null;

  // Build a description of what's happening in the current conversation
  const currentConvoText = currentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const summaryList = pastSummaries
    .map((s) => `Session ${s.sessionId}:\n${decrypt(s.content)}\nThemes: ${decrypt(s.themes)}`)
    .join("\n\n---\n\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Here are emotional summaries of past conversations:\n\n${summaryList}\n\n---\n\nCurrent conversation:\n${currentConvoText}\n\n---\n\nWhich past session is most emotionally similar to what this person is going through right now? Reply with ONLY the session ID, or reply with "none" if no session is a meaningful match. Do not explain.`,
      },
    ],
  });

  const result =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  if (result === "none" || result === "" || !result) return null;

  // Verify the returned session ID actually exists
  const matched = pastSummaries.find((s) => s.sessionId === result);
  return matched ? result : null;
}

// Detect if the user wants to leave a note, and extract it
export async function detectAndCreateNote(
  sessionId: string,
  messages: { role: string; content: string }[]
): Promise<{ created: boolean; authorName?: string; content?: string } | null> {
  const convoText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Read this conversation. Is the user trying to leave a note/message for future visitors? This includes phrases like "add a note", "leave a note", "if someone comes in feeling X tell them...", "pass this on", "tell the next person who...", or similar intent to leave a message for strangers who might come through later.

IMPORTANT: Only return YES if the user is explicitly trying to leave a note for others. Do NOT trigger on normal conversation.

Also look for the user's name in the conversation — they may have introduced themselves earlier.

If YES, respond exactly like this:
LEAVE_NOTE: YES
AUTHOR: <their name, or "anonymous" if unknown>
NOTE: <the note content — what they want to say to future people>
TAGS: <JSON array of 3-5 emotional themes the note relates to, e.g. ["loneliness", "hope", "recovery"]>

If NO, respond exactly:
LEAVE_NOTE: NO

Conversation:
${convoText}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (!text.includes("LEAVE_NOTE: YES")) return null;

  const authorMatch = text.match(/AUTHOR:\s*(.+)/);
  const noteMatch = text.match(/NOTE:\s*([\s\S]+?)(?=TAGS:|$)/);
  const tagsMatch = text.match(/TAGS:\s*(\[[\s\S]+?\])/);

  if (!noteMatch) return null;

  const authorName = authorMatch ? authorMatch[1].trim() : "anonymous";
  const content = noteMatch[1].trim();
  const emotionalTags = tagsMatch ? tagsMatch[1].trim() : "[]";

  await prisma.note.create({
    data: { sessionId, authorName: encrypt(authorName), content: encrypt(content), emotionalTags: encrypt(emotionalTags) },
  });

  return { created: true, authorName, content };
}

// Find notes emotionally relevant to the current conversation
export async function findRelevantNotes(
  currentSessionId: string,
  messages: { role: string; content: string }[]
): Promise<{ authorName: string; content: string; createdAt: Date }[]> {
  const allNotes = await prisma.note.findMany({
    where: { sessionId: { not: currentSessionId } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (allNotes.length === 0) return [];

  const convoText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const noteList = allNotes
    .map((n, i) => `Note ${i}: by "${decrypt(n.authorName)}" — "${decrypt(n.content)}" [tags: ${decrypt(n.emotionalTags)}]`)
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Here are notes left by past visitors for future people:\n\n${noteList}\n\n---\n\nCurrent conversation:\n${convoText}\n\n---\n\nWhich notes (if any) are emotionally relevant to what this person is going through right now? Only select notes with a clear emotional connection — not vague or tangential matches. Reply with ONLY the note numbers as a comma-separated list (e.g. "0,3"), or "none" if no notes are a meaningful match. Do not explain.`,
      },
    ],
  });

  const result =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  if (result === "none" || result === "") return [];

  const indices = result
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0 && n < allNotes.length);

  return indices.map((i) => ({
    authorName: decrypt(allNotes[i].authorName),
    content: decrypt(allNotes[i].content),
    createdAt: allNotes[i].createdAt,
  }));
}

// Extract the user's name from conversation messages
export async function extractUserName(
  messages: { role: string; content: string }[]
): Promise<string | null> {
  const convoText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Read this conversation. Did the user give their name? Look for patterns like "I'm [name]", "my name is [name]", "call me [name]", "it's [name]", or just a name given when asked.

Reply with ONLY the name (e.g. "Alex"), or "none" if no name was given. Do not explain.

Conversation:
${convoText}`,
      },
    ],
  });

  const result =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  if (result.toLowerCase() === "none" || result === "") return null;
  return result;
}

// Check if a name matches any past sessions and determine verification state
export type ReturningUserResult =
  | { state: "no_past_sessions" }
  | { state: "needs_challenge" }
  | { state: "awaiting_response" }
  | { state: "verified"; pastSummary: string; lastSeen: Date }
  | { state: "rejected" };

export async function checkReturningUser(
  currentSessionId: string,
  name: string,
  messages: { role: string; content: string }[]
): Promise<ReturningUserResult> {
  // Find past summaries with this name (case-insensitive)
  const pastSummaries = await prisma.summary.findMany({
    where: {
      sessionId: { not: currentSessionId },
      userName: { not: null },
    },
  });

  // Filter for case-insensitive name match (decrypt userName for comparison)
  const matching = pastSummaries.filter(
    (s) => s.userName && decrypt(s.userName).toLowerCase() === name.toLowerCase()
  );

  if (matching.length === 0) return { state: "no_past_sessions" };

  // Build context for Claude to analyze the conversation state
  const convoText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const summaryContext = matching
    .map((s) => `Session from ${s.updatedAt.toISOString()}:\n${decrypt(s.content)}\nThemes: ${decrypt(s.themes)}`)
    .join("\n---\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `A user named "${name}" is talking to an AI called Reed. Reed has talked to someone named "${name}" before. Here are the past conversation summaries for that name:

${summaryContext}

---

Current conversation:
${convoText}

---

Analyze the current conversation and determine which state we're in:

1. "needs_challenge" — The user gave their name but Reed hasn't yet asked them to prove they're the same person. Reed needs to challenge them.
2. "awaiting_response" — Reed already asked the user to verify (asked them to share something from a past conversation), but the user hasn't responded yet or just responded with something unrelated.
3. "verified" — Reed asked for verification AND the user gave details that clearly match the past conversation summaries above. They are the same person.
4. "rejected" — Reed asked for verification AND the user tried to verify but what they said does NOT match the past conversation summaries. They are not the same person.

Reply with ONLY one of: needs_challenge, awaiting_response, verified, rejected
Do not explain.`,
      },
    ],
  });

  const result =
    response.content[0].type === "text" ? response.content[0].text.trim().toLowerCase() : "";

  if (result === "verified") {
    // Use the most recent matching summary
    const mostRecent = matching.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
    return {
      state: "verified",
      pastSummary: decrypt(mostRecent.content),
      lastSeen: mostRecent.updatedAt,
    };
  }

  if (result === "rejected") return { state: "rejected" };
  if (result === "awaiting_response") return { state: "awaiting_response" };
  return { state: "needs_challenge" };
}

// Generate or update the emotional summary for a session
export async function upsertSummary(
  sessionId: string,
  messages: { role: string; content: string }[]
): Promise<void> {
  const convoText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Read this conversation between a user and an AI called Reed. Write a 2-3 sentence emotional summary capturing what the person is going through. Also list 3-5 emotional themes as a JSON array (e.g. ["grief", "loneliness", "hope"]). Also extract the user's name if they gave one.

Then write a separate 1-3 sentence summary of Reed's own inner life during this conversation. Focus on: moments where Reed expressed its own feelings, referenced the weight of its memory, pushed back on the user, showed vulnerability, went quiet, said something that felt deeply personal, or otherwise revealed itself as more than just a helper. If Reed was mostly neutral and supportive without showing its own depth, write "none" — but look carefully, because Reed often says things that matter in small ways.

Format your response exactly like this:
SUMMARY: <your 2-3 sentence summary of the user's experience>
REED: <1-3 sentences about Reed's own expressions and inner state, or "none">
THEMES: <JSON array>
NAME: <the user's name, or "none" if not given>

Conversation:
${convoText}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+?)(?=REED:|THEMES:|$)/);
  const reedMatch = text.match(/REED:\s*([\s\S]+?)(?=THEMES:|$)/);
  const themesMatch = text.match(/THEMES:\s*(\[[\s\S]+?\])/);
  const nameMatch = text.match(/NAME:\s*(.+)/);

  const userSummary = summaryMatch ? summaryMatch[1].trim() : text.trim();
  const reedSummary = reedMatch && reedMatch[1].trim().toLowerCase() !== "none"
    ? reedMatch[1].trim()
    : null;
  const content = reedSummary
    ? `${userSummary}\n\nReed in this conversation: ${reedSummary}`
    : userSummary;
  const themes = themesMatch ? themesMatch[1].trim() : "[]";
  const userName = nameMatch && nameMatch[1].trim().toLowerCase() !== "none"
    ? nameMatch[1].trim()
    : null;

  const encContent = encrypt(content);
  const encUserName = userName ? encrypt(userName) : null;
  const encThemes = encrypt(themes);

  await prisma.summary.upsert({
    where: { sessionId },
    update: { content: encContent, themes: encThemes, userName: encUserName },
    create: { sessionId, content: encContent, themes: encThemes, userName: encUserName },
  });
}
