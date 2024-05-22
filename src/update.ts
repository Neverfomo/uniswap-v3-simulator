import { EventDataSourceType, MainnetDataDownloader } from ".";


async function download() {
//   let poolName = "WETH-USDC-RPC";
  
//   let poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

    let endBlock = 19920634;

    while (true) {
        try {
            console.log('Start to update...')
      
            let downloader = new MainnetDataDownloader(undefined, EventDataSourceType.RPC)
            await downloader.update('./WETH-USDC-RPC_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db', endBlock, 5000)
            console.log('Download finished.')
            return
        } catch (error) {
            console.log(error)
        }
    }
}


download().then()