/**
 * This script sends 10 transactions on Solana while controlling concurrency.
 * Each transaction:
 *   - Uses a fresh blockhash to avoid expiration.
 *   - Includes a Compute Budget instruction to set a priority fee.
 *   - Transfers 1,000 lamports.
 *
 * Recipient addresses are loaded from a CSV file ("recipients.csv")
 * and three payer wallets (with their secret keys) are used in a round-robin fashion.
 *
 * Concurrency is controlled using the p-limit library.
 * A delay is introduced between scheduling each task.
 *
 * WARNING: Replace secretKey arrays with your actual secret key data.
 */

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} = require("@solana/web3.js");
const fs = require("fs");
const csv = require("csv-parser");
const pLimit = require("p-limit").default;

// Connect to the Solana Devnet (change URL for mainnet if needed)
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// ---------------------------------------------------------------------------
// Replace these Uint8Arrays with your actual secret key arrays.
// Example (dummy data):
// const secretKey1 = Uint8Array.from([12, 34, 56, ...]);
// ---------------------------------------------------------------------------
const secretKey1 = Uint8Array.from([
  62, 63, 48, 151, 98, 114, 19, 221, 90, 175, 198, 160, 127, 131, 20, 6, 203,
  207, 132, 96, 183, 21, 73, 40, 140, 121, 1, 97, 227, 196, 18, 40, 97, 152,
  230, 7, 27, 96, 89, 142, 33, 27, 122, 81, 146, 66, 60, 6, 203, 209, 20, 137,
  10, 14, 123, 187, 95, 140, 103, 123, 46, 194, 149, 48,
]);
const secretKey2 = Uint8Array.from([
  202, 127, 40, 169, 170, 111, 74, 40, 142, 28, 125, 15, 175, 3, 114, 185, 61,
  133, 129, 168, 120, 181, 94, 161, 198, 225, 96, 194, 91, 5, 147, 163, 119,
  241, 230, 227, 11, 248, 220, 212, 177, 23, 10, 192, 117, 132, 190, 103, 253,
  50, 215, 58, 21, 169, 50, 114, 75, 41, 138, 181, 174, 204, 226, 65,
]);
const secretKey3 = Uint8Array.from([
  147, 198, 123, 100, 179, 224, 112, 18, 43, 97, 144, 236, 29, 6, 231, 99, 207,
  180, 249, 229, 230, 24, 113, 68, 42, 235, 182, 175, 113, 51, 41, 29, 213, 177,
  2, 7, 70, 74, 11, 156, 111, 218, 137, 62, 11, 64, 3, 52, 0, 199, 80, 10, 18,
  109, 20, 124, 90, 91, 156, 218, 10, 77, 181, 252,
]);

const wallet1 = Keypair.fromSecretKey(secretKey1);
const wallet2 = Keypair.fromSecretKey(secretKey2);
const wallet3 = Keypair.fromSecretKey(secretKey3);
const wallets = [wallet1, wallet2, wallet3];

/**
 * Helper sleep function that returns a promise that resolves after ms milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads recipient addresses from a CSV file.
 * Expects the CSV file to have a column named "address".
 * @param {string} csvFilePath - The CSV file path.
 * @returns {Promise<string[]>} - Resolves with an array of recipient addresses.
 */
function loadRecipients(csvFilePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (data) => {
        if (data.address) {
          results.push(data.address);
        }
      })
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

/**
 * Sends a transaction with:
 *   - A Compute Budget instruction to set a priority fee.
 *   - A transfer instruction (1,000 lamports).
 *   - A fresh blockhash to avoid expiration.
 *
 * @param {Keypair} payer - The wallet sending the transaction.
 * @param {string} recipientAddress - The recipient's public key (Base58 string).
 * @param {number} priorityFeeMicroLamports - Priority fee in micro-lamports.
 */
async function sendTransaction(
  payer,
  recipientAddress,
  priorityFeeMicroLamports
) {
  // Get a fresh blockhash and the last valid block height.
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  let recipient;
  try {
    recipient = new PublicKey(recipientAddress);
  } catch (error) {
    console.error(`Invalid recipient address (${recipientAddress}):`, error);
    return;
  }

  // Create the transaction using the fresh blockhash and validity window.
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  });

  // Add a ComputeBudget instruction to set the priority fee.
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeMicroLamports,
    })
  );

  // Add a transfer instruction (transfers 1,000 lamports; adjust as needed).
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 1000,
    })
  );

  try {
    // Send and confirm the transaction.
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      payer,
    ]);
    console.log(
      `Transaction from ${payer.publicKey.toBase58()} to ${recipient.toBase58()} confirmed with signature: ${signature}`
    );
  } catch (err) {
    console.error(
      `Error sending transaction from ${payer.publicKey.toBase58()} to ${recipient.toBase58()}:`,
      err
    );
    // Optionally, implement retry logic if you encounter blockhash expiration errors.
  }
}

/**
 * Main function:
 *   - Loads recipient addresses from the CSV.
 *   - Sends 10 transactions using a concurrency limit.
 *   - Introduces a sleep between scheduling each task.
 */
async function main() {
  // Load recipients from CSV.
  const recipients = await loadRecipients("recipients.csv");
  console.log(`Loaded ${recipients.length} recipient addresses from CSV.`);

  if (recipients.length === 0) {
    console.error("No recipient addresses found. Exiting.");
    process.exit(1);
  }

  // Define the desired priority fee (in micro-lamports).
  const priorityFeeMicroLamports = 5000; // adjust as needed

  // Set a concurrency limit. For example, allow a maximum of 3 concurrent transactions.
  const concurrencyLimit = 3;
  const limit = pLimit(concurrencyLimit);

  // Define the delay (in milliseconds) between scheduling each task.
  const sleepMs = 100; // Adjust the delay as needed

  // Create an array of transaction tasks with concurrency control.
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    // Choose a payer wallet in a round-robin fashion.
    const payer = wallets[i % wallets.length];
    // Choose a recipient from the CSV addresses (cycling if there are fewer than 10).
    const recipientAddress = recipients[i % recipients.length];
    // Wrap the sendTransaction call with the limit function.
    tasks.push(
      limit(() =>
        sendTransaction(payer, recipientAddress, priorityFeeMicroLamports)
      )
    );
    // Sleep between scheduling each task.
    await sleep(sleepMs);
  }

  // Wait for all the tasks to complete.
  await Promise.all(tasks);
  console.log("All transactions have been processed.");
}

// Run the main function.
main().catch((err) => {
  console.error("Error in main execution:", err);
  process.exit(1);
});
