import OpenAI from "openai";

// Preserved as an option for future AI integrations (currently disabled in
// the assistant chat UI in favor of DeepSeek). Uses OPENAI_API_KEY.
const configuration = { apiKey: process.env.OPENAI_API_KEY };

const openai = new OpenAI(configuration);

export default openai;
