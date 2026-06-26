import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.NVIDIA_API_KEY || "mock-api-key";

if (!process.env.NVIDIA_API_KEY) {
  console.warn(
    "[WARNING] NVIDIA_API_KEY environment variable is not defined. Using mock AI responses."
  );
}

const aiClient = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: apiKey,
});

export default aiClient;
export const AI_MODEL = "meta/llama-3.1-8b-instruct";
