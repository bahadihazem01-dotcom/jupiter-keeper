/**
 * Setup Script — Helps you get started with the Gasless Hub.
 *
 * Run with: npm run setup
 *
 * This script:
 * 1. Generates a new fee payer keypair (if you don't have one)
 * 2. Detects network mode (devnet = FREE, mainnet = real money)
 * 3. On devnet: auto-airdrops SOL to your wallet (free!)
 * 4. Checks your SOL balance
 * 5. Shows you the economics
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, writeFileSync, existsSync } from "fs";

const SOL_PER_TX = 0.000005;

async function requestAirdrop(connection: Connection, publicKey: PublicKey, amount: number): Promise<boolean> {
  try {
    console.log(`  Requesting airdrop of ${amount} SOL...`);
    const sig = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  Airdrop successful! TX: ${sig}`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  Airdrop failed: ${msg}`);
    console.log("  (Devnet faucet may be rate-limited. Try again in a minute.)");
    return false;
  }
}

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     SOLANA GASLESS HUB — Setup Wizard            ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");

  // Step 0: Detect network
  const network = process.env.SOLANA_NETWORK || "devnet";
  const isDevnet = network === "devnet";
  const heliusKey = process.env.HELIUS_API_KEY || "";

  console.log(`NETWORK: ${network.toUpperCase()}${isDevnet ? " (FREE — no real money needed!)" : " (real transactions)"}`);
  if (heliusKey) {
    console.log(`RPC: Helius (faster, free tier)`);
  } else {
    console.log(`RPC: Public Solana ${network}`);
    console.log("  TIP: Get a free Helius API key at https://dashboard.helius.dev");
    console.log("       Set HELIUS_API_KEY in .env for faster, more reliable RPC");
  }
  console.log("");

  // Resolve RPC URL
  let rpcUrl: string;
  if (process.env.SOLANA_RPC_URL) {
    rpcUrl = process.env.SOLANA_RPC_URL;
  } else if (heliusKey) {
    rpcUrl = isDevnet
      ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
      : `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  } else {
    rpcUrl = isDevnet
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com";
  }

  // Step 1: Generate or load keypair
  console.log("STEP 1: Fee Payer Wallet\n");

  let keypair: Keypair | null = null;

  if (process.env.FEE_PAYER_PRIVATE_KEY && process.env.FEE_PAYER_PRIVATE_KEY !== "your_base58_private_key_here") {
    try {
      keypair = Keypair.fromSecretKey(bs58.decode(process.env.FEE_PAYER_PRIVATE_KEY));
      console.log(`  Using existing wallet: ${keypair.publicKey.toBase58()}`);
    } catch {
      try {
        const parsed = JSON.parse(process.env.FEE_PAYER_PRIVATE_KEY);
        keypair = Keypair.fromSecretKey(Uint8Array.from(parsed));
        console.log(`  Using existing wallet: ${keypair.publicKey.toBase58()}`);
      } catch {
        console.error("  ERROR: Invalid FEE_PAYER_PRIVATE_KEY format");
        process.exit(1);
      }
    }
  } else {
    console.log("  No wallet configured. Generating a new one...\n");
    keypair = Keypair.generate();
    const privateKeyBase58 = bs58.encode(keypair.secretKey);

    console.log(`  NEW WALLET GENERATED:`);
    console.log(`  Public Key:  ${keypair.publicKey.toBase58()}`);
    console.log(`  Private Key: ${privateKeyBase58}`);
    console.log("");
    console.log("  IMPORTANT: Save the private key securely!");
    console.log("  Add it to your .env file as FEE_PAYER_PRIVATE_KEY");
    console.log("");

    // Update .env if it exists
    if (existsSync(".env")) {
      let envContent = readFileSync(".env", "utf-8");
      envContent = envContent.replace(
        /FEE_PAYER_PRIVATE_KEY=.*/,
        `FEE_PAYER_PRIVATE_KEY=${privateKeyBase58}`
      );
      writeFileSync(".env", envContent);
      console.log("  Updated .env with the new key.");
    } else {
      // Create .env from example
      if (existsSync(".env.example")) {
        let envContent = readFileSync(".env.example", "utf-8");
        envContent = envContent.replace(
          /FEE_PAYER_PRIVATE_KEY=.*/,
          `FEE_PAYER_PRIVATE_KEY=${privateKeyBase58}`
        );
        writeFileSync(".env", envContent);
        console.log("  Created .env from .env.example with the new key.");
      }
    }
  }

  // Step 2: Check balance (and airdrop on devnet)
  console.log("\nSTEP 2: Balance Check\n");
  const connection = new Connection(rpcUrl, "confirmed");

  if (keypair) {
    try {
      let balance = await connection.getBalance(keypair.publicKey);
      let solBalance = balance / LAMPORTS_PER_SOL;

      // Auto-airdrop on devnet if balance is low
      if (isDevnet && solBalance < 1) {
        console.log("  Devnet detected with low balance — requesting free airdrop...");
        const success = await requestAirdrop(connection, keypair.publicKey, 2);
        if (success) {
          // Re-check balance
          balance = await connection.getBalance(keypair.publicKey);
          solBalance = balance / LAMPORTS_PER_SOL;
        }
      }

      const txCapacity = Math.floor(solBalance / SOL_PER_TX);

      console.log(`  Wallet: ${keypair.publicKey.toBase58()}`);
      console.log(`  Balance: ${solBalance.toFixed(6)} SOL`);
      console.log(`  Capacity: ~${txCapacity.toLocaleString()} transactions`);

      if (isDevnet && solBalance > 0) {
        console.log("\n  You're on DEVNET with free SOL — ready to test!");
        console.log("  Need more? Run: solana airdrop 2 " + keypair.publicKey.toBase58() + " --url devnet");
      } else if (solBalance === 0 && !isDevnet) {
        console.log(`\n  Your wallet has 0 SOL. To get started:`);
        console.log(`  Send a small amount of SOL to: ${keypair.publicKey.toBase58()}`);
        console.log("  Even 0.01 SOL (~$1.70) covers ~2,000 transactions!");
        console.log("  Your fee margin earns this back over time.");
      } else if (solBalance < 0.01 && !isDevnet) {
        console.log("\n  Balance is low. Consider adding more SOL for higher capacity.");
      } else if (!isDevnet) {
        console.log("\n  Balance looks good for relaying!");
      }
    } catch (e) {
      console.log(`  Could not check balance: ${e}`);
    }
  }

  // Step 3: Show economics
  console.log("\nSTEP 3: Economics\n");
  const margin = parseFloat(process.env.FEE_MARGIN || "0.1");
  console.log(`  Fee margin: ${(margin * 100).toFixed(1)}%`);
  console.log(`  Cost per TX: ${SOL_PER_TX.toFixed(6)} SOL`);
  console.log(`  You charge:  ${(SOL_PER_TX * (1 + margin)).toFixed(6)} SOL (in token equivalent)`);
  console.log(`  Your profit: ${(SOL_PER_TX * margin).toFixed(6)} SOL per TX`);
  console.log("");
  console.log("  At 10% margin and 1000 txs/day:");
  console.log(`    Daily profit:   ~${(1000 * SOL_PER_TX * margin).toFixed(4)} SOL`);
  console.log(`    Monthly profit: ~${(30000 * SOL_PER_TX * margin).toFixed(4)} SOL`);

  // Step 4: Next steps
  console.log("\nSTEP 4: Next Steps\n");
  if (isDevnet) {
    console.log("  You're on DEVNET — everything is FREE! Here's what to do:");
    console.log("");
    console.log("  1. Start Kora Paymaster: docker compose up -d");
    console.log("  2. Start the relayer:    npm start");
    console.log("  3. Monitor costs:        npm run monitor");
    console.log("  4. Try a gasless tx:     npm run example:transfer");
    console.log("");
    console.log("  When you're ready for mainnet:");
    console.log("  1. Set SOLANA_NETWORK=mainnet in .env");
    console.log("  2. Fund your fee payer with a few cents of SOL");
    console.log("  3. Restart: docker compose down && docker compose up -d");
  } else {
    console.log("  1. Fund your fee payer wallet with SOL");
    console.log("  2. Start Kora Paymaster: docker compose up -d");
    console.log("  3. Start the relayer:    npm start");
    console.log("  4. Monitor costs:        npm run monitor");
    console.log("  5. Try a gasless tx:     npm run example:transfer");
  }
  console.log("");
}

main().catch(console.error);
