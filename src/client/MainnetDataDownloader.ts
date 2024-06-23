import { EventType } from "../enum/EventType";
import { EventDBManager } from "../manager/EventDBManager";
import { ethers, providers } from "ethers";
import { UniswapV3Pool2__factory as UniswapV3PoolFactory } from "../typechain/factories/UniswapV3Pool2__factory";
import { UniswapV3Pool2 as UniswapV3Pool } from "../typechain/UniswapV3Pool2";
import {
  ConfigurableCorePool,
  PoolConfig,
  exists,
  getDatabaseNameFromPath,
} from "..";
import { LiquidityEvent } from "../entity/LiquidityEvent";
import { SwapEvent } from "../entity/SwapEvent";
import { SQLiteSimulationDataManager } from "../manager/SQLiteSimulationDataManager";
import { SimulationDataManager } from "../interface/SimulationDataManager";
import { printParams } from "../util/Serializer";
import JSBI from "jsbi";
import { UNISWAP_V3_SUBGRAPH_ENDPOINT, ZERO } from "../enum/InternalConstants";
import { EventDataSourceType } from "../enum/EventDataSourceType";
import { PoolState } from "../model/PoolState";
import { ConfigurableCorePool as ConfigurableCorePoolImpl } from "../core/ConfigurableCorePool";
import { SimulatorConsoleVisitor } from "../manager/SimulatorConsoleVisitor";
import { SimulatorPersistenceVisitor } from "../manager/SimulatorPersistenceVisitor";
import { SimulatorRoadmapManager } from "../manager/SimulatorRoadmapManager";
import {
  EndBlockTypeWhenInit,
  EndBlockTypeWhenRecover,
} from "../entity/EndBlockType";
import { loadConfig } from "../config/TunerConfig";
import { request, gql } from "graphql-request";
import { convertTokenStrFromDecimal } from "../util/BNUtils";
import { LiquidityEventData, SwapEventData } from "../entity/EventData";
import * as fs from 'fs';
import * as path from 'path';

export class MainnetDataDownloader {
  // @ts-ignore
  private IPCProvider: providers.IpcProvider;
  // @ts-ignore
  private RPCProvider: providers.JsonRpcProvider;
  // @ts-ignore
  private privateRPCProvider: providers.JsonRpcProvider;

  private eventDataSourceType: EventDataSourceType;

  private providerForFetchingEvents: providers.JsonRpcProvider;

  constructor(
    RPCProviderUrl: string | undefined,
    eventDataSourceType: EventDataSourceType
  ) {
    let tunerConfig = loadConfig(undefined);
    if (RPCProviderUrl == undefined) {
      RPCProviderUrl = tunerConfig.RPCProviderUrl;
    }
    let privateRPCProviderUrl = tunerConfig.PrivateRPCProviderUrl;
    this.RPCProvider = new providers.JsonRpcProvider(RPCProviderUrl);
    let providerType = tunerConfig.providerToBeUsed;
    // console.log(`Using ${providerType} provider to fetch events.`)
    if (providerType == 'privateRpc') {
      this.privateRPCProvider = new providers.JsonRpcProvider(privateRPCProviderUrl);
      this.providerForFetchingEvents = this.privateRPCProvider;
    } else if (providerType == 'privateIpc') {
      this.IPCProvider = new providers.IpcProvider(tunerConfig.IPCProviderUrl)
      this.providerForFetchingEvents = this.IPCProvider;
    } else {
      this.providerForFetchingEvents = this.RPCProvider;
    }
    
    this.eventDataSourceType = eventDataSourceType;
  }

  async queryDeploymentBlockNumber(poolAddress: string): Promise<number> {
    // TODO how to know accurate block number on contract deployment?
    // Maybe use etherscan API or scan back mainnet trxs through the first event the contract emitted.
    // BTW, for most cases, it's the same as Initialization event block number. Let's take this now.
    return this.queryInitializationBlockNumber(poolAddress);
  }

  async queryInitializationBlockNumber(poolAddress: string): Promise<number> {
    let uniswapV3Pool = await this.getCorePoolContarct(poolAddress);
    let initializeTopic = uniswapV3Pool.filters.Initialize();
    let initializationEvent = await uniswapV3Pool.queryFilter(initializeTopic);
    return initializationEvent[0].blockNumber;
  }

  async parseEndBlockTypeWhenInit(
    toBlock: EndBlockTypeWhenInit,
    poolAddress: string
  ): Promise<number> {
    switch (toBlock) {
      case "latest":
        return (await this.RPCProvider.getBlock("latest")).number;
      case "afterDeployment":
        return await this.queryDeploymentBlockNumber(poolAddress);
      case "afterInitialization":
        return await this.queryInitializationBlockNumber(poolAddress);
      default:
        let latestOnChain = (await this.RPCProvider.getBlock("latest")).number;
        return toBlock > latestOnChain ? latestOnChain : toBlock;
    }
  }

