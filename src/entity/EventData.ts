import { EventType } from "../enum";

export interface SwapEventData {
  msg_sender: string,
  recipient: string,
  amount0: string,
  amount1: string,
  sqrt_price_x96: string,
  liquidity: string,
  tick: number,
  block_number: number,
  transaction_index: number,
  log_index: number,
  date: Date,
  timestamp: number
}

export interface LiquidityEventData {
  type: number,
  msg_sender: string,
  recipient: string,
  liquidity: string,
  amount0: string,
  amount1: string,
  tick_lower: number,
  tick_upper: number,
  block_number: number,
  transaction_index: number,
  log_index: number,
  date: Date,
  timestamp: number
}