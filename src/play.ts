import { SimulatorClient } from "./client";
import { SimulationDataManager } from "./interface";
import { SQLiteSimulationDataManager } from "./manager";
import { BigNumber } from "ethers";
import { getPoolInfo } from "./pool-info";
import { USDC_TOKEN, WETH_TOKEN } from "./constants";
import { SnapshotProfile } from "./entity";


function sqrtPriceX96ToPrice(sqrtPriceX96: BigNumber): string {
  // 定义 2^96 和 2^192
  const Q96 = BigNumber.from(2).pow(96);
  const Q192 = Q96.mul(Q96);

  // 计算 price
  const priceUSDC = sqrtPriceX96.mul(sqrtPriceX96).div(Q192);
  let priceWETH = BigNumber.from(1).mul(BigNumber.from(10).pow(18 - 6)).div(priceUSDC.div(100)).toNumber() / 100

  // 返回格式化后的价格
  return priceWETH.toString();
}

async function play() {

  // let blockNumber = 19980326
  let blockNumber = 20000000
  console.log(`Block number: ${blockNumber}`)
  let token0 = USDC_TOKEN
  let token1 = WETH_TOKEN
  let poolInfo = await getPoolInfo(blockNumber, token0, token1)

  let dataManager = await SQLiteSimulationDataManager.buildInstance(`./data/${token0.symbol}-${token1.symbol}-${poolInfo.fee}.db`)
  
  let client = new SimulatorClient(dataManager)

  console.time(`Replay events and recover pool state to block ${blockNumber}`)
  let configPool = await client.recoverFromMainnetEventDBFile('/home/ubuntu/lvr/uniswap-v3-simulator/WETH-USDC-RPC_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db', blockNumber)
  console.timeEnd(`Replay events and recover pool state to block ${blockNumber}`)
  let pool = configPool.getCorePool()
  console.log(`Offchain sqrtPriceX96 ${pool.sqrtPriceX96}`)
  const offchainPrice = sqrtPriceX96ToPrice(BigNumber.from(pool.sqrtPriceX96.toString()))
  console.log(`Offchain price ${offchainPrice}`)
  configPool.takeSnapshot(`${blockNumber}`)
  let snapshotId = await configPool.persistSnapshot()
  console.log(`SnapshotId ${snapshotId}`)
  
  console.log(`Onchain sqrtPriceX96 ${poolInfo.sqrtPriceX96.toString()}`)
  const price = sqrtPriceX96ToPrice(poolInfo.sqrtPriceX96)
  console.log(`Onchain price ${price}`)

  // let configPool = client.recoverCorePoolFromSnapshot("ed695d5b-b15a-4ebc-a9a7-0eb182249f11")
  // let pool = (await configPool).getCorePool()
  // const offchainPrice = sqrtPriceX96ToPrice(BigNumber.from(pool.sqrtPriceX96.toString()))
  // console.log(`Offchain price ${offchainPrice}`)
  // let snapshotProfiles: SnapshotProfile[] = await client.listSnapshotProfiles();
  // console.log(snapshotProfiles)
  
  process.exit(0)
  

  // let configPool = await client.recoverCorePoolFromSnapshot("14000000")
  // let pool = configPool.getCorePool();
  // console.log(`Offchain sqrtPriceX96 ${pool.sqrtPriceX96}`)
  // const offchainPrice = sqrtPriceX96ToPrice(BigNumber.from(pool.sqrtPriceX96.toString()))
  // console.log(`Offchain price ${offchainPrice}`)

  
}

function logMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  console.log(`Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  let heapTotal = (memoryUsage.heapTotal / 1024 / 1024)
  return heapTotal
}

function forceGC(heapTotal: number) {
  if (global.gc) {
      console.log(`HeapTotal ${heapTotal}, forcing garbage collection...`);
      global.gc();
  } else {
      console.log('Garbage collection is not exposed');
  }
}

// setInterval(() => {
  
//   let heapTotal = logMemoryUsage();
//   if (heapTotal > 4000) {
//     forceGC(heapTotal);
//     console.log("After GC:")
//     logMemoryUsage()
//   }
// }, 10000);

play().then()