## Phase 0: Minimal PoC (fast)

Create a small backend (Node.js + Express) with:
User model in a small DB (MongoDB Cluster).
Simple OAuth (Google using googleapis).
/api/profile GET/POST
/api/generate that accepts tweet_text and returns a generated reply using our existing prompt template that concatenates the profile summary.

# Prompt Template
const tonePromptMap = {
  "Default": "Write a natural, concise reply as if you're responding to a friend's tweet. Don't sound robotic or overly formal.",
  "Funny": "Write a witty and playful reply. Use harmless sarcasm, puns, or light humor. Keep it short and meme-like.",
  "Sarcastic": "Reply with obvious exaggeration and dry wit. Your response should mock the tweet lightly without being mean. Keep it concise. Aim for 1-2 sentences.",
  "Sincere": "Respond in a heartfelt and genuine way. Be kind, thoughtful, and human. No exaggerations or jokes. Keep it to 1-2 sentences.",
  "One-liner": "Craft a punchy one-line reply that could go viral. Keep it under 15 words. No fluff.",
  "Asking": "Turn your reply into a thoughtful question or follow-up. Make it sound curious and engaging. Limit to one short question.",
  "Friendly": "Write a warm and casual reply like you're chatting with someone you like. Use emojis if natural. Keep it to a maximum of 2 sentences.",
  "Thanking": "Compose a short and grateful reply. Be polite and appreciative, but avoid sounding overly formal. Ensure it's a single, very brief sentence."
};

# Update extension:
Add sign-in button that opens auth flow.
On sign-in, store access token.
If user not logged in then only show the sign in button, if logged in then show the existing API key input, test api key and start automation button (don't need any change in this page).

## Phase 1: Add RAG & embeddings

Add embeddings pipeline: on profile save create embeddings for slices and store in vector DB (or a simple local vector index for PoC).
Update /api/generate to retrieve top-k snippets and include them in prompt.

## Phase 2: Production hardening

OAuth SSO + email fallback.
Proper refresh tokens, device management, revoke sessions.
GDPR: delete endpoint, export data endpoint.
Add monitoring, logging, rate limiting, unit/integration tests.
Provide a web dashboard for profile editing and a billing/subscription page.

## Example API contract & pseudo-code
API contract (concise):

GET /api/profile

Response:
{ id, display_name, role, short_bio, projects: [{name, url, description}], preferences }
POST /api/profile

Body: partial profile updates
POST /api/generate

Body:
{ tweet_text: string, intent?: "reply"|"promote"|"question", tone?: string }
Response:
{ reply: string, used_context: [ {id, snippet, relevance_score} ] }
Server-side generate algorithm (pseudo-code):

Authenticate user from token.
Load profile summary and preference flags.
If using embeddings:
a. Generate embedding for tweet_text (and intent).
b. Retrieve top-k profile snippets from vector DB.
c. Optionally summarize snippets to reduce tokens.
Compose prompt:
System message with user summary and promotion policy.
Context snippets.
User message: "Reply to tweet: {tweet_text}"
Call LLM API with parameters (temperature, max_tokens).
Post-process: truncate to X chars, ensure no disallowed content, return.
Client-side flow for extension (pseudo):

User clicks "Generate reply" on a tweet.
Extension sends POST /api/generate with tweet_text (and metadata).
Backend returns reply.
Extension displays reply; user edits and posts.
9) Prompt template (example)
System:
"You are an assistant that writes short, natural Twitter replies for a user. Use the user profile and context snippets. Respect their promotion policy. Provide one or two short sentence replies, avoid jargon, and keep it under {char_limit} characters. Tone: {tone}."

Context block:
"USER_SUMMARY: {display_name} - {role} - likes: {skills} - bio: {short_bio}
CONTEXT_SNIPPETS:

{snippet1}
{snippet2}
PROMOTION_POLICY: {allow_branding}"
User:
"Tweet: {tweet_text}
Generate 1 suggested reply."

This template can be adjusted per model provider.