

import { GoogleGenAI, Type } from "@google/genai";
import { Product, AnalysisResult, PlatformConfig } from "../types";

// Initialize the Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePriceAdjustment = async (product: Product, platformRule: PlatformConfig, context?: string): Promise<AnalysisResult> => {
  // FIX: Upgraded model to gemini-3-pro-preview for better arithmetic reasoning capabilities.
  const modelId = "gemini-3-pro-preview"; // Using flash for speed and arithmetic reasoning

  const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General');

  const primaryGoal = context === 'margin'
    ? `The primary goal is to resolve a critical low margin issue on this platform. The current price of £${product.currentPrice} is not profitable enough given the costs. Your recommendation should prioritize increasing the price to improve the margin. Balance this against sales velocity; we want to be more profitable, not stall sales completely.`
    : `The primary goal is to optimize inventory runway. We need to ensure we do not run out of stock before the replenishment arrives, but also avoid holding too much stock if sales are slow.`;

  const prompt = `
    Act as a senior inventory and pricing analyst for an ecommerce business.
    
    Current Scenario:
    Product: ${product.name}
    Platform: ${platformName}
    Current Price: £${product.currentPrice.toFixed(2)} (Gross, VAT inclusive)
    Cost of Goods (COGS): £${(product.costPrice || 0).toFixed(2)} (Net, VAT exclusive)
    Current Stock Level: ${product.stockLevel} units
    Average Daily Sales Velocity: ${product.averageDailySales.toFixed(2)} units/day
    Replenishment Lead Time: ${product.leadTimeDays} days

    Primary Goal:
    ${primaryGoal}

    Strategic Rules & Costs for ${platformName}:
    - Platform Commission Fee: ${platformRule.commission}% of the gross selling price.
    - Other known costs per unit (VAT exclusive):
      - Average Ad Fee: £${(product.adsFee || 0).toFixed(2)}
      - Average Postage: £${(product.postage || 0).toFixed(2)}
      - WMS/Other Fees: £${((product.wmsFee || 0) + (product.otherFee || 0)).toFixed(2)}

    Task:
    1. Analyze the situation based on the Primary Goal.
    2. If the goal is to fix margin, calculate the current net margin and determine a new price that achieves a healthier margin (e.g., above 10-15%) while considering market elasticity.
    3. If the goal is inventory optimization, calculate "Days of Stock Remaining" (Stock / Daily Sales) and compare it against "Replenishment Lead Time".
    4. Provide a clear reasoning for your recommendation, explaining the trade-offs.

    Return a JSON object with the recommended price, the percentage change, the calculated days remaining, a status (Critical, Warning, Healthy, Overstock), and a short strategic reasoning sentence.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedPrice: { type: Type.NUMBER, description: "The new suggested price per unit" },
            percentageChange: { type: Type.NUMBER, description: "The percentage change (positive for increase, negative for decrease)" },
            daysRemaining: { type: Type.NUMBER, description: "Calculated days until current stock is depleted at current rate" },
            status: { type: Type.STRING, enum: ["Critical", "Warning", "Healthy", "Overstock"], description: "Inventory health status" },
            reasoning: { type: Type.STRING, description: "A concise explanation of the strategy." }
          },
          required: ["recommendedPrice", "percentageChange", "daysRemaining", "status", "reasoning"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text);
    
    return {
      productId: product.id,
      ...result
    };

  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    // Fallback if AI fails, simple math logic
    const daysRemaining = product.stockLevel / (product.averageDailySales || 1);
    const diff = daysRemaining - product.leadTimeDays;
    
    return {
      productId: product.id,
      recommendedPrice: product.currentPrice,
      percentageChange: 0,
      daysRemaining: Math.floor(daysRemaining),
      status: diff < 0 ? 'Critical' : 'Healthy',
      reasoning: "AI Service unavailable. Basic calculation suggests " + (diff < 0 ? "stockout risk." : "inventory is sufficient.")
    };
  }
};