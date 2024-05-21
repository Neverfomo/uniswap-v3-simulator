import { Worker } from "worker_threads";
import fs from "fs";
import path from "path";
import { Tick } from "./model/Tick"; // 导入你的 Tick 类
import { RPC_URL } from "./config";


// Replace with your pool address
const poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

// 定义最小和最大 tick 值
const MIN_TICK = -887272;
const MAX_TICK = 887272;

// 分块大小和线程数
const CHUNK_SIZE = 1000;
const MAX_THREADS = 4; // 设置最大并行线程数

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
  console.log(`Data saved to ${filename}`);
}

// 创建工作线程来处理每个块
function createWorker(chunkStart: number, chunkEnd: number, blockNumber: number, workerId: number): Promise<Tick[]> {
  const logFile = fs.createWriteStream(`worker_${workerId}.log`, { flags: 'a' });
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, "./worker.js"), {
      workerData: {
        poolAddress,
        chunkStart,
        chunkEnd,
        blockNumber,
        RPC_URL,
        logFilePath: `worker_${workerId}.log`
      }
    });

    worker.on("message", (ticks: Tick[]) => resolve(ticks));
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
      logFile.close();
    });
  });
}

// 主函数，分块遍历并使用多线程获取 tick 信息
async function getAllTicks(blockNumber: number): Promise<Tick[]> {
  let promises: Promise<Tick[]>[] = [];
  let results: Tick[] = [];

  // 创建一个工作队列
  const queue: { start: number; end: number }[] = [];
  for (let i = MIN_TICK; i <= MAX_TICK; i += CHUNK_SIZE) {
    const chunkStart = i;
    const chunkEnd = Math.min(i + CHUNK_SIZE - 1, MAX_TICK);
    queue.push({ start: chunkStart, end: chunkEnd });
  }

  console.log(`Queue length: ${queue.length}`);

  // 处理队列，控制并行线程数
  async function processQueue(workerId: number) {
    while (queue.length > 0) {
      const { start, end } = queue.shift()!;
      console.log(`Worker ${workerId} processing chunk from ${start} to ${end}`);
      await createWorker(start, end, blockNumber, workerId)
        .then((ticks) => {
          results = results.concat(ticks);
        })
        .catch((error) => {
          console.error(`Error processing chunk ${start} to ${end}:`, error);
        });
    }
  }

  // 创建并启动线程
  for (let i = 0; i < MAX_THREADS; i++) {
    promises.push(processQueue(i).then(() => [])); // 确保返回 Promise<void> 转为 Promise<Tick[]>
  }

  await Promise.all(promises);

  return results;
}

// 示例调用
const blockNumber = 19905067; // 替换为你想查询的块高度
const outputFilename = "ticks.json";

getAllTicks(blockNumber).then(ticks => {
  saveTicksToJson(ticks, outputFilename);
  console.log(`All ticks saved to ${outputFilename}`);
}).catch(error => {
  console.error('Error fetching ticks:', error);
});
