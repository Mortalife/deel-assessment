import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "./app";

const URL = process.env.DEV_URL || "http://localhost:3001";

function getUrl(path) {
  return `${URL}${path}`;
}

describe("app", () => {
  let server;
  beforeAll(() => {
    server = app.listen(3001, () => {
      console.log("Express App Listening on Port 3001");
    });
  });

  afterAll(() => {
    server.close();
  });

  it("it should not return the contract if it doesn't belong to the user", async () => {
    /**
     * 5 belongs to 3/8
     */
    const output = await fetch(getUrl("/contracts/5"), {
      headers: {
        profile_id: "5",
      },
    });

    expect(output.status).toBe(404);
  });
});
