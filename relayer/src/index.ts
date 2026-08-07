import { app } from "./app.js";
import { config } from "./config.js";
import { relayerAccount } from "./chain.js";

app.listen(config.port, () => {
  console.log(`PayU relayer listening on :${config.port}`);
  console.log(`Relayer address: ${relayerAccount.address}`);
});
