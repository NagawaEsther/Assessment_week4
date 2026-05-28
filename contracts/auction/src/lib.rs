#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env,
};

#[contracttype]
#[derive(Clone, Copy)]
pub enum DataKey {
    Token,
    Auctioneer,
    Deadline,
    HighestBidder,
    HighestBid,
    Initialized,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AuctionEnded = 3,
    AuctionNotEnded = 4,
    BidTooLow = 5,
    NotAuctioneer = 6,
    HasBids = 7,
}

#[contract]
pub struct AuctionContract;

#[contractimpl]
impl AuctionContract {
    /// Initialize a new auction.
    pub fn initialize(
        env: Env,
        token: Address,
        auctioneer: Address,
        deadline: u64,
        starting_price: i128,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Auctioneer, &auctioneer);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage().instance().set(&DataKey::HighestBid, &starting_price);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    /// Place a bid. Must be higher than current highest bid.
    /// Automatically refunds the previous highest bidder.
    pub fn bid(env: Env, bidder: Address, amount: i128) -> Result<(), Error> {
        bidder.require_auth();

        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() >= deadline {
            return Err(Error::AuctionEnded);
        }

        let highest_bid: i128 = env.storage().instance().get(&DataKey::HighestBid).unwrap();
        if amount <= highest_bid {
            return Err(Error::BidTooLow);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer tokens from bidder to contract
        token_client.transfer(&bidder, &env.current_contract_address(), &amount);

        // Refund previous highest bidder automatically
        if let Some(prev_bidder) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::HighestBidder)
        {
            token_client.transfer(&env.current_contract_address(), &prev_bidder, &highest_bid);
        }

        // Update state
        env.storage().instance().set(&DataKey::HighestBidder, &bidder);
        env.storage().instance().set(&DataKey::HighestBid, &amount);
        Ok(())
    }

    /// Finalize the auction after the deadline.
    /// Transfers the winning bid amount to the auctioneer.
    pub fn finalize(env: Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() < deadline {
            return Err(Error::AuctionNotEnded);
        }

        if let Some(_highest_bidder) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::HighestBidder)
        {
            let auctioneer: Address =
                env.storage().instance().get(&DataKey::Auctioneer).unwrap();
            let highest_bid: i128 =
                env.storage().instance().get(&DataKey::HighestBid).unwrap();
            let token_addr: Address =
                env.storage().instance().get(&DataKey::Token).unwrap();
            let token_client = token::Client::new(&env, &token_addr);

            token_client.transfer(&env.current_contract_address(), &auctioneer, &highest_bid);

            // Prevent double-finalize
            env.storage().instance().remove(&DataKey::HighestBidder);
        }
        Ok(())
    }

    /// Cancel auction — only by auctioneer, and only if no bids exist.
    pub fn cancel(env: Env, auctioneer: Address) -> Result<(), Error> {
        auctioneer.require_auth();

        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        let stored_auctioneer: Address =
            env.storage().instance().get(&DataKey::Auctioneer).unwrap();
        if auctioneer != stored_auctioneer {
            return Err(Error::NotAuctioneer);
        }

        if env.storage().instance().has(&DataKey::HighestBidder) {
            return Err(Error::HasBids);
        }

        // Clear all state
        env.storage().instance().remove(&DataKey::Initialized);
        env.storage().instance().remove(&DataKey::Token);
        env.storage().instance().remove(&DataKey::Auctioneer);
        env.storage().instance().remove(&DataKey::Deadline);
        env.storage().instance().remove(&DataKey::HighestBid);
        Ok(())
    }

    // ── View helpers ──

    pub fn get_highest_bid(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::HighestBid)
            .unwrap_or(0)
    }

    pub fn get_highest_bidder(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get::<_, Address>(&DataKey::HighestBidder)
    }

    pub fn get_deadline(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::Deadline)
            .unwrap_or(0)
    }

    pub fn get_token(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get::<_, Address>(&DataKey::Token)
    }

    pub fn get_auctioneer(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get::<_, Address>(&DataKey::Auctioneer)
    }
}
