import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { logger } from "./logger";
import { CONFIG } from "./config";

export interface BalanceInfo {
  solBalance: number;
  hasSufficientSol: boolean;
}

/**
 * Check wallet SOL balance and verify it meets minimum requirements
 * for transaction fees.
 */
export async function checkBalance(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<BalanceInfo> {
  const lamports = await connection.getBalance(walletPubkey);
  const solBalance = lamports / LAMPORTS_PER_SOL;
  const hasSufficientSol = solBalance >= CONFIG.minSolBalance;

  return { solBalance, hasSufficientSol };
}

/**
 * Log wallet balance and return whether it's safe to proceed.
 */
export async function validateBalance(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<boolean> {
  const balance = await checkBalance(connection, walletPubkey);

  logger.info("Wallet balance", {
    address: walletPubkey.toBase58(),
    solBalance: balance.solBalance,
    minRequired: CONFIG.minSolBalance,
  });

  if (!balance.hasSufficientSol) {
    logger.warn("Insufficient SOL for transaction fees", {
      current: balance.solBalance,
      required: CONFIG.minSolBalance,
    });
    return false;
  }

  return true;
}

/**
 * Check SPL token balance for a given token account.
 */
export async function getTokenAccountBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<bigint> {
  try {
    const info = await connection.getTokenAccountBalance(tokenAccount);
    return BigInt(info.value.amount);
  } catch {
    return BigInt(0);
  }
}
