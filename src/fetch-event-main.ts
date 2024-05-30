import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";
import { MainnetDataDownloader } from "./client";
import { EventDataSourceType } from "./enum";

const poolAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
const endBlock = 19980326; // Replace with actual end block
const batchSize = 1000; // Replace with the desired batch size
const numWorkers = 8;

if (!fs.existsSync('./logs/events')) {
  fs.mkdirSync('./logs/events', { recursive: true });
}

if (!fs.existsSync('./events')) {
  fs.mkdirSync('./events');
}

const initializeAndStartWorkers = async () => {
  const downloader = new MainnetDataDownloader(undefined, EventDataSourceType.RPC);
  const startBlock = await downloader.queryInitializationBlockNumber(poolAddress);

  console.log(`Initialization block number for the pool: ${startBlock}`);

  const createWorker = (fromBlock: number, toBlock: number, workerIndex: number) => {
    const workerData = {
      poolAddress,
      fromBlock,
      toBlock,
      workerIndex,
    };

    const worker = new Worker(path.resolve(__dirname, 'worker.ts'), { workerData });

    worker.on('message', (message) => {
      if (message.status === 'success') {
        console.log(`Worker ${workerData.workerIndex} finished successfully. Log saved to ${message.logFilePath}`);
      } else {
        console.error(`Worker ${workerData.workerIndex} encountered an error: ${message.error}`);
      }
    });

    worker.on('error', (error) => {
      console.error(`Worker ${workerData.workerIndex} encountered an error: ${error.message}`);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${workerData.workerIndex} stopped with exit code ${code}`);
      }
    });
  };

  let currentBlock = startBlock;
  let workerIndex = 0;

  while (currentBlock <= endBlock) {
    const toBlock = Math.min(currentBlock + batchSize - 1, endBlock);
    createWorker(currentBlock, toBlock, workerIndex);
    currentBlock = toBlock + 1;
    workerIndex++;
  }
};

initializeAndStartWorkers();
