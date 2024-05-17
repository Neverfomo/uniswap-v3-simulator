import { ethers } from "ethers";

const RPCProviderUrl = "https://admin.sorellalabs.xyz:8888";
const provider = new ethers.providers.JsonRpcProvider(RPCProviderUrl);

async function main() {
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log("Current block number:", blockNumber);
  } catch (error) {
    console.error("Error connecting to the provider:", error);
  }
}

main().then();