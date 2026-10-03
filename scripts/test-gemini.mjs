import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: "Reply with exactly: Gemini is working",
});

console.log(response.text);