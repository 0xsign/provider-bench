const { ethers } = require("ethers");

class Bench {
  _benches = {};
  _providers = [];
  _providerUris = [];

  constructor(providers, providerUris) {
    this._providers = providers;
    this._providerUris = providerUris;
  }

  async run(key, ops) {
    const res = await Promise.all(
      this._providers.map((provider) => this._runBenchmark(provider, ops))
    );

    this._benches[key] = res;
    return res;
  }

  print() {
    for (const key in this._benches) {
      console.log(key);
      console.table(
        this._benches[key].map((result, i) => {
          result.uri = this._providerUris[i];
          result.successRate =
            (100 * (result.opsCount - result.errors)) / result.opsCount + "%";
          return result;
        }),
        ["uri", "elapsed", "opsPerSec", "successRate"]
      );
    }
  }

  async _runBenchmark(provider, ops) {
    let errors = 0;
    let opsCount = 0;

    let start = process.hrtime();

    const outputs = await Promise.all(
      ops(provider).map((promise) =>
        promise
          .catch(() => {
            errors++;
            return null;
          })
          .finally(() => {
            opsCount++;
          })
      )
    );

    const time = process.hrtime(start);
    const elapsed = time[1] * 1e-9;

    return {
      outputs,
      elapsed,
      errors,
      opsCount: opsCount,
      opsPerSec: opsCount / elapsed,
    };
  }
}

async function main() {
  // argv[0]: node
  // argv[1]: bench.js
  // argv[2]: name
  // argv[3]: chainId
  // argv[4]: provider 0
  // argv[5]: provider 1
  // ...
  // argv[n]: provider n-4
  if (process.argv.length < 3) {
    console.error("Missing name argument");
    return;
  }

  if (process.argv.length < 4) {
    console.error("Missing chainId argument");
    return;
  }

  if (process.argv.length < 5) {
    console.error("Missing provider argument(s)");
    return;
  }

  const providerUris = [];
  const providers = [];
  for (let i = 4; i < process.argv.length; i++) {
    providerUris.push(process.argv[i]);
    providers.push(
      new ethers.providers.JsonRpcProvider(process.argv[i], {
        name: process.argv[2],
        chainId: parseInt(process.argv[3]),
      })
    );
  }

  const bench = new Bench(providers, providerUris);

  const blocksCount = 10;

  // Blocks with transactions:
  const blockNumber = await providers[0].getBlockNumber();

  const blockNumbers = Array(blocksCount)
    .fill(0)
    .map((_, i) => blockNumber - i);

  const blocksWithTransactionsBenchResult = await bench.run(
    "Get blocks with transactions:",
    (provider) =>
      blockNumbers.map((blockNumber) =>
        provider.getBlockWithTransactions(blockNumber)
      )
  );

  const transactions = blocksWithTransactionsBenchResult[0].outputs.flatMap(
    // filter out errors
    (block) => block?.transactions || []
  );

  // Transaction receipts
  const transactionsReceiptsBenchResult = await bench.run(
    "Get transactions receipts:",
    (provider) =>
      transactions.map((tx) => provider.getTransactionReceipt(tx.hash))
  );

  // Print results
  bench.print();
}

main();
