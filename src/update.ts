import { EventDataSourceType, MainnetDataDownloader } from ".";


async function download() {
//   let poolName = "WETH-USDC-RPC";
  
//   let poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

    let endBlock = 20000000;

    while (true) {
        try {
            console.log('Start to update...')
      
            let downloader = new MainnetDataDownloader(undefined, EventDataSourceType.RPC)
            await downloader.update('/home/ubuntu/lvr/uniswap-v3-simulator/eventdb/WETH_USDC_500_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db', endBlock, 1000)
            console.log('Download finished.')
            return
        } catch (error) {
            console.log(error)
        }
    }
}


download().then()