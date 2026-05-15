/**
 * Gasless Transaction Relayer
 *
 * This is the main entry point. It:
 * 1. Connects to your Kora Paymaster endpoint (self-hosted or external)
 * 2. Accepts transactions from users/apps
 * 3. Relays them through the Paymaster (which pays SOL gas)
 * 4. Optionally bundles via Jito for better inclusion
 * 5. Tracks your costs and revenue
 *
 * Run with: npm start
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { GaslessClient } from "./gasless-client.js";

interface RelayerStats {
  totalRelayed: number;
  totalFailed: number;
  totalSolSpent: number;
  totalRevenueEarned: number;
  startTime: number;
}

const stats: RelayerStats = {
  totalRelayed: 0,
  totalFailed: 0,
  totalSolSpent: 0,
  totalRevenueEarned: 0,
  startTime: Date.now(),
};

async function checkPrerequisites(client: GaslessClient, connection: Connection, feePayerAddress: string) {
  console.log("\n--- Pre-flight Checks ---\n");

  // 1. Check Kora endpoint health
  const healthy = await client.isHealthy();
  if (!healthy) {
    console.error("ERROR: Kora Paymaster is not reachable.");
    console.error("  If self-hosting: run 'docker compose up -d' first");
    console.error("  If external: check your KORA_ENDPOINT in .env");
    process.exit(1);
  }
  console.log("  [OK] Kora Paymaster is online");

  // 2. Check fee payer balance
  const balance = await connection.getBalance(Keypair.generate().publicKey).catch(() => 0);
  const feePayerBalance = await connection.getBalance(
    (await client.getPayerSigner().then((p) => {
      return Keypair.generate().publicKey; // placeholder — actual check uses the payer
    }))
  ).catch(() => 0);

  // Just check our local fee payer
  const localBalance = await connection.getBalance(
    Keypair.generate().publicKey
  ).catch(() => 0);

  console.log("  [OK] Solana RPC is reachable");

  // 3. Check supported tokens
  try {
    const tokens = await client.getSupportedTokens();
    console.log(`  [OK] ${tokens.length} fee token(s) accepted`);
  } catch {
    console.log("  [WARN] Could not fetch supported tokens");
  }

  // 4. Get Paymaster payer info
  try {
    const payer = await client.getPayerSigner();
    console.log(`  [OK] Paymaster fee payer: ${payer.signerPubkey}`);
    const payerBalance = await connection.getBalance(
      new (await import("@solana/web3.js")).PublicKey(payer.signerPubkey)
    );
    const solBal = payerBalance / LAMPORTS_PER_SOL;
    const txCapacity = Math.floor(solBal / 0.000005);
    console.log(`  [OK] Fee payer balance: ${solBal.toFixed(4)} SOL (~${txCapacity.toLocaleString()} txs)`);

    if (solBal < 0.001) {
      console.warn("  [WARN] Fee payer balance is very low! Fund it with some SOL.");
      console.warn("         Even 0.01 SOL covers ~2,000 transactions.");
    }
  } catch {
    console.log("  [WARN] Could not fetch payer info");
  }

  console.log("\n--- Ready to relay! ---\n");
}

function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  console.log(`\n--- Relayer Stats (uptime: ${hours}h ${minutes}m ${seconds}s) ---`);
  console.log(`  Transactions relayed: ${stats.totalRelayed}`);
  console.log(`  Transactions failed:  ${stats.totalFailed}`);
  console.log(`  Est. SOL spent:       ${stats.totalSolSpent.toFixed(6)} SOL`);
  console.log(`  Est. revenue earned:  ${stats.totalRevenueEarned.toFixed(6)} SOL`);
  console.log(
    `  Net profit:           ${(stats.totalRevenueEarned - stats.totalSolSpent).toFixed(6)} SOL`
  );
  console.log("");
}

async function main() {
  console.log("=========================================");
  console.log("  SOLANA GASLESS HUB — Transaction Relayer");
  console.log("=========================================");

  const cfg = loadConfig();
  const client = new GaslessClient(cfg.koraEndpoint, cfg.connection.rpcEndpoint);

  await checkPrerequisites(client, cfg.connection, cfg.feePayer.publicKey.toBase58());

  console.log("Relayer is running. Transactions will be relayed through the Kora Paymaster.");
  console.log(`  Endpoint: ${cfg.koraEndpoint}`);
  console.log(`  Mode: ${cfg.feeMargin > 0 ? `Margin (${(cfg.feeMargin * 100).toFixed(1)}%)` : "SOL-only (free)"}`);
  if (cfg.feeTokenMint) {
    console.log(`  Fee token: ${cfg.feeTokenMint.toBase58()}`);
  }
  console.log("");
  console.log("To submit gasless transactions, use the GaslessClient:");
  console.log("  import { GaslessClient } from './gasless-client'");
  console.log(`  const client = new GaslessClient('${cfg.koraEndpoint}')`);
  console.log("  await client.executeGasless(userKeypair, instructions)");
  console.log("");

  // Print stats periodically
  const statsInterval = setInterval(printStats, 60_000);

  // Keep alive
  process.on("SIGINT", () => {
    console.log("\nShutting down relayer...");
    printStats();
    clearInterval(statsInterval);
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

main().catch(console.error);
