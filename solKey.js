// First, install the required packages:
// npm install @solana/web3.js bs58

const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");

// Generate a new random keypair.
const keypair = Keypair.generate();

// The secret key is stored as a Uint8Array (64 bytes: 32 bytes for the private key and 32 bytes for the public key)
const secretKeyUint8 = keypair.secretKey;
console.log("Secret Key (Uint8Array):", secretKeyUint8);

// Convert the secret key Uint8Array to a Base58-encoded string using the bs58 library.
const secretKeyBase58 = bs58.encode(secretKeyUint8);
console.log("Secret Key (Base58):", secretKeyBase58);

console.log("Sol Address:", keypair.publicKey.toString());
