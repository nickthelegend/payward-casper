#![cfg_attr(not(test), no_std)]
//! # Clawback Escrow (Casper / Odra)
//!
//! Agent payment escrow with **AI-adjudicated disputes** — chargebacks for the machine
//! economy. Ported from the Arc/Solidity `ClawbackEscrow`.
//!
//! Flow: a buyer escrows a CEP-18 payment for a spec'd delivery (`open` → **Held**); the
//! seller delivers and records a response hash (`mark_delivered`); within the dispute
//! window the buyer either `release`s a good delivery (→ **Released**, seller paid) or
//! `dispute`s a bad one (→ **Disputed**); a trusted off-chain **AI verifier** then
//! `resolve`s the dispute — pay the seller (**Released**) or refund the buyer
//! (**Refunded**). Reputation (won/lost/volume → score) accrues per agent.
//!
//! This is a settlement layer SEPARATE from the Fund402 credit vault: Fund402 *fronts*
//! payments (credit); Clawback *escrows* them with dispute resolution (chargebacks).

extern crate alloc;

use odra::casper_types::U256;
use odra::prelude::*;
use odra::ContractRef;

#[allow(dead_code)]
const STATUS_NONE: u8 = 0;
const STATUS_HELD: u8 = 1;
const STATUS_RELEASED: u8 = 2;
const STATUS_REFUNDED: u8 = 3;
const STATUS_DISPUTED: u8 = 4;

#[odra::odra_error]
pub enum ClawbackError {
    AlreadyInitialized = 1,
    DealExists = 2,
    DealNotFound = 3,
    BadState = 4,
    NotBuyer = 5,
    NotSeller = 6,
    NotVerifier = 7,
    WindowOpen = 8,
    WindowClosed = 9,
}

/// A single escrowed deal. `spec_hash` commits to the buyer's stated requirement;
/// `response_hash` commits to the seller's delivered payload.
#[odra::odra_type]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub amount: U256,
    pub deadline: u64,
    pub spec_hash: String,
    pub response_hash: String,
    /// 0 none, 1 held, 2 released, 3 refunded, 4 disputed.
    pub status: u8,
}

/// Reputation snapshot for an agent.
#[odra::odra_type]
pub struct RepView {
    pub won: u64,
    pub lost: u64,
    pub volume: U256,
    pub score: i64,
}

#[odra::event]
pub struct Opened {
    pub deal_id: String,
    pub buyer: Address,
    pub seller: Address,
    pub amount: U256,
    pub spec_hash: String,
}
#[odra::event]
pub struct Delivered {
    pub deal_id: String,
    pub response_hash: String,
}
#[odra::event]
pub struct Released {
    pub deal_id: String,
}
#[odra::event]
pub struct Disputed {
    pub deal_id: String,
}
#[odra::event]
pub struct Resolved {
    pub deal_id: String,
    pub delivered_ok: bool,
}

#[odra::module(events = [Opened, Delivered, Released, Disputed, Resolved])]
pub struct ClawbackEscrow {
    admin: Var<Address>,
    /// CEP-18 settlement asset (e.g. the Fund402 USDC token).
    asset_token: Var<Address>,
    /// The trusted AI attester address allowed to `resolve` disputes.
    verifier: Var<Address>,
    deals: Mapping<String, Deal>,
    rep_won: Mapping<Address, u64>,
    rep_lost: Mapping<Address, u64>,
    rep_volume: Mapping<Address, U256>,
}

#[odra::module]
impl ClawbackEscrow {
    /// One-time constructor. `asset_token` = CEP-18 package; `verifier` = the AI
    /// attester account allowed to adjudicate disputes.
    pub fn init(&mut self, asset_token: Address, verifier: Address) {
        if self.admin.get().is_some() {
            self.env().revert(ClawbackError::AlreadyInitialized);
        }
        self.admin.set(self.env().caller());
        self.asset_token.set(asset_token);
        self.verifier.set(verifier);
    }

