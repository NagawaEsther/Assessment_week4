# Decentralized No-Loss Auction on Stellar

This is my submission for the No-Loss Auction Protocol project, built on the Stellar network using Soroban. In this auction system, outbid participants get their tokens automatically refunded back to them as soon as a higher bid is placed.

## Live Links

- **Frontend Demo:** [https://assessment-week4.vercel.app](https://assessment-week4.vercel.app)
- **Stellar Network:** Testnet
- **Smart Contract ID:** `CC6LMQUT6NPX7KYLPPLMKTROZZZ7VZPCAXQZQU4A3OVRGWTN77UJGE4H`

## What you need to test it

- Node.js installed
- The [Freighter Wallet](https://freighter.app/) extension (make sure it's set to Testnet)
- Some Testnet XLM to pay for transaction fees

## Running the Frontend Locally

If you want to run the React app locally instead of using the Vercel link:

1. Go into the frontend folder:
   ```bash
   cd frontend
   ```
2. Install the packages:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm run dev
   ```

## Core Contract Features

- **Initialize:** Start a new auction by setting the token, starting price, and how long the auction will last.
- **Bid:** Users can place bids using a SEP-41 token. The contract automatically refunds the previous highest bidder so they don't lose their funds.
- **Finalize:** Once the time is up, anyone can trigger this to send the winning funds to the auctioneer.
- **Cancel:** The auctioneer can cancel the auction, but only if nobody has placed a bid yet.

## Tech Stack

- **Smart Contract:** Rust (Soroban)
- **Frontend:** React, Vite, Tailwind CSS
- **Wallet Connection:** `@stellar/freighter-api` and `@stellar/stellar-sdk`
