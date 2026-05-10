import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Wallet } from "@coral-xyz/anchor";
import { logger } from "./logger";
import { CONFIG } from "./config";
import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function appendToEnv(key: string, value: string) {
  let content = "";
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  }

  // Replace existing key or append
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }

  fs.writeFileSync(ENV_PATH, content);
}

/**
 * Get or generate a wallet. If no PRIVATE_KEY is set, generates a new keypair,
 * saves it to .env, and waits for the user to fund it.
 */
export async function getOrCreateWallet(
  connection: Connection
): Promise<Wallet> {
  if (CONFIG.privateKey) {
    const wallet = new Wallet(
      Keypair.fromSecretKey(bs58.decode(CONFIG.privateKey))
    );
    logger.info("Loaded existing wallet", {
      address: wallet.publicKey.toBase58(),
    });
    return wallet;
  }

  // Generate new wallet
  const keypair = Keypair.generate();
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  const walletAddress = keypair.publicKey.toBase58();

  // Save to .env
  appendToEnv("PRIVATE_KEY", privateKeyBase58);

  logger.info("=".repeat(60));
  logger.info("NEW WALLET GENERATED");
  logger.info("=".repeat(60));
  logger.info(`Address: ${walletAddress}`);
  logger.info(`Private key saved to .env`);
  logger.info("");
  logger.info("Fund this wallet with SOL to start the keeper bot.");
  logger.info(`Send at least ${CONFIG.minSolBalance} SOL to:`);
  logger.info("");
  logger.info(`  ${walletAddress}`);
  logger.info("");
  logger.info(`View on Solscan: https://solscan.io/account/${walletAddress}`);
  logger.info("=".repeat(60));
  logger.info("");
  logger.info("Waiting for SOL deposit...");

  // Poll until funded
  while (true) {
    const lamports = await connection.getBalance(keypair.publicKey);
    const solBalance = lamports / LAMPORTS_PER_SOL;

    if (solBalance >= CONFIG.minSolBalance) {
      logger.info(`Deposit received! Balance: ${solBalance} SOL`);
      break;
    }

    if (lamports > 0) {
      logger.info(
        `Balance: ${solBalance} SOL (need at least ${CONFIG.minSolBalance} SOL)`
      );
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  return new Wallet(keypair);
}