  async parseEndBlockTypeWhenRecover(
    latestDownloadedEventBlockNumber: number,
    toBlock: EndBlockTypeWhenRecover,
    poolAddress: string
  ): Promise<number> {
    switch (toBlock) {
      case "latestOnChain":
        return (await this.RPCProvider.getBlock("latest")).number;
      case "latestDownloaded":
        return latestDownloadedEventBlockNumber;
      case "afterDeployment":
        return await this.queryDeploymentBlockNumber(poolAddress);
      case "afterInitialization":
        return await this.queryInitializationBlockNumber(poolAddress);
      default:
        let latestOnChain = (await this.RPCProvider.getBlock("latest")).number;
        return toBlock > latestOnChain ? latestOnChain : toBlock;
    }
  }

  generateMainnetEventDBFilePath(
    poolName: string,
    poolAddress: string
  ): string {
    return `${poolName}_${poolAddress}.db`;
  }

  parseFromMainnetEventDBFilePath(filePath: string): {
    poolName: string;
    poolAddress: string;
  } {
    let databaseName = getDatabaseNameFromPath(filePath, ".db");
    let nameArr = databaseName.split("_");
    return { poolName: nameArr[0], poolAddress: nameArr[1] };
  }

  async download(
    poolName: string = "",
    poolAddress: string,
    toBlock: EndBlockTypeWhenInit,
    batchSize: number = 5000
  ) {
    // check toBlock first
    let toBlockAsNumber = await this.parseEndBlockTypeWhenInit(
      toBlock,
      poolAddress
    );

    let uniswapV3Pool = await this.getCorePoolContarct(poolAddress);
    let deploymentBlockNumber = await this.queryDeploymentBlockNumber(
      poolAddress
    );
    if (toBlockAsNumber < deploymentBlockNumber)
      throw new Error(
        `The pool does not exist at block height: ${toBlockAsNumber}, it was deployed at block height: ${deploymentBlockNumber}`
      );
    
    console.log(`toBlockAsNumber ${toBlockAsNumber}, deploymentBlockNumber ${deploymentBlockNumber}`)

    let initializeTopic = uniswapV3Pool.filters.Initialize();
    let initializationEvent = await uniswapV3Pool.queryFilter(initializeTopic);
    let initializationSqrtPriceX96 = initializationEvent[0].args.sqrtPriceX96;
    let initializationEventBlockNumber = initializationEvent[0].blockNumber;

    // check db file then
    let filePath = this.generateMainnetEventDBFilePath(poolName, poolAddress);
    if (exists(filePath))
      throw new Error(
        `The database file: ${filePath} already exists. You can either try to update or delete the database file.`
      );

    let eventDB = await EventDBManager.buildInstance(filePath);
    try {
      // query and record poolConfig
      let poolConfig = new PoolConfig(
        await uniswapV3Pool.tickSpacing(),
        await uniswapV3Pool.token0(),
        await uniswapV3Pool.token1(),
        await uniswapV3Pool.fee()
      );
      await eventDB.addPoolConfig(poolConfig);
      await eventDB.saveLatestEventBlockNumber(deploymentBlockNumber);

      if (toBlock === "afterDeployment") return;

      // record initialize event
      await eventDB.addInitialSqrtPriceX96(
        initializationSqrtPriceX96.toString()
      );
      await eventDB.saveInitializationEventBlockNumber(
        initializationEventBlockNumber
      );
      await eventDB.saveLatestEventBlockNumber(initializationEventBlockNumber);

      if (toBlock === "afterInitialization") return;

      let uniswapV3PoolForFetchingEvents = await this.getCorePoolContarctByProvider(poolAddress, this.providerForFetchingEvents);

      // download events after initialization
      if (this.eventDataSourceType === EventDataSourceType.SUBGRAPH) {
        await this.downloadEventsFromSubgraph(
          poolAddress.toLowerCase(),
          await this.getTokenDecimals(poolConfig!.token0),
          await this.getTokenDecimals(poolConfig!.token1),
          eventDB,
          initializationEventBlockNumber,
          toBlockAsNumber,
          batchSize
        );
      } else if (this.eventDataSourceType === EventDataSourceType.RPC) {
        await this.downloadEventsFromRPC(
          uniswapV3PoolForFetchingEvents,
          eventDB,
          initializationEventBlockNumber,
          toBlockAsNumber,
          batchSize
        );
      }
      await this.preProcessSwapEvent(eventDB);
    } finally {
      await eventDB.close();
    }
  }

