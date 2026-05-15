/**
 * Example: Gasless USDC Transfer
 *
 * Sends USDC from one wallet to another WITHOUT paying any SOL for gas.
 * The Kora Paymaster pays the gas fees.
 *
 * Run with: npm run example:transfer
 */

import {
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { GaslessClient } from "../src/gasless-client.js";
import { loadConfig } from "../src/config.js";

// USDC mint on mainnet
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
  console.log("=== Gasless USDC Transfer Example ===\n");

  const cfg = loadConfig();
  const client = new GaslessClient(cfg.koraEndpoint, cfg.connection.rpcEndpoint);

  // Check Paymaster is online
  const healthy = await client.isHealthy();
  if (!healthy) {
    console.error("Kora Paymaster is not reachable at", cfg.koraEndpoint);
    console.error("Start it with: docker compose up -d");
    process.exit(1);
  }
  console.log("Paymaster is online!\n");

  // In a real app, this would be the user's wallet
  // For demo, we generate a keypair (won't have USDC, so tx will fail — just showing the flow)
  const userKeypair = Keypair.generate();
  const recipientAddress = Keypair.generate().publicKey;

  console.log(`Sender:    ${userKeypair.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipientAddress.toBase58()}`);
  console.log(`Amount:    1 USDC`);
  console.log(`Gas paid:  BY THE PAYMASTER (not you!)\n`);

  // Get the sender's USDC token account
  const senderTokenAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    userKeypair.publicKey
  );

  // Get the recipient's USDC token account
  const recipientTokenAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    recipientAddress
  );

  // Create the transfer instruction
  const transferIx = createTransferInstruction(
    senderTokenAccount,         // from
    recipientTokenAccount,      // to
    userKeypair.publicKey,      // authority (the sender)
    1_000_000,                  // 1 USDC (6 decimals)
    [],                         // no multisig signers
    TOKEN_PROGRAM_ID
  );

  console.log("Building gasless transaction...");

  try {
    // Build the transaction with the Paymaster as fee payer
    const { serialized, feeEstimate } = await client.buildGaslessTransaction(
      userKeypair,
      [transferIx],
      USDC_MINT.toBase58() // Pay the Paymaster's fee in USDC
    );

    if (feeEstimate) {
      console.log(`\nFee estimate:`);
      console.log(`  Gas (lamports): ${feeEstimate.feeInLamports}`);
      console.log(`  Fee in USDC:    ${feeEstimate.feeInToken ?? "N/A"}`);
      console.log(`  Paymaster:      ${feeEstimate.signerPubkey}`);
    }

    console.log("\nTransaction built successfully!");
    console.log("In a real scenario, this would now be sent to the Paymaster for co-signing.");
    console.log("The user pays ZERO SOL — the Paymaster covers gas.\n");

    // Uncomment to actually send (needs funded accounts):
    // const sig = await client.signAndSendTransaction(serialized);
    // console.log(`Transaction sent! Signature: ${sig.signature}`);

  } catch (e) {
    console.log(`\nDemo complete. In production with funded accounts, this sends gaslessly.`);
    console.log(`Error (expected in demo): ${e}`);
  }
}

main().catch(console.error);
