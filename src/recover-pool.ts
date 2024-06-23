import { MainnetDataDownloader } from "./client";
import { EventDataSourceType } from "./enum";








async function recover() {
    let downloader = new MainnetDataDownloader(undefined, EventDataSourceType.RPC)
    const token0 = 'WETH'
    const token1 = 'USDC'

    const poolAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';

    let eventsDir = './events'
    console.time(`recover pool ${token0}-${token1}-${poolAddress}`)
    await downloader.importEventsFromFiles(eventsDir, token0, token1, poolAddress)
    console.timeEnd(`recover pool ${token0}-${token1}-${poolAddress}`)

}

recover().then()