  async update(
    mainnetEventDBFilePath: string,
    toBlock: EndBlockTypeWhenRecover,
    batchSize: number = 1000
  ) {
    // check dbfile first
    let { poolAddress } = this.parseFromMainnetEventDBFilePath(
      mainnetEventDBFilePath
    );
    if (!exists(mainnetEventDBFilePath))
      throw new Error(
        `The database file: ${mainnetEventDBFilePath} does not exist. Please download the data first.`
      );

    // check toBlock then
    let eventDB = await EventDBManager.buildInstance(mainnetEventDBFilePath);
    try {
      let latestEventBlockNumber = await eventDB.getLatestEventBlockNumber();
      console.log(latestEventBlockNumber)
      let deploymentBlockNumber = await this.queryDeploymentBlockNumber(
        poolAddress
      );
      console.log(deploymentBlockNumber)
      let toBlockAsNumber = await this.parseEndBlockTypeWhenRecover(
        latestEventBlockNumber,
        toBlock,
        poolAddress
      );
      if (toBlockAsNumber < deploymentBlockNumber)
        throw new Error("toBlock is too small, the pool hasn't been deployed.");

      if (toBlockAsNumber < latestEventBlockNumber) {
        console.log("It's already up to date.");
        return;
      }

      let uniswapV3Pool = await this.getCorePoolContarct(poolAddress);

      // check and record initialize event if needed
      let updateInitializationEvent = false;
      let initializationEventBlockNumber =
        await eventDB.getInitializationEventBlockNumber();
      if (0 == initializationEventBlockNumber) {
        updateInitializationEvent = true;
        let initializeTopic = uniswapV3Pool.filters.Initialize();
        let initializationEvent = await uniswapV3Pool.queryFilter(
          initializeTopic
        );
        await eventDB.addInitialSqrtPriceX96(
          initializationEvent[0].args.sqrtPriceX96.toString()
        );
        initializationEventBlockNumber = initializationEvent[0].blockNumber;
        await eventDB.saveInitializationEventBlockNumber(
          initializationEventBlockNumber
        );
        await eventDB.saveLatestEventBlockNumber(
          initializationEventBlockNumber
        );
      }

      if (
        !updateInitializationEvent &&
        toBlockAsNumber == latestEventBlockNumber
      ) {
        console.log("It's already up to date.");
        return;
      }

      let fromBlockAsNumber = updateInitializationEvent
        ? initializationEventBlockNumber
        : latestEventBlockNumber + 1;

      // remove incomplete events
      await eventDB.deleteLiquidityEventsByBlockNumber(
        EventType.MINT,
        fromBlockAsNumber,
        toBlockAsNumber
      );
      await eventDB.deleteLiquidityEventsByBlockNumber(
        EventType.BURN,
        fromBlockAsNumber,
        toBlockAsNumber
      );
      await eventDB.deleteSwapEventsByBlockNumber(
        fromBlockAsNumber,
        toBlockAsNumber
      );

      // download events after initialization
      let poolConfig = await eventDB.getPoolConfig();

      if (this.eventDataSourceType === EventDataSourceType.SUBGRAPH) {
        await this.downloadEventsFromSubgraph(
          poolAddress.toLowerCase(),
          await this.getTokenDecimals(poolConfig!.token0),
          await this.getTokenDecimals(poolConfig!.token1),
          eventDB,
          fromBlockAsNumber,
          toBlockAsNumber,
          batchSize
        );
      } else if (this.eventDataSourceType === EventDataSourceType.RPC) {
        await this.downloadEventsFromRPC(
          uniswapV3Pool,
          eventDB,
          fromBlockAsNumber,
          toBlockAsNumber,
          batchSize
        );
      }

      // await this.preProcessSwapEvent(eventDB);
    } finally {
      await eventDB.close();
    }
  }

  private async getTokenDecimals(token: string): Promise<number> {
    const query = gql`
    query {
      token(id:"${token.toLowerCase()}"){
        decimals
      }
    }
  `;
    let data = await request(UNISWAP_V3_SUBGRAPH_ENDPOINT, query);
    return data.token.decimals;
  }

