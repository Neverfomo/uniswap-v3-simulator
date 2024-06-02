import { SimulatorClient } from "./client";
import { SimulationDataManager } from "./interface";
import { SQLiteSimulationDataManager } from "./manager";
import { BigNumber } from "ethers";
import { getPoolInfo } from "./pool-info";
import { USDC_TOKEN, WETH_TOKEN } from "./constants";


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
  let dataManager = await SQLiteSimulationDataManager.buildInstance('WETH-USDC-RPC_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db')
  let client = new SimulatorClient(dataManager)

  let blockNumber = 18000000
  console.log(`Block number: ${blockNumber}`)
  let poolInfo = await getPoolInfo(blockNumber, USDC_TOKEN, WETH_TOKEN)
  console.log(`Onchain sqrtPriceX96 ${poolInfo.sqrtPriceX96.toString()}`)
  const price = sqrtPriceX96ToPrice(poolInfo.sqrtPriceX96)
  console.log(`Onchain price ${price}`)

  let configPool = await client.recoverFromMainnetEventDBFile('WETH-USDC-RPC_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db', blockNumber)
  let pool = configPool.getCorePool()
  console.log(`Offchain sqrtPriceX96 ${pool.sqrtPriceX96}`)
  const offchainPrice = sqrtPriceX96ToPrice(BigNumber.from(pool.sqrtPriceX96.toString()))
  console.log(`Offchain price ${offchainPrice}`)

}

play().then()