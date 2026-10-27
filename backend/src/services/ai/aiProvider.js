import { GoogleGenAI } from "@google/genai";

/**
 * Modular AI Provider Layer
 *
 * Implements Section 1 Rule 8 & 10:
 * - Keep all AI services modular, so a real LLM can be connected seamlessly.
 * - Never expose passwords, hashes, tokens, or private documents to the model.
 * - Deterministic, verified fallback when no remote LLM key is configured.
 */

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;

let _aiClient = null;
if (GEMINI_API_KEY) {
  try {
    _aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (err) {
    console.warn("Failed to initialize GoogleGenAI client:", err.message);
  }
}

/**
 * Sanitize an object or array before passing into prompt or returning to users.
 * Strips password hashes, auth tokens, reset tokens, and internal encryption keys.
 */
export function sanitizeContextData(data) {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeContextData);
  }
  if (typeof data !== "object") return data;

  const sensitiveKeys = new Set([
    "password",
    "passwordHash",
    "password_hash",
    "token",
    "sessionToken",
    "jwtSecret",
    "resetToken",
    "credentialNonce",
    "apiKey",
    "secret",
  ]);

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.has(key)) {
      continue;
    }
    if (value && typeof value === "object") {
      sanitized[key] = sanitizeContextData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Generate AI reasoning or completion with institutional guardrails.
 *
 * @param {Object} options
 * @param {string} options.systemInstruction - Context & institutional role instructions
 * @param {string} options.userPrompt - User or operational query
 * @param {any} [options.contextData] - Structured records verified from database
 * @param {string} [options.fallbackSynthesis] - Deterministic fallback text if no LLM active
 * @returns {Promise<{ text: string, provider: "gemini" | "deterministic", latencyMs: number }>}
 */
export async function executeAIReasoning({
  systemInstruction = "You are the CollegeOS Institutional Operating System Intelligence Assistant. Always provide verified, concise, accurate analysis.",
  userPrompt,
  contextData = null,
  fallbackSynthesis = "",
}) {
  const startTime = Date.now();
  const safeData = sanitizeContextData(contextData);

  if (_aiClient && GEMINI_API_KEY) {
    try {
      const promptParts = [
        `SYSTEM INSTRUCTIONS:\n${systemInstruction}`,
        safeData ? `\nVERIFIED INSTITUTIONAL DATA:\n${JSON.stringify(safeData, null, 2)}` : "",
        `\nUSER QUERY:\n${userPrompt}`,
      ].filter(Boolean).join("\n\n");

      const response = await _aiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptParts,
      });

      const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        return {
          text: responseText.trim(),
          provider: "gemini",
          latencyMs: Date.now() - startTime,
        };
      }
    } catch (err) {
      console.warn("GenAI API call failed, falling back to deterministic synthesis:", err.message);
    }
  }

  // Deterministic institutional synthesis fallback
  const fallback =
    fallbackSynthesis ||
    (safeData
      ? `CollegeOS Intelligence analysis based on ${Array.isArray(safeData) ? safeData.length : 1} verified institutional record(s):\n${JSON.stringify(safeData, null, 2)}`
      : "CollegeOS Intelligence evaluated your request against authorized institutional records.");

  return {
    text: fallback,
    provider: "deterministic",
    latencyMs: Date.now() - startTime,
  };
}
