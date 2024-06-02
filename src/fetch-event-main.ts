import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";
import { MainnetDataDownloader } from "./client";
import { EventDataSourceType } from "./enum";
import now from 'performance-now';

const poolAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
const endBlock = 19980326; // Replace with actual end block
const batchSize = 1000; // Replace with the desired batch size
const numWorkers = 80;

if (!fs.existsSync('./logs/events')) {
  fs.mkdirSync('./logs/events', { recursive: true });
}

if (!fs.existsSync('./events')) {
  fs.mkdirSync('./events');
  fs.mkdirSync('./events/SWAP');
  fs.mkdirSync('./events/BURN');
  fs.mkdirSync('./events/MINT');
}

const formatDuration = (duration: number): string => {
  const milliseconds = Math.floor(duration % 1000);
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
  const days = Math.floor((duration / (1000 * 60 * 60 * 24)));

  const formattedMilliseconds = milliseconds.toString().padStart(3, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedDays = days.toString().padStart(2, '0');

  return `${formattedDays}D:${formattedHours}h:${formattedMinutes}m:${formattedSeconds}s.${formattedMilliseconds}ms`;
};

const initializeAndStartWorkers = async () => {
  const startTime = now();
  const downloader = new MainnetDataDownloader(undefined, EventDataSourceType.RPC);
  const startBlock = await downloader.queryInitializationBlockNumber(poolAddress);

  console.log(`Initialization block number for the pool: ${startBlock}`);

  const totalBlocks = endBlock - startBlock + 1;
  const taskQueue: { fromBlock: number, toBlock: number }[] = [];
  let currentBlock = startBlock;

  while (currentBlock <= endBlock) {
    const toBlock = Math.min(currentBlock + batchSize - 1, endBlock);
    taskQueue.push({ fromBlock: currentBlock, toBlock });
    currentBlock = toBlock + 1;
  }

  let processedBlockNum = 0

  const createWorker = (workerIndex: number) => {
    if (taskQueue.length === 0) return;

    const task = taskQueue.shift();
    if (!task) return;

    const workerData = {
      poolAddress,
      fromBlock: task.fromBlock,
      toBlock: task.toBlock,
      workerIndex,
      eventDataSourceType: EventDataSourceType.RPC,
    };

    const worker = new Worker(path.resolve(__dirname, 'fetch-event-worker.js'), { workerData });

    worker.on('message', (message) => {
      if (message.status === 'success') {
        const duration = message.duration;
        const formattedDuration = message.formattedDuration;
        processedBlockNum += (task.toBlock - task.fromBlock + 1)
        const fetchingPercent = (processedBlockNum / totalBlocks * 100).toFixed(2);
        const totalTimeUsed = now() - startTime;
        const formattedTotalTimeUsed = formatDuration(totalTimeUsed);
        const logMessage = `worker_${workerIndex} fetch events from ${task.fromBlock} to ${task.toBlock}, used ${formattedDuration}, fetching_percent: ${fetchingPercent}%, total_time_used: ${formattedTotalTimeUsed}`;

        console.log(logMessage);
        // fs.appendFileSync('./logs/events/fetchevents.log', `${logMessage}\n`);
      } else {
        const errorLogMessage = `worker_${workerIndex} encountered an error: ${message.error} from ${task.fromBlock} to ${task.toBlock}`;
        console.error(errorLogMessage);
        fs.appendFileSync('./logs/events/fetchevents_failed.log', `${errorLogMessage}\n`);
      }
      createWorker(workerIndex); // Start the next task
    });

    worker.on('error', (error) => {
      const errorLogMessage = `worker_${workerIndex} encountered an error: ${error.message} from ${task.fromBlock} to ${task.toBlock}`;
      console.error(errorLogMessage);
      fs.appendFileSync('./logs/events/fetchevents_failed.log', `${errorLogMessage}\n`);
      createWorker(workerIndex); // Start the next task even if an error occurs
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${workerData.workerIndex} stopped with exit code ${code}`);
      }
    });
  };

  // Initialize up to numWorkers concurrently
  for (let i = 0; i < numWorkers; i++) {
    createWorker(i);
  }
};

initializeAndStartWorkers();
