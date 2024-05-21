import { parentPort, workerData } from "worker_threads";
import { ethers } from "ethers";
import JSBI from "jsbi";
import { Tick } from "./model/Tick"; // 导入你的 Tick 类
import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import fs from "fs";

async function getTicks(chunkStart: number, chunkEnd: number, poolAddress: string, blockNumber: number, RPC_URL: string, logFilePath: string): Promise<Tick[]> {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const poolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI, provider);
  const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });

  let ticks: Tick[] = [];
  for (let tickIndex = chunkStart; tickIndex <= chunkEnd; tickIndex++) {
    try {
      let data = await poolContract.ticks(tickIndex, { blockTag: blockNumber });
      let tick = new Tick(tickIndex);
      tick._liquidityGross = JSBI.BigInt(data.liquidityGross.toString());
      tick._liquidityNet = JSBI.BigInt(data.liquidityNet.toString());
      tick._feeGrowthOutside0X128 = JSBI.BigInt(data.feeGrowthOutside0X128.toString());
      tick._feeGrowthOutside1X128 = JSBI.BigInt(data.feeGrowthOutside1X128.toString());
      ticks.push(tick);
      logFile.write(`Tick ${tickIndex} processed.\n`);
    } catch (error) {
      // 忽略未初始化的 tick
      logFile.write(`Error processing tick ${tickIndex}: ${error.message}\n`);
    }
  }
  logFile.close();
  return ticks;
}

const { chunkStart, chunkEnd, poolAddress, blockNumber, RPC_URL, logFilePath } = workerData;

getTicks(chunkStart, chunkEnd, poolAddress, blockNumber, RPC_URL, logFilePath).then(ticks => {
  if (parentPort) {
    parentPort.postMessage(ticks);
  }
}).catch(error => {
  if (parentPort) {
    parentPort.postMessage([]);
  }
  console.error('Error fetching ticks:', error);
});
