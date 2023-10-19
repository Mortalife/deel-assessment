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

  it("it should return the contract if it belongs to the user", async () => {
    /**
     * 5 belongs to 3/8
     */
    const output = await fetch(getUrl("/contracts/5"), {
      headers: {
        profile_id: "3",
      },
    });

    expect(output.status).toBe(200);
  });

  it("it should return all the contracts that belong to the user", async () => {
    const output = await fetch(getUrl("/contracts"), {
      headers: {
        profile_id: "3",
      },
    });

    expect(output.status).toBe(200);
    expect((await output.json()).length).toBe(2);
  });

  it("it should return all the contracts that belong to the user that aren't terminated", async () => {
    /**
     * 1 has a terminated contract
     */
    const output = await fetch(getUrl("/contracts"), {
      headers: {
        profile_id: "1",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.some((c) => c.status === "terminated")).toBe(false);
  });
});
