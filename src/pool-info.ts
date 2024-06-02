

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import { computePoolAddress, FeeAmount } from "@uniswap/v3-sdk";
import {BigNumber, ethers} from 'ethers'
import { POOL_FACTORY_CONTRACT_ADDRESS } from './constants'
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import {Token} from "@uniswap/sdk-core";

interface PoolInfo {
  token0: string
  token1: string
  fee: number
  tickSpacing: number
  sqrtPriceX96: ethers.BigNumber
  liquidity: ethers.BigNumber
  tick: number
}

export async function getPoolInfo(blockNumber: number, tokenIn: Token, tokenOut: Token): Promise<PoolInfo> {
  const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/gmt0k2JiwMqSvXsMG7bP98DcrPhfilE1')
  if (!provider) {
    throw new Error('No provider')
  }

  // 1. get pool address by (input token, output token, pool fee)
  const currentPoolAddress = computePoolAddress({
    factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    tokenA: tokenIn,
    tokenB: tokenOut,
    fee: FeeAmount.LOW,
  })
  console.log(currentPoolAddress)
  // 2. create a Contract instance by the pool address and UniswapV3PoolABI
  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    provider
  )


  // 3. Fetch pool info by calling the pool contract methods.
  const [token0, token1, fee, tickSpacing, liquidity, slot0] =
    await Promise.all([
      poolContract.token0({ blockTag: blockNumber }),
      poolContract.token1({ blockTag: blockNumber }),
      poolContract.fee({ blockTag: blockNumber }),
      poolContract.tickSpacing({ blockTag: blockNumber }),
      poolContract.liquidity({ blockTag: blockNumber }),
      poolContract.slot0({ blockTag: blockNumber }),
    ])

  return {
    token0,
    token1,
    fee,
    tickSpacing,
    liquidity,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
  }
}
