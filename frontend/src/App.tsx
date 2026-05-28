import { useState, useEffect, useCallback, useRef } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  isAllowed,
  setAllowed,
  getAddress,
  getNetworkDetails,
} from '@stellar/freighter-api';
import { invokeContract, queryContract } from './soroban';
import { CONTRACT_ID, NATIVE_TOKEN_ADDRESS } from './config';

interface AuctionState {
  highestBid: string;
  highestBidder: string;
  deadline: number;
  token: string;
  auctioneer: string;
}

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [contractId, setContractId] = useState(CONTRACT_ID === 'PLACEHOLDER_CONTRACT_ID' ? '' : CONTRACT_ID);

  // Create-auction fields
  const [tokenAddr, setTokenAddr] = useState(NATIVE_TOKEN_ADDRESS);
  const [startPrice, setStartPrice] = useState('100');
  const [duration, setDuration] = useState('60');

  // Bid field
  const [bidAmount, setBidAmount] = useState('');

  // Auction state
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Wallet ──
  const checkConnection = useCallback(async () => {
    try {
      if (await isAllowed()) {
        const addrResult = await getAddress();
        if (addrResult && addrResult.address) setWalletAddress(addrResult.address);
        const nd = await getNetworkDetails();
        if (nd && nd.network) setNetwork(nd.network);
      }
    } catch { /* Freighter not installed */ }
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  const connectWallet = async () => {
    setConnectLoading(true);
    try {
      await setAllowed();
      await checkConnection();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showStatus(`Failed to connect: ${msg}`, 'error');
    }
    setConnectLoading(false);
  };

  // ── Status helpers ──
  const showStatus = (msg: string, type: 'success' | 'error') => {
    setStatusMsg(msg);
    setStatusType(type);
    setTimeout(() => { setStatusMsg(''); setStatusType(''); }, 6000);
  };

  // ── Countdown ──
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!auction || !auction.deadline) { setTimeLeft(''); return; }

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auction.deadline - now;
      if (diff <= 0) {
        setTimeLeft('ENDED');
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auction]);

  // ── Helper: safely extract address from Option<Address> ScVal ──
  const extractAddress = (scVal: StellarSdk.xdr.ScVal | undefined): string => {
    if (!scVal) return 'None';
    try {
      const native = StellarSdk.scValToNative(scVal);
      if (typeof native === 'string' && native.length === 56) return native;
      if (native && typeof native === 'object' && native.toString) {
        const s = native.toString();
        if (s.length === 56) return s;
      }
      return 'None';
    } catch {
      try {
        return StellarSdk.Address.fromScVal(scVal).toString();
      } catch {
        return 'None';
      }
    }
  };

  // ── Query auction state ──
  const refreshAuction = useCallback(async () => {
    if (!contractId) return;
    try {
      const bidVal = await queryContract(contractId, 'get_highest_bid', [], walletAddress || undefined);
      const deadlineVal = await queryContract(contractId, 'get_deadline', [], walletAddress || undefined);

      let bidderStr = 'None';
      try {
        const bidderVal = await queryContract(contractId, 'get_highest_bidder', [], walletAddress || undefined);
        bidderStr = extractAddress(bidderVal);
      } catch { bidderStr = 'None'; }

      let tokenStr = '';
      try {
        const tokenVal = await queryContract(contractId, 'get_token', [], walletAddress || undefined);
        tokenStr = extractAddress(tokenVal);
        if (tokenStr === 'None') tokenStr = '';
      } catch { /* skip */ }

      let auctioneerStr = '';
      try {
        const auctioneerVal = await queryContract(contractId, 'get_auctioneer', [], walletAddress || undefined);
        auctioneerStr = extractAddress(auctioneerVal);
        if (auctioneerStr === 'None') auctioneerStr = '';
      } catch { /* skip */ }

      const highestBid = bidVal ? StellarSdk.scValToNative(bidVal).toString() : '0';
      const deadline = deadlineVal ? Number(StellarSdk.scValToNative(deadlineVal)) : 0;

      setAuction({
        highestBid,
        highestBidder: bidderStr,
        deadline,
        token: tokenStr,
        auctioneer: auctioneerStr,
      });
    } catch (e: unknown) {
      console.error('Failed to refresh auction:', e);
    }
  }, [contractId, walletAddress]);

  useEffect(() => {
    if (contractId) refreshAuction();
  }, [contractId, refreshAuction]);

  // ── Create Auction ──
  const handleCreate = async () => {
    if (!walletAddress) return showStatus('Connect your wallet first', 'error');
    if (!contractId) return showStatus('Enter a Contract ID', 'error');
    setTxLoading(true);
    try {
      const params = [
        new StellarSdk.Address(tokenAddr).toScVal(),
        new StellarSdk.Address(walletAddress).toScVal(),
        StellarSdk.nativeToScVal(Math.floor(Date.now() / 1000) + parseInt(duration) * 60, { type: 'u64' }),
        StellarSdk.nativeToScVal(BigInt(startPrice), { type: 'i128' }),
      ];
      const result = await invokeContract(contractId, 'initialize', params, walletAddress);
      if (result.status === 'SUCCESS') {
        showStatus('Auction created successfully!', 'success');
        await refreshAuction();
      } else {
        showStatus('Transaction failed', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showStatus(`Error: ${msg}`, 'error');
    }
    setTxLoading(false);
  };

  // ── Place Bid ──
  const handleBid = async () => {
    if (!walletAddress) return showStatus('Connect your wallet first', 'error');
    if (!contractId) return showStatus('Enter a Contract ID', 'error');
    if (!bidAmount) return showStatus('Enter a bid amount', 'error');
    setTxLoading(true);
    try {
      const params = [
        new StellarSdk.Address(walletAddress).toScVal(),
        StellarSdk.nativeToScVal(BigInt(bidAmount), { type: 'i128' }),
      ];
      const result = await invokeContract(contractId, 'bid', params, walletAddress);
      if (result.status === 'SUCCESS') {
        showStatus('Bid placed! Previous bidder refunded automatically.', 'success');
        await refreshAuction();
      } else {
        showStatus('Bid transaction failed', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showStatus(`Error: ${msg}`, 'error');
    }
    setTxLoading(false);
  };

  // ── Finalize ──
  const handleFinalize = async () => {
    if (!walletAddress) return showStatus('Connect your wallet first', 'error');
    if (!contractId) return showStatus('Enter a Contract ID', 'error');
    setTxLoading(true);
    try {
      const result = await invokeContract(contractId, 'finalize', [], walletAddress);
      if (result.status === 'SUCCESS') {
        showStatus('Auction finalized! Funds sent to auctioneer.', 'success');
        await refreshAuction();
      } else {
        showStatus('Finalize failed', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showStatus(`Error: ${msg}`, 'error');
    }
    setTxLoading(false);
  };

  // ── Cancel ──
  const handleCancel = async () => {
    if (!walletAddress) return showStatus('Connect your wallet first', 'error');
    if (!contractId) return showStatus('Enter a Contract ID', 'error');
    setTxLoading(true);
    try {
      const params = [
        new StellarSdk.Address(walletAddress).toScVal(),
      ];
      const result = await invokeContract(contractId, 'cancel', params, walletAddress);
      if (result.status === 'SUCCESS') {
        showStatus('Auction cancelled.', 'success');
        setAuction(null);
      } else {
        showStatus('Cancel failed — might have existing bids.', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showStatus(`Error: ${msg}`, 'error');
    }
    setTxLoading(false);
  };

  const shortAddr = (a: string) => a ? `${a.slice(0, 5)}…${a.slice(-4)}` : '';
  const isLive = auction && auction.deadline > 0 && auction.deadline > Math.floor(Date.now() / 1000);
  const isEnded = auction && auction.deadline > 0 && auction.deadline <= Math.floor(Date.now() / 1000);
  const hasNoBids = auction && auction.highestBidder === 'None';
  const isAuctioneer = auction && walletAddress && auction.auctioneer === walletAddress;

  return (
    <div className="min-h-screen relative overflow-hidden text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Animated background blobs */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-30"
             style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)', animation: 'float 8s ease-in-out infinite' }} />
        <div className="absolute top-[20%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-30"
             style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)', animation: 'float 10s ease-in-out infinite reverse' }} />
        <div className="absolute bottom-[-10%] left-[30%] w-[600px] h-[600px] rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)', animation: 'float 12s ease-in-out infinite' }} />
      </div>

      {/* Loading overlay */}
      {txLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-white/10" style={{ background: 'rgba(26,35,58,0.9)' }}>
            <div className="w-12 h-12 border-4 border-white/20 border-t-blue-500 rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-white/80 font-medium">Processing transaction…</p>
          </div>
        </div>
      )}

      {/* Status toast */}
      {statusMsg && (
        <div className="fixed top-4 right-4 z-50 max-w-sm" style={{ animation: 'slideIn 0.3s ease-out' }}>
          <div className={`px-5 py-3 rounded-xl border backdrop-blur-md shadow-2xl ${statusType === 'success' ? 'bg-green-500/20 border-green-400/30 text-green-300' : 'bg-red-500/20 border-red-400/30 text-red-300'}`}>
            {statusMsg}
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 p-6 rounded-2xl border border-white/10 backdrop-blur-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              No-Loss Auction
            </h1>
            <p className="text-white/50 text-sm mt-1">Decentralized Auction Protocol on Stellar Soroban</p>
          </div>
          <div>
            {walletAddress ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-white/70 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">{network || 'TESTNET'}</span>
                <span className="text-sm font-semibold px-4 py-1.5 rounded-lg shadow-lg" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>
                  {shortAddr(walletAddress)}
                </span>
              </div>
            ) : (
              <button onClick={connectWallet} disabled={connectLoading}
                className="cursor-pointer px-6 py-2.5 rounded-xl font-semibold text-sm text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', boxShadow: '0 8px 32px rgba(59,130,246,0.3)' }}>
                {connectLoading ? 'Connecting…' : '🔗 Connect Freighter'}
              </button>
            )}
          </div>
        </header>

        {/* Contract ID input */}
        <div className="mb-8 p-5 rounded-2xl border border-white/10 backdrop-blur-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <label className="block text-sm font-medium text-white/60 mb-2">Contract ID</label>
          <input type="text" value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="Enter deployed contract address (C…)"
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm" />
          {contractId && (
            <button onClick={refreshAuction} className="cursor-pointer mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              ↻ Refresh auction state
            </button>
          )}
        </div>

        {/* Main grid */}
        <main className="grid lg:grid-cols-2 gap-8">
          {/* Create Auction Panel */}
          <section className="p-6 rounded-2xl border border-white/10 backdrop-blur-xl transition-all duration-300 hover:border-white/20" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>1</span>
              Create Auction
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">SEP-41 Token Address</label>
                <input type="text" value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Starting Price (stroops)</label>
                  <input type="number" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder="100"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Duration (minutes)</label>
                  <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                </div>
              </div>
              <button onClick={handleCreate} disabled={txLoading || !walletAddress}
                className="cursor-pointer w-full py-3 rounded-xl font-semibold text-sm text-white shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', boxShadow: '0 8px 32px rgba(59,130,246,0.25)' }}>
                🚀 Create New Auction
              </button>
            </div>
          </section>

          {/* Active Auction Panel */}
          <section className="p-6 rounded-2xl border border-white/10 backdrop-blur-xl relative overflow-hidden group transition-all duration-300 hover:border-white/20" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.05), rgba(59,130,246,0.05))' }} />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold">Active Auction</h2>
                {auction && auction.deadline > 0 && (
                  <span className={`px-3 py-1 text-xs font-bold rounded-full border ${isLive ? 'bg-green-500/20 text-green-400 border-green-400/30' : 'bg-red-500/20 text-red-400 border-red-400/30'}`}
                    style={isLive ? { animation: 'pulse 2s ease-in-out infinite' } : {}}>
                    {isLive ? '● LIVE' : '● ENDED'}
                  </span>
                )}
              </div>

              {auction && auction.deadline > 0 ? (
                <>
                  <div className="rounded-xl p-5 mb-5 border border-white/5" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Highest Bid</div>
                        <div className="text-3xl font-extrabold" style={{ background: 'linear-gradient(135deg, #3B82F6, #10B981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {auction.highestBid}
                        </div>
                        <div className="text-xs text-white/40 mt-1">stroops</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Time Remaining</div>
                        <div className="text-3xl font-mono font-bold text-white/90">{timeLeft}</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Leading Bidder</div>
                      <div className="text-sm font-mono text-white/70">{auction.highestBidder === 'None' ? 'No bids yet' : shortAddr(auction.highestBidder)}</div>
                    </div>
                    {auction.auctioneer && (
                      <div className="mt-3">
                        <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Auctioneer</div>
                        <div className="text-sm font-mono text-white/70">{shortAddr(auction.auctioneer)}</div>
                      </div>
                    )}
                  </div>

                  {/* Bid form */}
                  {isLive && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-white/60 mb-1">Your Bid (stroops)</label>
                      <div className="flex gap-2">
                        <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder={`Min: ${(BigInt(auction.highestBid) + 1n).toString()}`}
                          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />
                        <button onClick={handleBid} disabled={txLoading || !walletAddress}
                          className="cursor-pointer px-6 py-3 rounded-xl font-semibold text-sm text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #10B981, #3B82F6)', boxShadow: '0 8px 32px rgba(16,185,129,0.25)' }}>
                          ⚡ Bid
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    {isEnded && (
                      <button onClick={handleFinalize} disabled={txLoading || !walletAddress}
                        className="cursor-pointer flex-1 py-2.5 rounded-xl font-semibold text-sm text-white border border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/20 transition-all disabled:opacity-50">
                        ✓ Finalize
                      </button>
                    )}
                    {isAuctioneer && hasNoBids && (
                      <button onClick={handleCancel} disabled={txLoading || !walletAddress}
                        className="cursor-pointer flex-1 py-2.5 rounded-xl font-semibold text-sm text-white border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 transition-all disabled:opacity-50">
                        ✕ Cancel
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-white/30">
                  <div className="text-5xl mb-4">🏛️</div>
                  <p className="text-lg font-medium">No active auction</p>
                  <p className="text-sm mt-1">Create one or enter a Contract ID above</p>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-16 text-center text-white/30 text-xs pb-8">
          <p>No-Loss Auction Protocol · Built on Stellar Soroban · Testnet</p>
        </footer>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default App;
