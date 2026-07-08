// Groq chat-completions client (OpenAI-compatible) with tool calling.
import { CFG } from "fund402-agent";

export async function groqChat(messages, tools) {
  if (!CFG.groqKey) throw new Error("GROQ_API_KEY not set (in fund402-agent/.env)");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CFG.groqKey}` },
    body: JSON.stringify({
      model: CFG.groqModel,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.choices?.[0]?.message;
}
