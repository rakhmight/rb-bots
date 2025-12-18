// src/llm.js
import OpenAI from "openai";
import { SYSTEM_PROMPT, DEV_PREFIX } from "./prompts.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ASR_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

/**
 * Текст → ответ (стандартный формат RED/AMBER/GREEN)
 */
export async function generateAnswer(userText, model = DEFAULT_MODEL) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: DEV_PREFIX },
    { role: "user", content: userText }
  ];
  const started = Date.now();
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700
  });
  const ms = Date.now() - started;
  const answer = resp.choices?.[0]?.message?.content?.trim() || "Извините, не удалось сформировать ответ.";
  const usage = resp.usage || {};
  return { answer, usage, latencyMs: ms };
}

/**
 * Изображение (+ необязательная подпись) → ответ.
 * imageUrl — публичная ссылка (Telegram file link).
 */
export async function generateAnswerWithImage(captionText = "", imageUrl, model = DEFAULT_MODEL) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: DEV_PREFIX },
    {
      role: "user",
      content: [
        { type: "text", text: captionText || "Посмотри изображение и дай ответ по формату." },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }
  ];
  const started = Date.now();
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700
  });
  const ms = Date.now() - started;
  const answer = resp.choices?.[0]?.message?.content?.trim() || "Извините, не удалось сформировать ответ.";
  const usage = resp.usage || {};
  return { answer, usage, latencyMs: ms };
}

/**
 * Распознать речь с URL (Telegram file link).
 * Возвращает распознанный текст.
 */
export async function transcribeFromUrl(fileUrl, model = ASR_MODEL) {
  // Скачаем в память и передадим как Blob/File в SDK
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const extGuess = (res.headers.get("content-type") || "").includes("ogg") ? "oga"
                 : (res.headers.get("content-type") || "").includes("mpeg") ? "mp3"
                 : (res.headers.get("content-type") || "").includes("wav") ? "wav"
                 : "audio";
  const file = new File([new Uint8Array(arrayBuf)], `voice.${extGuess}`, { type: res.headers.get("content-type") || "application/octet-stream" });

  const resp = await client.audio.transcriptions.create({
    file,
    model
  });
  return (resp.text || "").trim();
}
