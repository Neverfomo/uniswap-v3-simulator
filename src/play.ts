
import {
    SimulationDataManager,
    SimulatorClient,
    SQLiteSimulationDataManager,
  } from ".";
// import JSBI from 'jsbi';

// function sqrtPriceX96ToPrice(sqrtPriceX96: JSBI): JSBI {
//     const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
    
//     // 计算 sqrtPriceX96 / 2^96
//     const sqrtPrice = JSBI.divide(sqrtPriceX96, Q96);
    
//     // 计算 price = (sqrtPriceX96 / 2^96)^2
//     const price = JSBI.multiply(sqrtPrice, sqrtPrice);
    
//     return price;
// }

  
async function main() {
    // 1. Instantiate a SimulationDataManager
    // this is for handling the internal data (snapshots, roadmaps, etc.)
    let simulationDataManager: SimulationDataManager =
    await SQLiteSimulationDataManager.buildInstance(
        "weth-usdc"
    );
    let clientInstance: SimulatorClient = new SimulatorClient(
    simulationDataManager
    );

    // let poolName = "test";

    // let poolAddress = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";

    // let endBlock = 12374077;

    // await clientInstance.initCorePoolFromMainnet(
    // poolName,
    // poolAddress,
    // "afterDeployment"
    // );

    

    // let dataPathSubgraph = '/home/ubuntu/lvr/uniswap-v3-simulator/WETH-USDC-SUBGRAPH_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db'
    // let dataPathRpc = '/home/ubuntu/lvr/uniswap-v3-simulator/WETH-USDC-SUBGRAPH-FULL_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db'
    let dataPath = '/home/ubuntu/lvr/uniswap-v3-simulator/WETH-USDC-SUBGRAPH-TMP_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640.db'


    let configurableCorePool = await clientInstance.recoverFromMainnetEventDBFile(dataPath, 12595411)

    let sqrtPriceX96 = configurableCorePool.getCorePool().sqrtPriceX96
    console.log(sqrtPriceX96.toString())
    
    // // 计算 sqrt_price
    // const factor = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
    // const sqrtPrice = JSBI.divide(sqrtPriceX96, factor);

    // // 计算实际价格
    // const price = JSBI.multiply(sqrtPrice, sqrtPrice);
    // console.log(price.toString())
    // console.log(configurableCorePool.getCorePool().sqrtPriceX96.toString())

    // const sqrtPriceX96 = JSBI.BigInt('1503411467024264636315936993640940'); // 2^96
    // const price = sqrtPriceX96ToPrice(sqrtPriceX96);

    // console.log(price.toString());

    process.exit()
}

main().then()


