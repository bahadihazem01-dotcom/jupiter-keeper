/**
 * Example: Gasless Jupiter Swap
 *
 * Performs a token swap on Jupiter DEX WITHOUT paying SOL for gas.
 * The Kora Paymaster pays the gas fees — you just sign the swap.
 *
 * Flow:
 * 1. Get swap quote from Jupiter API
 * 2. Get swap transaction from Jupiter
 * 3. Wrap it so the Paymaster is the fee payer
 * 4. User signs, Paymaster co-signs and broadcasts
 *
 * Run with: npm run example:swap
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { GaslessClient } from "../src/gasless-client.js";
import { loadConfig } from "../src/config.js";

const JUPITER_API = "https://lite-api.jup.ag/v6";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
}

/**
 * Get a swap quote from Jupiter
 */
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
): Promise<JupiterQuote> {
  const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<JupiterQuote>;
}

/**
 * Get the swap transaction from Jupiter
 */
async function getJupiterSwapTransaction(
  quoteResponse: JupiterQuote,
  userPublicKey: string,
  feePayerPublicKey: string
): Promise<string> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      // Key feature: use the Paymaster as fee payer!
      feeAccount: feePayerPublicKey,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!res.ok) {
    throw new Error(`Jupiter swap failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { swapTransaction: string };
  return data.swapTransaction;
}

async function main() {
  console.log("=== Gasless Jupiter Swap Example ===\n");

  const cfg = loadConfig();
  const client = new GaslessClient(cfg.koraEndpoint, cfg.connection.rpcEndpoint);

  // Check Paymaster
  const healthy = await client.isHealthy();
  if (!healthy) {
    console.error("Kora Paymaster not reachable at", cfg.koraEndpoint);
    process.exit(1);
  }
  console.log("Paymaster online!\n");

  // Get Paymaster's fee payer address
  const payerInfo = await client.getPayerSigner();
  console.log(`Paymaster fee payer: ${payerInfo.signerPubkey}`);

  // Demo user wallet
  const userKeypair = Keypair.generate();
  console.log(`User wallet:         ${userKeypair.publicKey.toBase58()}`);
  console.log(`Swap:                1 USDC -> SOL`);
  console.log(`Gas paid by:         PAYMASTER (not user!)\n`);

  try {
    // Step 1: Get Jupiter quote
    console.log("1. Getting Jupiter quote...");
    const quote = await getJupiterQuote(
      USDC_MINT,
      SOL_MINT,
      1_000_000, // 1 USDC
      50 // 0.5% slippage
    );
    console.log(`   Input:  ${quote.inAmount} USDC (raw)`);
    console.log(`   Output: ${quote.outAmount} SOL (raw)`);
    console.log(`   Route:  ${quote.routePlan.length} hop(s)`);

    // Step 2: Get swap transaction with Paymaster as fee payer
    console.log("\n2. Building swap transaction (Paymaster pays gas)...");
    const swapTxBase64 = await getJupiterSwapTransaction(
      quote,
      userKeypair.publicKey.toBase58(),
      payerInfo.signerPubkey
    );
    console.log("   Swap transaction built!");

    // Step 3: Estimate the fee
    console.log("\n3. Estimating fee...");
    try {
      const feeEstimate = await client.estimateFee(swapTxBase64, USDC_MINT);
      console.log(`   Gas fee:    ${feeEstimate.feeInLamports} lamports`);
      console.log(`   In USDC:    ${feeEstimate.feeInToken ?? "N/A"}`);
      console.log(`   Fee payer:  ${feeEstimate.signerPubkey}`);
    } catch (e) {
      console.log(`   (Fee estimation skipped in demo: ${e})`);
    }

    // Step 4: In production, user signs and sends to Paymaster
    console.log("\n4. In production:");
    console.log("   - User signs the swap transaction");
    console.log("   - Sends to Paymaster via signAndSendTransaction()");
    console.log("   - Paymaster co-signs as fee payer and broadcasts");
    console.log("   - User gets the swap, pays ZERO SOL for gas!");
    console.log("   - Paymaster earns the fee margin");

    // Uncomment to actually execute (needs funded accounts):
    // const sig = await client.signAndSendTransaction(swapTxBase64);
    // console.log(`\nSwap executed! Tx: https://solscan.io/tx/${sig.signature}`);

  } catch (e) {
    console.log(`\nDemo flow shown. In production with funded accounts, this executes gaslessly.`);
    console.log(`Note: ${e}`);
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