    /// Buyer opens an escrow for `amount`, committing to `spec_hash`. The buyer must
    /// have `approve`d this contract on the CEP-18 token for `amount` first. Status → Held.
    pub fn open(&mut self, deal_id: String, seller: Address, amount: U256, window: u64, spec_hash: String) {
        let buyer = self.env().caller();
        if self.deals.get(&deal_id).is_some() {
            self.env().revert(ClawbackError::DealExists);
        }
        self.cep18().transfer_from(&buyer, &self.env().self_address(), &amount);
        let deadline = self.env().get_block_time() + window;
        self.deals.set(
            &deal_id,
            Deal {
                buyer,
                seller,
                amount,
                deadline,
                spec_hash: spec_hash.clone(),
                response_hash: String::new(),
                status: STATUS_HELD,
            },
        );
        self.env().emit_event(Opened { deal_id, buyer, seller, amount, spec_hash });
    }

    /// Seller records the hash of the delivered payload.
    pub fn mark_delivered(&mut self, deal_id: String, response_hash: String) {
        let mut deal = self
            .deals
            .get(&deal_id)
            .unwrap_or_revert_with(&self.env(), ClawbackError::DealNotFound);
        if self.env().caller() != deal.seller {
            self.env().revert(ClawbackError::NotSeller);
        }
        if deal.status != STATUS_HELD {
            self.env().revert(ClawbackError::BadState);
        }
        deal.response_hash = response_hash.clone();
        self.deals.set(&deal_id, deal);
        self.env().emit_event(Delivered { deal_id, response_hash });
    }

    /// Release escrow to the seller. The buyer may release early (good delivery);
    /// anyone may release after the dispute window. Pays the seller + rep both.
    pub fn release(&mut self, deal_id: String) {
        let mut deal = self
            .deals
            .get(&deal_id)
            .unwrap_or_revert_with(&self.env(), ClawbackError::DealNotFound);
        if deal.status != STATUS_HELD {
            self.env().revert(ClawbackError::BadState);
        }
        let caller = self.env().caller();
        if self.env().get_block_time() < deal.deadline && caller != deal.buyer {
            self.env().revert(ClawbackError::WindowOpen);
        }
        deal.status = STATUS_RELEASED;
        let (seller, buyer, amount) = (deal.seller, deal.buyer, deal.amount);
        self.deals.set(&deal_id, deal);
        self.cep18().transfer(&seller, &amount);
        self.record(seller, true, amount);
        self.record(buyer, true, amount);
        self.env().emit_event(Released { deal_id });
    }

    /// Buyer disputes a bad delivery within the window → Disputed (awaiting the verifier).
    pub fn dispute(&mut self, deal_id: String) {
        let mut deal = self
            .deals
            .get(&deal_id)
            .unwrap_or_revert_with(&self.env(), ClawbackError::DealNotFound);
        if self.env().caller() != deal.buyer {
            self.env().revert(ClawbackError::NotBuyer);
        }
        if deal.status != STATUS_HELD {
            self.env().revert(ClawbackError::BadState);
        }
        if self.env().get_block_time() >= deal.deadline {
            self.env().revert(ClawbackError::WindowClosed);
        }
        deal.status = STATUS_DISPUTED;
        self.deals.set(&deal_id, deal);
        self.env().emit_event(Disputed { deal_id });
    }

    /// AI verifier adjudicates a dispute: pay the seller if `delivered_ok`, else refund
    /// the buyer. The winner gains reputation; the loser takes the hit.
    pub fn resolve(&mut self, deal_id: String, delivered_ok: bool) {
        if self.env().caller() != self.verifier.get().unwrap() {
            self.env().revert(ClawbackError::NotVerifier);
        }
        let mut deal = self
            .deals
            .get(&deal_id)
            .unwrap_or_revert_with(&self.env(), ClawbackError::DealNotFound);
        if deal.status != STATUS_DISPUTED {
            self.env().revert(ClawbackError::BadState);
        }
        let (seller, buyer, amount) = (deal.seller, deal.buyer, deal.amount);
        if delivered_ok {
            deal.status = STATUS_RELEASED;
            self.deals.set(&deal_id, deal);
            self.cep18().transfer(&seller, &amount);
        } else {
            deal.status = STATUS_REFUNDED;
            self.deals.set(&deal_id, deal);
            self.cep18().transfer(&buyer, &amount);
        }
        self.record(seller, delivered_ok, amount);
        self.record(buyer, !delivered_ok, amount);
        self.env().emit_event(Resolved { deal_id, delivered_ok });
    }

