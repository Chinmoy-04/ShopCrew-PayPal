console.log(`Record LLM replies into fixtures/llm-replay.json:

1. Put a Gemini or Groq key in .env
2. Set LLM_PROVIDER=gemini (or groq) and LLM_RECORD=1
3. Run the demo day once: npm run dev, then Advance 1 day
4. Set LLM_PROVIDER=replay again before you publish

Replay mode needs no key. Judges and CI use it.
`);
