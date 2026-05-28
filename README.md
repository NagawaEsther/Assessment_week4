# Decentralized No-Loss Auction on Stellar Soroban

A fully decentralized "no-loss" (English style) auction built on the Stellar network using Soroban Smart Contracts. Outbid participants get their SEP-41 tokens automatically refunded in the same transaction.

## Links

- **Network:** Stellar Testnet
- **Contract ID:** `CC6LMQUT6NPX7KYLPPLMKTROZZZ7VZPCAXQZQU4A3OVRGWTN77UJGE4H`
- **Frontend Live Demo:** [https://assessment-week4.vercel.app](https://assessment-week4.vercel.app)

## Prerequisites

- Node.js v18+
- [Freighter Wallet](https://freighter.app/) extension (set to **Testnet**)
- Testnet XLM to fund transactions and place bids

## Local Development (Frontend)

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Contract Features

1. **Initialize:** Create an auction with a designated SEP-41 token, starting price, and deadline.
2. **Bid:** Place bids using the SEP-41 token. The previous highest bidder is automatically refunded within the same transaction.
3. **Finalize:** Once the deadline has passed, anyone can finalize the auction to transfer the winning bid funds to the auctioneer.
4. **Cancel:** The auctioneer can cancel the auction only if no bids have been placed yet.

## Architecture & Tech Stack

- **Smart Contract:** Rust (Soroban SDK)
- **Frontend UI:** React + TypeScript (Vite), Tailwind CSS
- **Stellar Integration:** `@stellar/stellar-sdk`, `@stellar/freighter-api`
