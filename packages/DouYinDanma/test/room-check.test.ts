import { describe, it } from "vitest";
import { getRoomInfo } from "../../DouYinRecorder/src/douyin_api";

const roomId = process.env.DOUYIN_ROOM_ID;

describe.skipIf(!roomId)("room check", () => {
  it("should print room info", async () => {
    try {
      const info: any = await getRoomInfo(roomId!, { api: "web" });
      console.log("living:", info.living);
      console.log("owner:", info.owner);
      console.log("title:", info.title);
      console.log("ownerId:", info.ownerId);
      console.log("liveId:", info.liveId);
      console.log("streams:", info.streams?.length);
    } catch (e) {
      console.log("getRoomInfo error:", (e as Error).message);
    }
  });
});
