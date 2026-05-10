import { LimitOrderProvider, Order } from "@jup-ag/limit-order-sdk";
import { Decimal } from "decimal.js";
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getQuote, getSwapIx } from "./jupiterApi";
import { Wallet, BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getTakerFee } from "./fee";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { validateBalance } from "./balance";

interface ExecutionStats {
  cycleCount: number;
  ordersChecked: number;
  ordersExecuted: number;
  ordersFailed: number;
  ordersSkipped: number;
  totalProfit: Decimal;
}

const stats: ExecutionStats = {
  cycleCount: 0,
  ordersChecked: 0,
  ordersExecuted: 0,
  ordersFailed: 0,
  ordersSkipped: 0,
  totalProfit: new Decimal(0),
};

let running = true;

function setupGracefulShutdown() {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function logStats() {
  logger.info("Execution stats", {
    cycles: stats.cycleCount,
    checked: stats.ordersChecked,
    executed: stats.ordersExecuted,
    failed: stats.ordersFailed,
    skipped: stats.ordersSkipped,
  });
}

export async function main() {
  setupGracefulShutdown();

  if (!CONFIG.privateKey) {
    logger.error("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const wallet = new Wallet(
    Keypair.fromSecretKey(bs58.decode(CONFIG.privateKey))
  );
  const connection = new Connection(CONFIG.rpcEndpoint);
  const limitOrder = new LimitOrderProvider(connection);

  logger.info("Keeper bot started", {
    wallet: wallet.publicKey.toBase58(),
    rpc: CONFIG.rpcEndpoint.replace(/\/\/.*@/, "//***@"), // hide credentials
    pollInterval: CONFIG.pollIntervalMs,
    minProfitBps: CONFIG.minProfitBps,
    minSolBalance: CONFIG.minSolBalance,
  });

  // Initial balance check
  const hasBalance = await validateBalance(connection, wallet.publicKey);
  if (!hasBalance) {
    logger.error(
      "Insufficient SOL balance to start. Fund your wallet and retry."
    );
    process.exit(1);
  }

  const fee = await limitOrder.getFee();
  logger.info("Fee config loaded", {
    takerFee: fee.takerFee.toNumber(),
    takerStableFee: fee.takerStableFee.toNumber(),
  });

  while (running) {
    stats.cycleCount++;

    try {
      // Periodic balance check (every 10 cycles)
      if (stats.cycleCount % 10 === 0) {
        const ok = await validateBalance(connection, wallet.publicKey);
        if (!ok) {
          logger.warn(
            "Low SOL balance, pausing until balance is restored..."
          );
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
      }

      // Fetch open orders
      const pendingOrders = await limitOrder.getOrders();
      logger.info(`Fetched ${pendingOrders.length} open orders`);

      if (pendingOrders.length === 0) {
        await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
        continue;
      }

      // Group orders by pair
      const pendingOrderGroup = pendingOrders.reduce(
        (
          group: Record<string, { publicKey: PublicKey; account: Order }[]>,
          order
        ) => {
          const { inputMint, outputMint } = order.account;
          const pair = inputMint.toBase58() + outputMint.toBase58();
          group[pair] = group[pair] || [];
          group[pair].push(order);
          return group;
        },
        {}
      );

      // Sort each group by best price and pick top orders
      let filterOrders: { publicKey: PublicKey; account: Order }[] = [];
      Object.values(pendingOrderGroup).forEach((orders) => {
        const sorted = orders.sort((a, b) => {
          const aPrice = new Decimal(a.account.takingAmount.toString()).div(
            a.account.makingAmount.toString()
          );
          const bPrice = new Decimal(b.account.takingAmount.toString()).div(
            b.account.makingAmount.toString()
          );
          return aPrice.cmp(bPrice);
        });
        filterOrders.push(...sorted.slice(0, CONFIG.maxOrdersPerCycle));
      });

      // Process each order
      for (const order of filterOrders) {
        if (!running) break;
        stats.ordersChecked++;

        const {
          account: {
            makingAmount,
            takingAmount,
            inputMint,
            outputMint,
            makerOutputAccount,
          },
          publicKey,
        } = order;

        const orderKey = publicKey.toBase58().slice(0, 8);
        logger.debug(`Checking order ${orderKey}`, {
          inputMint: inputMint.toBase58().slice(0, 8),
          outputMint: outputMint.toBase58().slice(0, 8),
          makingAmount: makingAmount.toString(),
          takingAmount: takingAmount.toString(),
        });

        // Skip if maker output account is closed
        if (CONFIG.skipClosedMakerAccounts) {
          const makerOutputAccountInfo =
            await connection.getAccountInfo(makerOutputAccount);
          if (!makerOutputAccountInfo) {
            logger.debug(`Skipping order ${orderKey}: maker output account closed`);
            stats.ordersSkipped++;
            continue;
          }
        }

        // Get Jupiter quote
        const route = await getQuote(
          inputMint,
          outputMint,
          makingAmount.toString()
        );
        if (!route) {
          logger.debug(`Skipping order ${orderKey}: no route found`);
          stats.ordersSkipped++;
          continue;
        }

        const quoteOutAmount = new BN(route.outAmount);

        // Calculate taking amount with taker fee
        const takerFee = getTakerFee(inputMint, outputMint, fee);
        const takingAmountWithTakerFee = takingAmount
          .muln(10000 + takerFee)
          .divn(10000);

        // Check profitability
        const profitLamports = quoteOutAmount.sub(takingAmountWithTakerFee);
        const profitBps = quoteOutAmount.gt(new BN(0))
          ? profitLamports.muln(10000).div(quoteOutAmount).toNumber()
          : 0;

        if (quoteOutAmount.lt(takingAmountWithTakerFee)) {
          logger.debug(`Order ${orderKey} not profitable`, {
            quoteOut: quoteOutAmount.toString(),
            required: takingAmountWithTakerFee.toString(),
          });
          stats.ordersSkipped++;
          continue;
        }

        if (profitBps < CONFIG.minProfitBps) {
          logger.debug(
            `Order ${orderKey} below min profit threshold (${profitBps} < ${CONFIG.minProfitBps} bps)`
          );
          stats.ordersSkipped++;
          continue;
        }

        logger.info(`Executing order ${orderKey}`, {
          profitBps,
          quoteOut: quoteOutAmount.toString(),
          required: takingAmountWithTakerFee.toString(),
        });

        try {
          // Balance check before execution
          const balanceOk = await validateBalance(
            connection,
            wallet.publicKey
          );
          if (!balanceOk) {
            logger.warn("Insufficient SOL, skipping execution");
            stats.ordersSkipped++;
            break; // break out of order loop, wait for next cycle
          }

          // Get swap transaction
          const swapResult = await getSwapIx(wallet.publicKey, route);
          if (!swapResult) {
            logger.error(`Failed to get swap tx for order ${orderKey}`);
            stats.ordersFailed++;
            continue;
          }

          const swapTransactionBuf = Buffer.from(
            swapResult.swapTransaction,
            "base64"
          );
          const swapTransaction =
            VersionedTransaction.deserialize(swapTransactionBuf);

          // Resolve address lookup tables
          const swapALT = await Promise.all(
            swapTransaction.message.addressTableLookups.map(async (lookup) => {
              return new AddressLookupTableAccount({
                key: lookup.accountKey,
                state: AddressLookupTableAccount.deserialize(
                  await connection
                    .getAccountInfo(lookup.accountKey)
                    .then((res) => res!.data)
                ),
              });
            })
          );

          const txMessage = TransactionMessage.decompile(
            swapTransaction.message,
            { addressLookupTableAccounts: swapALT }
          );

          // Get fill order instruction
          const limitOrderTx = await limitOrder.fillOrder({
            owner: wallet.publicKey,
            orderAccount: order,
            amount: makingAmount,
            expectedOutAmount: takingAmount,
          });

          // Combine swap + fill instructions
          txMessage.instructions.push(...limitOrderTx.instructions);
          txMessage.recentBlockhash = (
            await connection.getLatestBlockhash()
          ).blockhash;
          swapTransaction.message = txMessage.compileToV0Message([...swapALT]);
          swapTransaction.sign([wallet.payer]);

          // Send transaction
          const txid = await connection.sendRawTransaction(
            swapTransaction.serialize(),
            { skipPreflight: true, maxRetries: 2 }
          );

          logger.info(`Order executed successfully`, {
            order: orderKey,
            txid,
            profitBps,
            solscan: `https://solscan.io/tx/${txid}`,
          });

          stats.ordersExecuted++;
          stats.totalProfit = stats.totalProfit.add(
            new Decimal(profitLamports.toString())
          );
        } catch (err) {
          logger.error(`Failed to execute order ${orderKey}`, {
            error: String(err),
          });
          stats.ordersFailed++;
        }

        await new Promise((r) => setTimeout(r, CONFIG.orderDelayMs));
      }

      // Log stats every 10 cycles
      if (stats.cycleCount % 10 === 0) {
        logStats();
      }
    } catch (err) {
      logger.error("Cycle error", { error: String(err) });
    }

    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
  }

  logger.info("Keeper bot stopped");
  logStats();
}

main();