  async initializeAndReplayEvents(
    eventDB: EventDBManager,
    configurableCorePool: ConfigurableCorePool,
    endBlock: number,
    onlyInitialize: boolean = false
  ): Promise<ConfigurableCorePool> {
    let initializationEventBlockNumber =
      await eventDB.getInitializationEventBlockNumber();

    let initialSqrtPriceX96 = await eventDB.getInitialSqrtPriceX96();
    await configurableCorePool.initialize(initialSqrtPriceX96);

    if (onlyInitialize) return configurableCorePool;

    // replay events to find swap input param we need
    let startBlock = initializationEventBlockNumber;
    let currBlock = startBlock;
    let lastSnapshotBlockNumber = initializationEventBlockNumber

    while (currBlock <= endBlock) {
      let nextEndBlock =
        this.nextBatch(currBlock) > endBlock
          ? endBlock
          : this.nextBatch(currBlock);
      // console.log(`Replay events from ${currBlock} to ${nextEndBlock}`)
      console.time(`Replay events from ${currBlock} to ${nextEndBlock}`)
      let events = await this.getAndSortEventByBlock(
        eventDB,
        currBlock,
        nextEndBlock
      );
      if (events.length > 0) {
        await this.replayEventsAndAssertReturnValues(
          eventDB,
          configurableCorePool,
          events,
          currBlock
        );
      }
      
      // let diff = currBlock - lastSnapshotBlockNumber
      // if (diff > 1000000) {
      //   configurableCorePool.takeSnapshot("")
      //   lastSnapshotBlockNumber = currBlock
      //   console.log(`Took snapshot at ${currBlock}`)
      // }
      events = []
      console.timeEnd(`Replay events from ${currBlock} to ${nextEndBlock}`)
      currBlock = nextEndBlock + 1;
    }
    return configurableCorePool;
  }

  private async downloadEventsFromSubgraph(
    poolAddress: string,
    token0Decimals: number,
    token1Decimals: number,
    eventDB: EventDBManager,
    fromBlock: number,
    toBlock: number,
    batchSize: number
  ) {
    while (fromBlock <= toBlock) {
      let endBlock =
        fromBlock + batchSize > toBlock ? toBlock : fromBlock + batchSize;
      console.log(`Fetching from block ${fromBlock} to block ${endBlock}`)
      let latestEventBlockNumber = Math.max(
        await this.saveEventsFromSubgraph(
          poolAddress,
          token0Decimals,
          token1Decimals,
          eventDB,
          EventType.MINT,
          fromBlock,
          endBlock
        ),
        await this.saveEventsFromSubgraph(
          poolAddress,
          token0Decimals,
          token1Decimals,
          eventDB,
          EventType.BURN,
          fromBlock,
          endBlock
        ),
        await this.saveEventsFromSubgraph(
          poolAddress,
          token0Decimals,
          token1Decimals,
          eventDB,
          EventType.SWAP,
          fromBlock,
          endBlock
        )
      );
      await eventDB.saveLatestEventBlockNumber(latestEventBlockNumber);
      fromBlock += batchSize + 1;
    }
    console.log(
      "Events have been downloaded successfully. Please wait for pre-process to be done..."
    );
  }

  private async downloadEventsFromRPC(
    uniswapV3Pool: UniswapV3Pool,
    eventDB: EventDBManager,
    fromBlock: number,
    toBlock: number,
    batchSize: number
  ) {
    while (fromBlock <= toBlock) {
      let endBlock =
        fromBlock + batchSize > toBlock ? toBlock : fromBlock + batchSize;
      console.time(`Fetch events from ${fromBlock} to ${endBlock}`)
      let latestEventBlockNumber = Math.max(
        await this.saveEventsFromRPC(
          uniswapV3Pool,
          eventDB,
          EventType.MINT,
          fromBlock,
          endBlock
        ),
        await this.saveEventsFromRPC(
          uniswapV3Pool,
          eventDB,
          EventType.BURN,
          fromBlock,
          endBlock
        ),
        await this.saveEventsFromRPC(
          uniswapV3Pool,
          eventDB,
          EventType.SWAP,
          fromBlock,
          endBlock
        )
      );
      await eventDB.saveLatestEventBlockNumber(latestEventBlockNumber);
      console.timeEnd(`Fetch events from ${fromBlock} to ${endBlock}`)
      fromBlock += batchSize + 1;
    }
    console.log(
      "Events have been downloaded successfully. Please wait for pre-process to be done..."
    );
  }

