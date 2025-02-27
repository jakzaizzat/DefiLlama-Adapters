const { getTableRows, getCurrencyBalance, getAllOracleData, getTokenPriceUsd } = require("../helper/proton");

const LENDING_CONTRACT = 'lending.loan';
const LOAN_TOKEN_CONTRACT = 'loan.token';
const STAKING_CONTRACT = 'lock.token';

async function getAllMarkets(lower_bound) {
  try {
    let { rows, more, next_key } = await getTableRows({
      code: LENDING_CONTRACT,
      scope: LENDING_CONTRACT,
      table: 'markets',
      limit: -1,
      lower_bound: lower_bound,
    });

    if (more) {
      rows = rows.concat(await getAllMarkets(next_key));
    }

    return rows;
  } catch (e) {
    return [];
  }
}

function getLendingTvl(returnBorrowed = false) {
  return async () => {
    const oracles = await getAllOracleData();
    const markets = await getAllMarkets();
  
    let available = 0;
    let borrowed = 0;
    let tvl = 0;
  
    for (const market of markets) {
      // Find oracle
      const oracle = oracles.find(
        (oracle) => oracle.feed_index === market.oracle_feed_index
      );
      if (!oracle || !oracle.aggregate.d_double) continue;
  
      // Determine pool amount
      const [, symbol] = market.underlying_symbol.sym.split(',');
      const [cash] = await getCurrencyBalance(
        market.underlying_symbol.contract,
        LENDING_CONTRACT,
        symbol
      );
      const [cashAmount] = cash.split(' ');
      const [borrowAmount] = market.total_variable_borrows.quantity.split(' ');
      const total = +cashAmount + +borrowAmount;
  
      available += +cashAmount * oracle.aggregate.d_double;
      borrowed += +borrowAmount * oracle.aggregate.d_double;
      tvl += total * oracle.aggregate.d_double;
    }
  
    if (returnBorrowed) {
      return borrowed
    } else {
      return tvl - borrowed
    }
  }
};

async function getTotalStaking() {
  const loanPrice = await getTokenPriceUsd('LOAN', LOAN_TOKEN_CONTRACT)
  const [staked] = await getCurrencyBalance(LOAN_TOKEN_CONTRACT, STAKING_CONTRACT, 'LOAN')
  const [stakedAmount] = staked.split(' ');
  return stakedAmount * loanPrice
};

async function fetch() {
  const [tvl, staked] = await Promise.all([
    getLendingTvl(false)(),
    getTotalStaking()
  ])
  return tvl + staked
};

module.exports = {
  methodology: `Proton Loan TVL is the sum of all lending deposits in the Proton Loan smart contract and single-side staked LOAN.`,
  proton: {
    fetch: getLendingTvl(false),
  },
  borrowed: {
    fetch: getLendingTvl(true)
  },
  staking: {
    fetch: getTotalStaking
  },
  fetch: getLendingTvl(false)
}