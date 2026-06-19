import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    localDev(),
    vercelOidc(),
    httpBasic({
      username: process.env.EVE_AGENT_USERNAME ?? "robin-web",
      password: process.env.EVE_AGENT_PASSWORD ?? "__missing_eve_password__",
    }),
  ],
});
