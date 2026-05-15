/**
 * Setup Script — Helps you get started with the Gasless Hub.
 *
 * Run with: npm run setup
 *
 * This script:
 * 1. Generates a new fee payer keypair (if you don't have one)
 * 2. Checks your SOL balance
 * 3. Validates your Kora endpoint
 * 4. Shows you how much SOL you need to start
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, writeFileSync, existsSync } from "fs";

const SOL_PER_TX = 0.000005;

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     SOLANA GASLESS HUB — Setup Wizard            ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");

  // Step 1: Generate or load keypair
  console.log("STEP 1: Fee Payer Wallet\n");

  if (process.env.FEE_PAYER_PRIVATE_KEY && process.env.FEE_PAYER_PRIVATE_KEY !== "your_base58_private_key_here") {
    let keypair: Keypair;
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
    const newKeypair = Keypair.generate();
    const privateKeyBase58 = bs58.encode(newKeypair.secretKey);

    console.log(`  NEW WALLET GENERATED:`);
    console.log(`  Public Key:  ${newKeypair.publicKey.toBase58()}`);
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

  // Step 2: Check balance
  console.log("\nSTEP 2: Balance Check\n");
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  let walletAddress: string | null = null;
  if (process.env.FEE_PAYER_PRIVATE_KEY && process.env.FEE_PAYER_PRIVATE_KEY !== "your_base58_private_key_here") {
    try {
      const kp = Keypair.fromSecretKey(bs58.decode(process.env.FEE_PAYER_PRIVATE_KEY));
      walletAddress = kp.publicKey.toBase58();
    } catch {
      // skip
    }
  }

  if (walletAddress) {
    try {
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      const solBalance = balance / LAMPORTS_PER_SOL;
      const txCapacity = Math.floor(solBalance / SOL_PER_TX);

      console.log(`  Wallet: ${walletAddress}`);
      console.log(`  Balance: ${solBalance.toFixed(6)} SOL`);
      console.log(`  Capacity: ~${txCapacity.toLocaleString()} transactions`);

      if (solBalance === 0) {
        console.log("\n  Your wallet has 0 SOL. To get started:");
        console.log(`  Send a small amount of SOL to: ${walletAddress}`);
        console.log("  Even 0.01 SOL (~$1.70) covers ~2,000 transactions!");
        console.log("  Your fee margin earns this back over time.");
      } else if (solBalance < 0.01) {
        console.log("\n  Balance is low. Consider adding more SOL for higher capacity.");
      } else {
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
  console.log("  1. Fund your fee payer wallet with SOL");
  console.log("  2. Start Kora Paymaster: docker compose up -d");
  console.log("  3. Start the relayer:    npm start");
  console.log("  4. Monitor costs:        npm run monitor");
  console.log("  5. Try a gasless tx:     npm run example:transfer");
  console.log("");
}

main().catch(console.error);
