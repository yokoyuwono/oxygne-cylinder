import { GoogleGenAI } from "@google/genai";
import { Cylinder, Member, Transaction, MemberPrice, RefillStation } from "../types";

// Helper to format system context
const generateSystemContext = (
  cylinders: Cylinder[], 
  members: Member[], 
  transactions: Transaction[],
  memberPrices: MemberPrice[] = [],
  refillStations: RefillStation[] = []
) => {
  const availableCount = cylinders.filter(c => c.status === 'Available').length;
  const rentedCount = cylinders.filter(c => c.status === 'Rented').length;
  const refillCount = cylinders.filter(c => c.status === 'Refilling').length;
  const emptyCount = cylinders.filter(c => c.status === 'Empty (Needs Refill)').length;
  
  const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  const inventorySummary = cylinders.map(c => 
    `- ${c.serialCode} (${c.gasType}, ${c.size}): ${c.status} at ${c.lastLocation}`
  ).join('\n');

  const stationSummary = refillStations.map(s => 
    `- ${s.name} (${s.address})`
  ).join('\n');

  return `
    You are an intelligent assistant for an Industrial Gas Cylinder Rental Management System.
    The currency used is Indonesian Rupiah (IDR).
    
    CURRENT SYSTEM STATE:
    - Total Cylinders: ${cylinders.length}
    - Available: ${availableCount}
    - Rented Out: ${rentedCount}
    - Currently Refilling: ${refillCount}
    - Empty (Needs Refill): ${emptyCount}

    REFILL STATIONS:
    ${stationSummary}

    DETAILED INVENTORY:
    ${inventorySummary}

    YOUR ROLE:
    - Answer questions about inventory availability.
    - Check the status of specific cylinders.
    - Provide info on refill status and where cylinders are located.
    - Suggest creating a refill batch if many cylinders are 'Empty'.
    - Be concise and professional.
  `;
};

export const sendMessageToGemini = async (
  message: string, 
  history: { role: 'user' | 'model'; text: string }[],
  contextData: { 
    cylinders: Cylinder[]; 
    members: Member[]; 
    transactions: Transaction[];
    memberPrices: MemberPrice[];
    refillStations: RefillStation[];
  }
): Promise<string> => {
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = generateSystemContext(
        contextData.cylinders, 
        contextData.members, 
        contextData.transactions,
        contextData.memberPrices,
        contextData.refillStations
    );
    
    const chat = ai.chats.create({
      model: 'gemini-3-pro-preview',
      config: {
        systemInstruction: systemInstruction,
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      }))
    });

    const response = await chat.sendMessage({ message: message });
    return response.text || "I'm sorry, I couldn't generate a response.";

  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    return "I'm having trouble connecting to the AI service right now. Please check your API key.";
  }
};