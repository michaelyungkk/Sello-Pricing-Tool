

import { GoogleGenAI, Type } from "@google/genai";
import { Product, AnalysisResult, PlatformConfig } from "../types";

// Initialize the Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePriceAdjustment = async (product: Product, platformRule: PlatformConfig): Promise<AnalysisResult> => {
  // FIX: Upgraded model to gemini-3-pro-preview for better arithmetic reasoning capabilities.
  const modelId = "gemini-3-pro-preview"; // Using flash for speed and arithmetic reasoning

  const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General');

  const ruleDescription = `
    Platform Configuration for ${platformName}:
    - Strategic Markup/Margin Adjustment: ${platformRule.markup > 0 ? '+' : ''}${platformRule.markup}% (Apply this to the base valuation)
    - Platform Commission Fee: ${platformRule.commission}% (This fee is deducted from the sale price. Ensure the recommended price accounts for this cost while maintaining velocity)
  `;

  const prompt = `
    Act as a senior inventory and pricing analyst for an ecommerce business.
    
    Current Scenario:
    Product: ${product.name}
    Platform: ${platformName}
    Current Price: £${product.currentPrice}
    Current Stock Level: ${product.stockLevel} units
    Average Daily Sales Velocity: ${product.averageDailySales} units/day
    Replenishment Lead Time: ${product.leadTimeDays} days (when new stock arrives)

    Strategic Rules:
    ${ruleDescription}

    Goal:
    We need to ensure we do not run out of stock before the replenishment arrives. 
    However, we also don't want to hold too much stock if sales are too slow.
    
    Task:
    1. Calculate "Days of Stock Remaining" (Stock / Daily Sales).
    2. Compare "Days of Stock Remaining" vs "Replenishment Lead Time".
    3. Incorporate the Platform Pricing Policy into your final recommendation. 
       - The Commission % represents a COST. 
       - The Markup % represents a STRATEGY.
    4. If Stock Days < Lead Time: We are at risk of stockout. Increase price to slow sales, maximizing margin on remaining units.
    5. If Stock Days > Lead Time (significantly, e.g., > 2x): We are overstocked. Consider holding or lowering price to boost velocity.
    6. If Stock Days ≈ Lead Time (+/- 20%): Keep price stable (but ensure platform rule is respected if current price deviates significantly).

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