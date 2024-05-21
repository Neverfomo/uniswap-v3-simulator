import { ethers } from "ethers";
import JSBI from "jsbi";
import fs from "fs";
import { Tick } from "./model/Tick"; // 导入你的 Tick 类
import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { RPC_URL } from "./config";

// Initialize ethers provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Replace with your pool address
const poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

// 定义 tickSpacing
const TICK_SPACING = 10;

// 定义最小和最大 tick 值
const MIN_TICK = -887272;
const MAX_TICK = 887272;

// 计算最小和最大 word 位置
const MIN_WORD = Math.floor(MIN_TICK / (256 * TICK_SPACING));
const MAX_WORD = Math.floor(MAX_TICK / (256 * TICK_SPACING));

// Function to get all initialized ticks from the pool at a specific block number
async function getAllInitializedTicks(blockNumber: number): Promise<Tick[]> {
  // Create pool contract instance
  const poolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI, provider);

  let initializedTicks: number[] = [];

  // Loop through each word position and fetch its bitmap data at the specified block number
  for (let wordPosition = MIN_WORD; wordPosition <= MAX_WORD; wordPosition++) {
    let data = await poolContract.tickBitmap(wordPosition, { blockTag: blockNumber });
    console.log(`Word Position: ${wordPosition}, Data:`, data.toString());

    // 解析位图，找到已初始化的 tick
    for (let i = 0; i < 256; i++) {
      if (data.and(ethers.BigNumber.from(1).shl(i)).gt(0)) {
        const tickIndex = (wordPosition * 256 + i) * TICK_SPACING;
        initializedTicks.push(tickIndex);
      }
    }
  }

  let ticks: Tick[] = [];

  // 查询所有已初始化的 ticks 数据
  for (let tickIndex of initializedTicks) {
    let data = await poolContract.ticks(tickIndex, { blockTag: blockNumber });
    console.log(`Tick Index: ${tickIndex}, Data:`, data);

    // 创建 Tick 实例并填充数据
    let tick = new Tick(tickIndex);
    tick._liquidityGross = JSBI.BigInt(data.liquidityGross.toString());
    tick._liquidityNet = JSBI.BigInt(data.liquidityNet.toString());
    tick._feeGrowthOutside0X128 = JSBI.BigInt(data.feeGrowthOutside0X128.toString());
    tick._feeGrowthOutside1X128 = JSBI.BigInt(data.feeGrowthOutside1X128.toString());

    ticks.push(tick);
  }

  return ticks;
}

// Function to save ticks data to a JSON file
function saveTicksToJson(ticks: Tick[], filename: string) {
  const tickViews = ticks.map(tick => ({
    tickIndex: tick.tickIndex,
    liquidityGross: tick.liquidityGross.toString(),
    liquidityNet: tick.liquidityNet.toString(),
    feeGrowthOutside0X128: tick.feeGrowthOutside0X128.toString(),
    feeGrowthOutside1X128: tick.feeGrowthOutside1X128.toString(),
  }));

  fs.writeFileSync(filename, JSON.stringify(tickViews, null, 2));
}

// 示例调用
const blockNumber = 19904930; // 替换为你想查询的块高度
const outputFilename = "ticks.json";

getAllInitializedTicks(blockNumber).then(ticks => {
  saveTicksToJson(ticks, outputFilename);
  console.log(`All ticks saved to ${outputFilename}`);
}).catch(error => {
  console.error('Error fetching ticks:', error);
});
