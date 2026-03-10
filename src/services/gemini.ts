import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateItinerary(params: {
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  numericBudget?: string;
  interests: string[];
}) {
  const { destination, startDate, endDate, budget, numericBudget, interests } = params;
  
  const budgetText = numericBudget ? `${budget} (Total Budget: $${numericBudget})` : budget;
  
  const prompt = `Generate a detailed day-by-day travel itinerary for a trip to ${destination}.
  Dates: ${startDate} to ${endDate}.
  Budget: ${budgetText}.
  Interests: ${interests.join(', ')}.
  
  Please include:
  1. A summary of the trip.
  2. Day-by-day breakdown with specific activities (morning, afternoon, evening).
  3. Recommended restaurants and local dishes to try.
  4. Estimated costs for accommodation, food, and activities.
  5. Travel tips specific to the destination.
  
  CRITICAL INSTRUCTION FOR IMAGES:
  For every specific place, attraction, or restaurant you suggest, you MUST include an image placeholder using this exact markdown syntax:
  ![Name of Place](https://wiki-image.local/Name_of_Place)
  
  Example:
  Visit the iconic ![Eiffel Tower](https://wiki-image.local/Eiffel_Tower) in the morning.
  
  Format the rest of the output in clear Markdown. Use headers for each day.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }], // Using search for up-to-date info
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error generating itinerary:", error);
    throw error;
  }
}