  private async saveEventsFromSubgraph(
    poolAddress: string,
    token0Decimals: number,
    token1Decimals: number,
    eventDB: EventDBManager,
    eventType: EventType,
    fromBlock: number,
    toBlock: number
  ): Promise<number> {
    let fromTimestamp = (await this.RPCProvider.getBlock(fromBlock)).timestamp;
    let toTimestamp = (await this.RPCProvider.getBlock(toBlock)).timestamp;
    let latestEventBlockNumber = fromBlock;
    let skip = 0;
    let eventTypeStr = ''
    if (eventType == EventType.MINT) {
      eventTypeStr = 'MINT'
    } else if (eventType == EventType.BURN) {
      eventTypeStr = 'BURN'
    } else if (eventType == EventType.SWAP) {
      eventTypeStr = 'SWAP'
    } else {
      eventTypeStr = 'UNKNOWN'
    }
    while (true) {
      if (eventType === EventType.MINT) {
        const query = gql`
        query {
          pool(id: "${poolAddress}") {
            mints(
              first: 1000
              skip: ${skip}
              where: { timestamp_gte: ${fromTimestamp}, timestamp_lte: ${toTimestamp} }
              orderBy: timestamp
              orderDirection: asc
            ) {
              sender
              owner
              amount
              amount0
              amount1
              tickLower
              tickUpper
              transaction {
                blockNumber
              }
              logIndex
              timestamp
            }
          }
        }
      `;

        let data = await request(UNISWAP_V3_SUBGRAPH_ENDPOINT, query);
        console.log(`Query ${eventTypeStr} items ${skip + 1000}`)
        let events = data.pool.mints;

        for (let event of events) {
          let date = new Date(event.timestamp * 1000);
          await eventDB.insertLiquidityEvent(
            eventType,
            event.sender,
            event.owner,
            event.amount.toString(),
            convertTokenStrFromDecimal(
              event.amount0.toString(),
              token0Decimals
            ),
            convertTokenStrFromDecimal(
              event.amount1.toString(),
              token1Decimals
            ),
            event.tickLower,
            event.tickUpper,
            event.transaction.blockNumber,
            0,
            event.logIndex,
            date
          );
          latestEventBlockNumber = event.transaction.blockNumber;
        }
        if (events.length < 1000) {
          break;
        } else {
          skip += 1000;
        }
      } else if (eventType === EventType.BURN) {
        const query = gql`
        query {
          pool(id: "${poolAddress}") {
            burns(
              first: 1000
              skip: ${skip}
              where: { timestamp_gte: ${fromTimestamp}, timestamp_lte: ${toTimestamp} }
              orderBy: timestamp
              orderDirection: asc
            ) {
              owner
              amount
              amount0
              amount1
              tickLower
              tickUpper
              transaction {
                blockNumber
              }
              logIndex
              timestamp
            }
          }
        }
      `;

        let data = await request(UNISWAP_V3_SUBGRAPH_ENDPOINT, query);
        console.log(`Query ${eventTypeStr} items ${skip + 1000}`)
        let events = data.pool.burns;

        for (let event of events) {
          let date = new Date(event.timestamp * 1000);
          await eventDB.insertLiquidityEvent(
            eventType,
            event.owner,
            "",
            event.amount.toString(),
            convertTokenStrFromDecimal(
              event.amount0.toString(),
              token0Decimals
            ),
            convertTokenStrFromDecimal(
              event.amount1.toString(),
              token1Decimals
            ),
            event.tickLower,
            event.tickUpper,
            event.transaction.blockNumber,
            0,
            event.logIndex,
            date
          );
          latestEventBlockNumber = event.transaction.blockNumber;
        }
        if (events.length < 1000) {
          break;
        } else {
          skip += 1000;
        }
      } else if (eventType === EventType.SWAP) {
        const query = gql`
          query {
            pool(id: "${poolAddress}") {
              swaps(
                first: 1000
                skip: ${skip}
                where: { timestamp_gte: ${fromTimestamp}, timestamp_lte: ${toTimestamp} }
                orderBy: timestamp
                orderDirection: asc
              ) {
                sender
                recipient
                amount0
                amount1
                sqrtPriceX96
                tick
                transaction {
                  blockNumber
                }
                logIndex
                timestamp
              }
            }
          }
        `;

        let data = await request(UNISWAP_V3_SUBGRAPH_ENDPOINT, query);
        console.log(`Query ${eventTypeStr} items ${skip + 1000}`)
        let events = data.pool.swaps;
        for (let event of events) {
          let date = new Date(event.timestamp * 1000);
          await eventDB.insertSwapEvent(
            event.sender,
            event.recipient,
            convertTokenStrFromDecimal(
              event.amount0.toString(),
              token0Decimals
            ),
            convertTokenStrFromDecimal(
              event.amount1.toString(),
              token1Decimals
            ),
            event.sqrtPriceX96.toString(),
            "-1",
            event.tick,
            event.transaction.blockNumber,
            0,
            event.logIndex,
            date
          );
          latestEventBlockNumber = event.transaction.blockNumber;
        }
        if (events.length < 1000) {
          break;
        } else {
          skip += 1000;
        }
      }
    }
    return latestEventBlockNumber;
  }

