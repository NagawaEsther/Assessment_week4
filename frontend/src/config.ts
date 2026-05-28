import * as StellarSdk from '@stellar/stellar-sdk';

// ── Contract configuration ──
// This will be updated after deployment
export const CONTRACT_ID: string = 'CC6LMQUT6NPX7KYLPPLMKTROZZZ7VZPCAXQZQU4A3OVRGWTN77UJGE4H';
export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Native XLM wrapped for SEP-41
export const NATIVE_TOKEN_ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
