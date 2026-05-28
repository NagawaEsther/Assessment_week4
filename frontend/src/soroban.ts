import * as StellarSdk from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from './config';
import { signTransaction } from '@stellar/freighter-api';

const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);

/**
 * Build, simulate, sign and submit a Soroban contract invocation.
 */
export async function invokeContract(
  contractId: string,
  method: string,
  params: StellarSdk.xdr.ScVal[],
  publicKey: string,
): Promise<StellarSdk.rpc.Api.GetTransactionResponse> {
  const account = await server.getAccount(publicKey);
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(120)
    .build();

  // Simulate to get the proper footprint / auth
  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${(simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error}`);
  }

  const assembled = StellarSdk.rpc.assembleTransaction(tx, simulated).build();

  // Sign via Freighter
  const signedResult = await signTransaction(assembled.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  const signedXdr = typeof signedResult === 'string' ? signedResult : signedResult.signedTxXdr;

  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE,
  ) as StellarSdk.Transaction;

  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error(`Transaction send error`);
  }

  // Poll for result
  let getResponse = await server.getTransaction(sendResponse.hash);
  while (getResponse.status === 'NOT_FOUND') {
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await server.getTransaction(sendResponse.hash);
  }

  return getResponse;
}

/**
 * Read-only contract call (no signing required).
 */
export async function queryContract(
  contractId: string,
  method: string,
  params: StellarSdk.xdr.ScVal[],
  publicKey?: string,
): Promise<StellarSdk.xdr.ScVal | undefined> {
  const sourceKey = publicKey || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const account = await server.getAccount(sourceKey).catch(() => {
    return new StellarSdk.Account(sourceKey, '0');
  });
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Query failed: ${(simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error}`);
  }
  if (!StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
    return undefined;
  }
  return simulated.result?.retval;
}