  private async saveEventsFromRPC(
    uniswapV3Pool: UniswapV3Pool,
    eventDB: EventDBManager,
    eventType: EventType,
    fromBlock: number,
    toBlock: number
  ): Promise<number> {
    let latestEventBlockNumber = fromBlock;
    if (eventType === EventType.MINT) {
      let topic = uniswapV3Pool.filters.Mint();
      console.log(`fetching MINT from ${fromBlock} to ${toBlock}`)
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.RPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        await eventDB.insertLiquidityEvent(
          eventType,
          event.args.sender,
          event.args.owner,
          event.args.amount.toString(),
          event.args.amount0.toString(),
          event.args.amount1.toString(),
          event.args.tickLower,
          event.args.tickUpper,
          event.blockNumber,
          event.transactionIndex,
          event.logIndex,
          date
        );
        if (event.blockNumber > latestEventBlockNumber)
          latestEventBlockNumber = event.blockNumber;
      }
    } else if (eventType === EventType.BURN) {
      let topic = uniswapV3Pool.filters.Burn();
      console.log(`fetching BURN from ${fromBlock} to ${toBlock}`)
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.RPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        await eventDB.insertLiquidityEvent(
          eventType,
          event.args.owner,
          "",
          event.args.amount.toString(),
          event.args.amount0.toString(),
          event.args.amount1.toString(),
          event.args.tickLower,
          event.args.tickUpper,
          event.blockNumber,
          event.transactionIndex,
          event.logIndex,
          date
        );
        if (event.blockNumber > latestEventBlockNumber)
          latestEventBlockNumber = event.blockNumber;
      }
    } else if (eventType === EventType.SWAP) {
      let topic = uniswapV3Pool.filters.Swap();
      console.log(`fetching SWAP from ${fromBlock} to ${toBlock}`)
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.RPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        await eventDB.insertSwapEvent(
          event.args.sender,
          event.args.recipient,
          event.args.amount0.toString(),
          event.args.amount1.toString(),
          event.args.sqrtPriceX96.toString(),
          event.args.liquidity.toString(),
          event.args.tick,
          event.blockNumber,
          event.transactionIndex,
          event.logIndex,
          date
        );
        if (event.blockNumber > latestEventBlockNumber)
          latestEventBlockNumber = event.blockNumber;
      }
    }
    return latestEventBlockNumber;
  }

  async fetchEventsDataFromRPC(
    poolAddress: string,
    eventType: EventType,
    fromBlock: number,
    toBlock: number
  ): Promise<any> {
    let eventsData: any[] = []
    let uniswapV3Pool = await this.getCorePoolContarctByProvider(poolAddress, this.providerForFetchingEvents);
    if (eventType === EventType.MINT) {
      let topic = uniswapV3Pool.filters.Mint();
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.privateRPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        let data: LiquidityEventData = {
          type: eventType,
          msg_sender: event.args.sender,
          recipient: event.args.owner,
          liquidity: event.args.amount.toString(),
          amount0: event.args.amount0.toString(),
          amount1: event.args.amount1.toString(),
          tick_lower: event.args.tickLower,
          tick_upper: event.args.tickUpper,
          block_number: event.blockNumber,
          transaction_index: event.transactionIndex,
          log_index: event.logIndex,
          date: date,
          timestamp: block.timestamp
        }
        eventsData.push(data)
      }
    } else if (eventType === EventType.BURN) {
      let topic = uniswapV3Pool.filters.Burn();
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.privateRPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        let data: LiquidityEventData = {
          type: eventType,
          msg_sender: event.args.owner,
          recipient: "",
          liquidity: event.args.amount.toString(),
          amount0: event.args.amount0.toString(),
          amount1: event.args.amount1.toString(),
          tick_lower: event.args.tickLower,
          tick_upper: event.args.tickUpper,
          block_number: event.blockNumber,
          transaction_index: event.transactionIndex,
          log_index: event.logIndex,
          date: date,
          timestamp: block.timestamp
        }
        eventsData.push(data)
      }
    } else if (eventType === EventType.SWAP) {
      let topic = uniswapV3Pool.filters.Swap();
      let events = await uniswapV3Pool.queryFilter(topic, fromBlock, toBlock);
      for (let event of events) {
        let block = await this.privateRPCProvider.getBlock(event.blockNumber);
        let date = new Date(block.timestamp * 1000);
        let data: SwapEventData = {
          msg_sender: event.args.sender,
          recipient: event.args.recipient,
          amount0: event.args.amount0.toString(),
          amount1: event.args.amount1.toString(),
          sqrt_price_x96: event.args.sqrtPriceX96.toString(),
          liquidity: event.args.liquidity.toString(),
          tick:event.args.tick,
          block_number: event.blockNumber,
          transaction_index: event.transactionIndex,
          log_index: event.logIndex,
          date: date,
          timestamp: block.timestamp
        }
        eventsData.push(data)
      }
    }
    return eventsData;
  }

  private async preProcessSwapEvent(eventDB: EventDBManager) {
    // initialize configurableCorePool
    let simulatorDBManager: SimulationDataManager =
      await SQLiteSimulationDataManager.buildInstance(`simulation-data-manager-${await (eventDB.getLatestEventBlockNumber())}`);
    let poolConfig = await eventDB.getPoolConfig();
    let configurableCorePool: ConfigurableCorePool =
      new ConfigurableCorePoolImpl(
        new PoolState(poolConfig),
        new SimulatorRoadmapManager(simulatorDBManager),
        new SimulatorConsoleVisitor(),
        new SimulatorPersistenceVisitor(simulatorDBManager)
      );
    await this.initializeAndReplayEvents(
      eventDB,
      configurableCorePool,
      await eventDB.getLatestEventBlockNumber()
    );
    configurableCorePool.takeSnapshot(`${await eventDB.getLatestEventBlockNumber()}`)
    configurableCorePool.persistSnapshot()
    await simulatorDBManager.close();
    console.log("Events have been pre-processed successfully.");
  }

  private nextBatch(currBlock: number) {
    // we take a day as step length, consider block interval as 40s then 24 * 60 * 60 / 40 = 2160
    return currBlock + 2160;
  }

  private async getCorePoolContarct(
    poolAddress: string
  ): Promise<UniswapV3Pool> {
    return UniswapV3PoolFactory.connect(poolAddress, this.RPCProvider);
  }

  private async getCorePoolContarctByProvider(
    poolAddress: string,
    provider: ethers.providers.JsonRpcProvider
  ): Promise<UniswapV3Pool> {
    return UniswapV3PoolFactory.connect(poolAddress, provider);
  }

  private async getAndSortEventByBlock(
    eventDB: EventDBManager,
    startBlock: number,
    endBlock: number
  ): Promise<(LiquidityEvent | SwapEvent)[]> {
    let events: (LiquidityEvent | SwapEvent)[] = [];
    let mintEvents: LiquidityEvent[] =
      await eventDB.getLiquidityEventsByBlockNumber(
        EventType.MINT,
        startBlock,
        endBlock
      );
    // console.log(`${startBlock}-${endBlock} MINT events num ${mintEvents.length}`)
    let burnEvents: LiquidityEvent[] =
      await eventDB.getLiquidityEventsByBlockNumber(
        EventType.BURN,
        startBlock,
        endBlock
      );
    // console.log(`${startBlock}-${endBlock} BURN events num ${mintEvents.length}`)
    let swapEvents: SwapEvent[] = await eventDB.getSwapEventsByBlockNumber(
      startBlock,
      endBlock
    );
    // console.log(`${startBlock}-${endBlock} SWAP events num ${mintEvents.length}`)
    events.push(...mintEvents);
    events.push(...burnEvents);
    events.push(...swapEvents);
    events.sort(function (a, b) {
      return a.blockNumber == b.blockNumber
        ? a.logIndex - b.logIndex
        : a.blockNumber - b.blockNumber;
    });
    return events;
  }

  private async replayEventsAndAssertReturnValues(
    eventDB: EventDBManager,
    configurableCorePool: ConfigurableCorePool,
    paramArr: (LiquidityEvent | SwapEvent)[],
    fromBlockNumber: number
  ): Promise<void> {
    for (let index = 0; index < paramArr.length; index++) {
      // avoid stack overflow
      if (fromBlockNumber >= 18580000 && index % 4000 == 0) {
        configurableCorePool.takeSnapshot("");
        // configurableCorePool.clearPoolStates()
      }

      let param = paramArr[index];
      let amount0: JSBI, amount1: JSBI;
      switch (param.type) {
        case EventType.MINT:
          ({ amount0, amount1 } = await configurableCorePool.mint(
            param.recipient,
            param.tickLower,
            param.tickUpper,
            param.liquidity
          ));
          if (
            JSBI.notEqual(amount0, param.amount0) ||
            JSBI.notEqual(amount1, param.amount1)
          )
            throw new Error(
              `Mint failed. Event index: ${index}. Event: ${printParams(
                param
              )}.`
            );
          break;
        case EventType.BURN:
          ({ amount0, amount1 } = await configurableCorePool.burn(
            param.msgSender,
            param.tickLower,
            param.tickUpper,
            param.liquidity
          ));
          if (
            JSBI.notEqual(amount0, param.amount0) ||
            JSBI.notEqual(amount1, param.amount1)
          )
            throw new Error(
              `Mint failed. Event index: ${index}. Event: ${printParams(
                param
              )}.`
            );
          break;
        case EventType.SWAP:
          // try-error to find `amountSpecified` and `sqrtPriceLimitX96` to resolve to the same result as swap event records
          try {
            let { amountSpecified, sqrtPriceX96 } =
              await configurableCorePool.resolveInputFromSwapResultEvent(param);

            let zeroForOne: boolean = JSBI.greaterThan(param.amount0, ZERO)
              ? true
              : false;
            await configurableCorePool.swap(
              zeroForOne,
              amountSpecified,
              sqrtPriceX96
            );
            // add AmountSpecified column to swap event if we need to
            if (ZERO == param.amountSpecified) {
              await eventDB.addAmountSpecified(
                param.id,
                amountSpecified.toString()
              );
            }
          } catch (error) {
            return Promise.reject(
              `Swap failed. Event index: ${index}. Event: ${printParams(
                param
              )}.`
            );
          }
          break;
        default:
          // @ts-ignore: ExhaustiveCheck
          const exhaustiveCheck: never = param;
      }
    }
  }

  getCurrentFormattedDateTime(): string {
    const now = new Date();
  
    const pad = (num: number) => num.toString().padStart(2, '0');
    
    const month = pad(now.getMonth() + 1); // 月份从0开始，所以要加1
    const day = pad(now.getDate());
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
  
    return `${month}${day}${hours}${minutes}${seconds}`;
  }

  async importEventsFromFiles(eventsDir: string, token0Name: string, token1Name: string, poolAddress: string) {
    let uniswapV3Pool = await this.getCorePoolContarct(poolAddress);
    let dbFilePath = `./eventdb/${token0Name}-${token1Name}-${await (uniswapV3Pool.fee())}-${this.getCurrentFormattedDateTime()}_${poolAddress}.db`
    if (fs.existsSync(dbFilePath)) {
      throw new Error(`The database file: ${dbFilePath} already exists. Please choose a different file path or delete the existing file.`);
    }
    console.time('Import events from events file')
    let eventFiles: string[] = this.readJsonFilesRecursively(eventsDir)

    const eventDB = await EventDBManager.buildInstance(dbFilePath);
    let latestEventBlockNumber = 0
    let initializeTopic = uniswapV3Pool.filters.Initialize();
    let initializationEvent = await uniswapV3Pool.queryFilter(initializeTopic);
    let initializationSqrtPriceX96 = initializationEvent[0].args.sqrtPriceX96;
    let initializationEventBlockNumber = initializationEvent[0].blockNumber;
    try {
      // query and record poolConfig
      let poolConfig = new PoolConfig(
        await uniswapV3Pool.tickSpacing(),
        await uniswapV3Pool.token0(),
        await uniswapV3Pool.token1(),
        await uniswapV3Pool.fee()
      );
      await eventDB.addPoolConfig(poolConfig);
      // record initialize event
      await eventDB.addInitialSqrtPriceX96(
        initializationSqrtPriceX96.toString()
      );
      await eventDB.saveInitializationEventBlockNumber(
        initializationEventBlockNumber
      );
      for (const file of eventFiles) {
        console.time(`Process file ${file}`)
        const rawData = fs.readFileSync(file, 'utf-8');
        const events = JSON.parse(rawData);
        for (const event of events) {
          latestEventBlockNumber = event.block_number > latestEventBlockNumber ? event.block_number : latestEventBlockNumber
          if (event.type === 1 || event.type === 2) {
            await eventDB.insertLiquidityEvent(
              event.type,
              event.msg_sender,
              event.recipient,
              event.liquidity,
              event.amount0,
              event.amount1,
              event.tick_lower,
              event.tick_upper,
              event.block_number,
              event.transaction_index,
              event.log_index,
              new Date(event.date)
            );
          } else {
            await eventDB.insertSwapEvent(
              event.msg_sender,
              event.recipient,
              event.amount0,
              event.amount1,
              event.sqrt_price_x96,
              event.liquidity,
              event.tick,
              event.block_number,
              event.transaction_index,
              event.log_index,
              new Date(event.date)
            );
          }
        }
        console.timeEnd(`Process file ${file}`)
      }
      await eventDB.saveLatestEventBlockNumber(latestEventBlockNumber)
      await this.preProcessSwapEvent(eventDB);
      console.log("Events have been imported successfully.");
      console.timeEnd('Import events from events file')
    } finally {
      await eventDB.close();
    }
  }

  readJsonFilesRecursively(directoryPath: string, fileList: string[] = []): string[] {
      // 读取目录内容
      const filesAndDirectories = fs.readdirSync(directoryPath);
    
      filesAndDirectories.forEach(item => {
          const fullPath = path.join(directoryPath, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
              // 如果是目录，则递归读取
              this.readJsonFilesRecursively(fullPath, fileList);
          } else if (stat.isFile() && path.extname(fullPath) === '.json') {
              // 如果是.json文件，则将文件路径添加到列表中
              fileList.push(fullPath);
          }
      });

      return fileList;
  }

  async getLatestBlockNumberInDb(mainnetEventDBFilePath: string): Promise<number> {
    let eventDB = await EventDBManager.buildInstance(mainnetEventDBFilePath);
    let latestBlockNumberInDb = eventDB.getLatestEventBlockNumber()
    return latestBlockNumberInDb;
  }


}