    // ----------------------------------------------------------------- views

    pub fn get_deal(&self, deal_id: String) -> Option<Deal> {
        self.deals.get(&deal_id)
    }

    pub fn get_reputation(&self, agent: Address) -> RepView {
        let won = self.rep_won.get_or_default(&agent);
        let lost = self.rep_lost.get_or_default(&agent);
        let volume = self.rep_volume.get_or_default(&agent);
        RepView { won, lost, volume, score: Self::score(won, lost, volume) }
    }

    pub fn get_verifier(&self) -> Address {
        self.verifier.get().unwrap()
    }

    // --------------------------------------------------------------- helpers

    fn record(&mut self, agent: Address, won: bool, amount: U256) {
        if won {
            self.rep_won.set(&agent, self.rep_won.get_or_default(&agent) + 1);
        } else {
            self.rep_lost.set(&agent, self.rep_lost.get_or_default(&agent) + 1);
        }
        self.rep_volume
            .set(&agent, self.rep_volume.get_or_default(&agent).saturating_add(amount));
    }

    /// score = 400 (verified base) + 50·won + volume/1e6 − 125·lost, clamped ≥ 0.
    fn score(won: u64, lost: u64, volume: U256) -> i64 {
        let vol_pts = (volume / U256::from(1_000_000u64)).as_u64() as i64;
        let s = 400 + (won as i64) * 50 + vol_pts - (lost as i64) * 125;
        if s < 0 {
            0
        } else {
            s
        }
    }

    fn cep18(&self) -> Cep18ContractRef {
        Cep18ContractRef::new(self.env(), self.asset_token.get().unwrap())
    }
}

/// Minimal CEP-18 interface used for escrow + payout.
#[odra::external_contract]
pub trait Cep18 {
    fn transfer(&mut self, recipient: &Address, amount: &U256);
    fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
    fn balance_of(&self, address: &Address) -> U256;
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    #[odra::module]
    pub struct MockCep18 {
        balances: Mapping<Address, U256>,
        allowances: Mapping<(Address, Address), U256>,
    }

