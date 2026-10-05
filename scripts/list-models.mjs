import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Prints the Flash-family models this API key can use
const pager = await ai.models.list();
for await (const model of pager) {
    if (model.name.includes("flash")) console.log(model.name, "-", model.displayName);
}