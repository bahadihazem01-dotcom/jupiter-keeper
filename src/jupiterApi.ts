import { PublicKey } from "@solana/web3.js";
import { CONFIG } from "./config";
import { logger } from "./logger";

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: string;
  priceImpactPct: string;
  routePlan: any;
  contextSlot: number;
  timeTaken: number;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;
const QUOTE_COOLDOWN_MS = 500; // delay between quote requests to avoid rate limits

// Cache of failed mint pairs to avoid re-quoting dead tokens
export const failedPairCache = new Map<string, number>(); // pair key -> timestamp
const FAILED_PAIR_TTL_MS = 5 * 60 * 1000; // cache failed pairs for 5 minutes

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      if (response.status === 429) {
        const waitMs = RETRY_DELAY_MS * attempt;
        logger.warn("Rate limited by Jupiter API, retrying", {
          attempt,
          waitMs,
        });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (attempt === retries) return response;
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn("Jupiter API request failed, retrying", {
        attempt,
        error: String(err),
      });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw new Error("Exhausted retries");
}

// Throttle quote requests
let lastQuoteTime = 0;

export const getQuote = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amount: number | string
): Promise<QuoteResponse | null> => {
  const pairKey = `${fromMint.toBase58()}-${toMint.toBase58()}`;
  try {
    // Check failed pair cache
    const cachedFailTime = failedPairCache.get(pairKey);
    if (cachedFailTime && Date.now() - cachedFailTime < FAILED_PAIR_TTL_MS) {
      return null; // skip known-bad pairs silently
    }

    // Rate limit ourselves
    const now = Date.now();
    const elapsed = now - lastQuoteTime;
    if (elapsed < QUOTE_COOLDOWN_MS) {
      await new Promise((r) => setTimeout(r, QUOTE_COOLDOWN_MS - elapsed));
    }
    lastQuoteTime = Date.now();

    const url =
      `${CONFIG.jupiterApiBaseUrl}/quote` +
      `?outputMint=${toMint.toBase58()}` +
      `&inputMint=${fromMint.toBase58()}` +
      `&amount=${amount}` +
      `&slippageBps=${CONFIG.slippageBps}`;

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      logger.debug("Quote API error", {
        status: response.status,
        inputMint: fromMint.toBase58().slice(0, 8),
        outputMint: toMint.toBase58().slice(0, 8),
      });
      // Cache 400 errors (no route) so we don't retry for a while
      if (response.status === 400) {
        failedPairCache.set(pairKey, Date.now());
      }
      return null;
    }
    return await response.json();
  } catch (err) {
    logger.debug("Failed to get quote", { error: String(err) });
    failedPairCache.set(pairKey, Date.now());
    return null;
  }
};

export const getSwapIx = async (
  user: PublicKey,
  quote: QuoteResponse
): Promise<{ swapTransaction: string } | null> => {
  try {
    const response = await fetchWithRetry(`${CONFIG.jupiterApiBaseUrl}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: user.toBase58(),
        computeUnitPriceMicroLamports: "auto",
      }),
    });

    if (!response.ok) {
      logger.error("Swap API error", { status: response.status });
      return null;
    }

    return await response.json();
  } catch (err) {
    logger.error("Failed to get swap instructions", { error: String(err) });
    return null;
  }
};
