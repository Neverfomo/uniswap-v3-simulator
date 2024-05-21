import { ethers } from 'ethers';

// 定义IPC文件路径
const IPC_PATH = '/tmp/reth.ipc';

// 创建一个IPC提供者
const provider = new ethers.providers.IpcProvider(IPC_PATH);

// 测试连接
async function main() {
    let cnt = 0
    while (cnt < 10) {
        provider.getBlockNumber()
        .then((blockNumber) => {
            console.log(`Current block number: ${blockNumber}`);
        })
        .catch((error) => {
            console.error(`Error connecting to IPC: ${error}`);
        });
        cnt += 1
    }
}
main().then()