    #[odra::module]
    impl MockCep18 {
        pub fn init(&mut self, initial_supply: U256) {
            self.balances.set(&self.env().caller(), initial_supply);
        }
        pub fn balance_of(&self, address: &Address) -> U256 {
            self.balances.get_or_default(address)
        }
        pub fn approve(&mut self, spender: &Address, amount: &U256) {
            let owner = self.env().caller();
            self.allowances.set(&(owner, *spender), *amount);
        }
        pub fn transfer(&mut self, recipient: &Address, amount: &U256) {
            let from = self.env().caller();
            self.balances.set(&from, self.balances.get_or_default(&from) - *amount);
            self.balances.set(recipient, self.balances.get_or_default(recipient) + *amount);
        }
        pub fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256) {
            let spender = self.env().caller();
            let allow = self.allowances.get_or_default(&(*owner, spender));
            self.allowances.set(&(*owner, spender), allow - *amount);
            self.balances.set(owner, self.balances.get_or_default(owner) - *amount);
            self.balances.set(recipient, self.balances.get_or_default(recipient) + *amount);
        }
    }

    struct Setup {
        env: HostEnv,
        token: MockCep18HostRef,
        escrow: ClawbackEscrowHostRef,
        buyer: Address,
        seller: Address,
        verifier: Address,
    }

    fn setup() -> Setup {
        let env = odra_test::env();
        let deployer = env.get_account(0); // funds + admin
        let buyer = env.get_account(1);
        let seller = env.get_account(2);
        let verifier = env.get_account(3);
        let mut token = MockCep18::deploy(&env, MockCep18InitArgs { initial_supply: U256::from(10_000_000u64) });
        let escrow = ClawbackEscrow::deploy(
            &env,
            ClawbackEscrowInitArgs { asset_token: token.address(), verifier },
        );
        // give the buyer funds + approve the escrow.
        env.set_caller(deployer);
        token.transfer(&buyer, &U256::from(1_000_000u64));
        env.set_caller(buyer);
        token.approve(&escrow.address(), &U256::from(1_000_000u64));
        Setup { env, token, escrow, buyer, seller, verifier }
    }

    #[test]
    fn open_holds_escrow() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d1"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        let deal = s.escrow.get_deal(String::from("d1")).unwrap();
        assert_eq!(deal.status, STATUS_HELD);
        assert_eq!(deal.amount, U256::from(100_000u64));
        assert_eq!(s.token.balance_of(&s.escrow.address()), U256::from(100_000u64)); // escrow holds it
        assert_eq!(s.token.balance_of(&s.buyer), U256::from(900_000u64));
    }

    #[test]
    fn release_pays_seller_and_reps() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d2"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        s.env.set_caller(s.seller);
        s.escrow.mark_delivered(String::from("d2"), String::from("resp"));
        s.env.set_caller(s.buyer);
        s.escrow.release(String::from("d2")); // buyer releases early on a good delivery
        assert_eq!(s.escrow.get_deal(String::from("d2")).unwrap().status, STATUS_RELEASED);
        assert_eq!(s.token.balance_of(&s.seller), U256::from(100_000u64)); // seller paid
        assert_eq!(s.escrow.get_reputation(s.seller).won, 1);
        assert_eq!(s.escrow.get_reputation(s.buyer).won, 1);
    }

    #[test]
    fn dispute_then_resolve_refunds_buyer() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d3"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        s.escrow.dispute(String::from("d3"));
        assert_eq!(s.escrow.get_deal(String::from("d3")).unwrap().status, STATUS_DISPUTED);
        // AI verifier rules the delivery bad → refund the buyer.
        s.env.set_caller(s.verifier);
        s.escrow.resolve(String::from("d3"), false);
        assert_eq!(s.escrow.get_deal(String::from("d3")).unwrap().status, STATUS_REFUNDED);
        assert_eq!(s.token.balance_of(&s.buyer), U256::from(1_000_000u64)); // refunded in full
        assert_eq!(s.token.balance_of(&s.seller), U256::zero());
        assert_eq!(s.escrow.get_reputation(s.seller).lost, 1); // seller penalized
        assert_eq!(s.escrow.get_reputation(s.buyer).won, 1);
    }

    #[test]
    fn dispute_then_resolve_pays_seller_when_ok() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d4"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        s.escrow.dispute(String::from("d4"));
        s.env.set_caller(s.verifier);
        s.escrow.resolve(String::from("d4"), true); // verifier sides with the seller
        assert_eq!(s.token.balance_of(&s.seller), U256::from(100_000u64));
        assert_eq!(s.escrow.get_reputation(s.seller).won, 1);
        assert_eq!(s.escrow.get_reputation(s.buyer).lost, 1);
    }

    #[test]
    fn only_verifier_can_resolve() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d5"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        s.escrow.dispute(String::from("d5"));
        s.env.set_caller(s.buyer); // not the verifier
        assert_eq!(
            s.escrow.try_resolve(String::from("d5"), false).unwrap_err(),
            ClawbackError::NotVerifier.into()
        );
    }

    #[test]
    fn only_buyer_can_dispute() {
        let mut s = setup();
        s.env.set_caller(s.buyer);
        s.escrow.open(String::from("d6"), s.seller, U256::from(100_000u64), 3_600_000, String::from("spec"));
        s.env.set_caller(s.seller); // not the buyer
        assert_eq!(
            s.escrow.try_dispute(String::from("d6")).unwrap_err(),
            ClawbackError::NotBuyer.into()
        );
    }

    #[test]
    fn score_rewards_wins_penalizes_losses() {
        // base 400 + 50*won + vol/1e6 - 125*lost
        assert_eq!(ClawbackEscrow::score(0, 0, U256::zero()), 400);
        assert_eq!(ClawbackEscrow::score(2, 0, U256::from(13_000_000u64)), 400 + 100 + 13);
        assert_eq!(ClawbackEscrow::score(0, 5, U256::zero()), 0); // clamped
    }
}
