// import { Tick } from "./model/Tick";
// import { ethers } from "ethers";
// import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
// import { Contract, Provider } from 'ethers-multicall'


function tickToWord(tick: number, tickSpacing: number): number {
  let compressed = Math.floor(tick / tickSpacing)
  if (tick < 0 && tick % tickSpacing !== 0) {
    compressed -= 1
  }
  return compressed >> 8
}

async function getticks() {

  // let ticks: Tick[]
  //
  // let poolAddress = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'
  //
  // let provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/gmt0k2JiwMqSvXsMG7bP98DcrPhfilE1')

  // let poolContract = new Contract(
  //   poolAddress,
  //   IUniswapV3PoolABI.abi,
  //   provider
  // )

  const minWord = tickToWord(-887272, 10)
  const maxWord = tickToWord(887272, 10)

  console.log(minWord)
  console.log(maxWord)

  const MIN_TICK = -887272;
  const MAX_TICK = 887272;
  const TICK_SPACING = 10;


  const MIN_WORD = Math.floor(MIN_TICK / (256 * TICK_SPACING));
  const MAX_WORD = Math.floor(MAX_TICK / (256 * TICK_SPACING));

  console.log(MIN_WORD)
  console.log(MAX_WORD)

  // const multicallProvider = new Provider(provider)
  // await multicallProvider.init()

  // let calls: any[] = []
  // let wordPosIndices: number[] = []
  // for (let i = minWord; i <= maxWord; i++) {
  //   wordPosIndices.push(i)
  //   calls.push(poolContract.tickBitmap(i))
  // }

  // const results: bigint[] = (await multicallProvider.all(calls)).map(
  //   (ethersResponse) => {
  //     return BigInt(ethersResponse.toString())
  //   }
  // )


}

getticks().then()