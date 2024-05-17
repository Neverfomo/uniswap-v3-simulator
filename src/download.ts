import { EventDataSourceType, MainnetDataDownloader } from ".";


async function download() {
  let poolName = "WETH-USDC-RPC-SORELLA";
  
  let poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

  let endBlock = 14385510;

  console.log('Start to download...')
  //'https://eth-mainnet.g.alchemy.com/v2/gmt0k2JiwMqSvXsMG7bP98DcrPhfilE1'
  
  let downloader = new MainnetDataDownloader('https://admin.sorellalabs.xyz', EventDataSourceType.RPC)
  await downloader.download(poolName, poolAddress, endBlock, 5000)
  // await downloader.update('./WETH-USDC-RPC_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db', endBlock, 1000)
  console.log('Download finished.')
}


download().then()