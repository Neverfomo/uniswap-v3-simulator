import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { MainnetDataDownloader } from "./client";
import { EventType } from "./enum";
import now from 'performance-now';


const downloader = new MainnetDataDownloader(undefined, workerData.eventDataSourceType);

const label = `Fetch events from ${workerData.fromBlock} to ${workerData.toBlock}`;

function formatDuration(duration: number): string {
  const milliseconds = Math.floor(duration % 1000);
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);

  const formattedMilliseconds = milliseconds.toString().padStart(3, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return `${formattedMinutes}:${formattedSeconds}:${formattedMilliseconds}`;
}

(async () => {
  try {
    const start = now();
    const eventTypes = [EventType.MINT, EventType.BURN, EventType.SWAP];
    let allEvents = [];

    for (const eventType of eventTypes) {
      const eventsData = await downloader.fetchEventsDataFromRPC(
        workerData.poolAddress,
        eventType,
        workerData.fromBlock,
        workerData.toBlock
      );

      allEvents.push(eventsData)
    }

    const filePath = `./events/events_${workerData.fromBlock}_${workerData.toBlock}.json`;
    fs.writeFileSync(filePath, JSON.stringify(allEvents, null, 2));

    const logData = {
      fromBlock: workerData.fromBlock,
      toBlock: workerData.toBlock,
      eventCount: allEvents.length,
      filePath,
    };

    const logFilePath = `./logs/events/worker_${workerData.workerIndex}.log`;
    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

    parentPort?.postMessage({ status: 'success', logFilePath });
    const end = now();
    const duration = end - start;
    const formattedDuration = formatDuration(duration);
    fs.writeFileSync(logFilePath, `${label}: ${formattedDuration}`)
  } catch (error) {
    // @ts-ignore
    parentPort?.postMessage({ status: 'error', error: error.message, fromBlock: workerData.fromBlock, toBlock: workerData.toBlock });
  }
})();
