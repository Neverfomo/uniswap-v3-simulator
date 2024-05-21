module.exports = {
  // RPCProviderUrl: process.env.PUBLIC_MAINNET_PROVIDER_URL,
  // PrivateRPCProviderUrl: process.env.MAINNET_PROVIDER_URL,
  RPCProviderUrl: "http://127.0.0.1:8489",
  PrivateRPCProviderUrl: "http://127.0.0.1:8489",
  IPCProviderUrl: process.env.IPC_PROVIDER_URL,
  providerToBeUsed: "privateRpc" // privateRpc | privateIpc | public
};
