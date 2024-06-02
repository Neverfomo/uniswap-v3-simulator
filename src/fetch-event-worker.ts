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

  return `${formattedMinutes}m:${formattedSeconds}s:${formattedMilliseconds}ms`;
}

(async () => {
  try {
    const start = now();
    const eventTypes = [EventType.MINT, EventType.BURN, EventType.SWAP];
    let allEvents = [];

    for (const eventType of eventTypes) {
      let eventsData: any
      let cont = true
      while (cont) {
        try {
          eventsData = await downloader.fetchEventsDataFromRPC(
            workerData.poolAddress,
            eventType,
            workerData.fromBlock,
            workerData.toBlock
          );
          cont = false
        } catch (error) {
          // @ts-ignore
          parentPort?.postMessage({ status: 'error', error: error.message, fromBlock: workerData.fromBlock, toBlock: workerData.toBlock });
        }
      }

      allEvents.push(...eventsData); // Spread operator to merge arrays
      let eventTypeStr = ""
      if (eventType == 1) {
        eventTypeStr = "MINT"
      } else if (eventType == 2) {
        eventTypeStr = "BURN"
      } else {
        eventTypeStr = "SWAP"
      }

      // Save each event type to a separate file
      const filePath = `./events/${eventTypeStr}/events_${workerData.fromBlock}_${workerData.toBlock}_${eventTypeStr}.json`;
      fs.appendFileSync(filePath, JSON.stringify(eventsData, null, 2));

      const progressLogPath = `./logs/events/${eventTypeStr}_progress.log`
      fs.appendFileSync(progressLogPath, `${workerData.fromBlock}\n`);
    }

    const logData = {
      fromBlock: workerData.fromBlock,
      toBlock: workerData.toBlock,
      eventCount: allEvents.length,
    };

    const logFilePath = `./logs/events/worker_${workerData.workerIndex}.log`;
    fs.appendFileSync(logFilePath, JSON.stringify(logData, null, 2) + '\n');

    

    const end = now();
    const duration = end - start;
    const formattedDuration = formatDuration(duration);

    parentPort?.postMessage({ status: 'success', logFilePath, duration, formattedDuration });
  } catch (error) {
    // @ts-ignore
    parentPort?.postMessage({ status: 'error', error: error.message, fromBlock: workerData.fromBlock, toBlock: workerData.toBlock });
  }
})();
