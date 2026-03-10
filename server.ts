import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate-itinerary", async (req, res) => {
    try {
      const { destination, startDate, endDate, budget, interests } = req.body;
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const prompt = `Generate a detailed day-by-day travel itinerary for a trip to ${destination}.
      Dates: ${startDate} to ${endDate}.
      Budget: ${budget}.
      Interests: ${interests.join(', ')}.
      
      Please include:
      1. A summary of the trip.
      2. Day-by-day breakdown with specific activities (morning, afternoon, evening).
      3. Recommended restaurants and local dishes to try.
      4. Estimated costs for accommodation, food, and activities.
      5. Travel tips specific to the destination.
      
      Format the output in clear Markdown. Use headers for each day.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({ itinerary: response.text });
    } catch (error) {
      console.error("Error generating itinerary:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, context } = req.body;
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const systemInstruction = `You are a helpful travel assistant. 
      ${context ? `The user is currently looking at an itinerary for ${context.destination} from ${context.startDate} to ${context.endDate} with a ${context.budget} budget. Here is the itinerary context: ${context.itinerary}` : 'The user is planning a trip.'}
      Answer their questions concisely and helpfully.`;

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
        },
      });

      // We need to send the history to the chat if possible, but the SDK's chat.sendMessage doesn't take history directly in the create method easily without specific formats.
      // Alternatively, we can just use generateContent with the history formatted as a prompt.
      
      const formattedHistory = history.map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
      const prompt = `${formattedHistory}\nUser: ${message}\nAssistant:`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({ reply: response.text });
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  app.get("/api/location/search", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }

      // OpenStreetMap Nominatim API (Free, no key required)
      const searchResponse = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query as string)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'VagabondAI-TravelApp/1.0'
          }
        }
      );

      if (searchResponse.data && searchResponse.data.length > 0) {
        const place = searchResponse.data[0];
        res.json({
          name: place.name,
          display_name: place.display_name,
          lat: place.lat,
          lon: place.lon,
          type: place.type
        });
      } else {
        res.status(404).json({ error: "Location not found" });
      }
    } catch (error) {
      console.error("Error fetching location from OSM:", error);
      res.status(500).json({ error: "Failed to fetch location data" });
    }
  });

  app.get("/api/wiki/search", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }

      // Wikipedia API (Free, no key required)
      const searchResponse = await axios.get(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&titles=${encodeURIComponent(query as string)}&format=json&redirects=1`,
        {
          headers: {
            'User-Agent': 'VagabondAI-TravelApp/1.0 (https://github.com/vagabondai/travelapp; contact@example.com)'
          }
        }
      );

      const pages = searchResponse.data.query.pages;
      const pageId = Object.keys(pages)[0];

      if (pageId !== "-1") {
        const page = pages[pageId];
        res.json({
          title: page.title,
          extract: page.extract,
          imageUrl: page.original?.source || null
        });
      } else {
        res.status(404).json({ error: "Wikipedia article not found" });
      }
    } catch (error) {
      console.error("Error fetching data from Wikipedia:", error);
      res.status(500).json({ error: "Failed to fetch Wikipedia data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
