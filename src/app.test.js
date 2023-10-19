import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "./app";
import { seed } from "../db/seed";

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

  beforeEach(async () => {
    await seed();
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

  it("it should return all the unpaid jobs that belong to a user that are active", async () => {
    /**
     * 1 has a terminated contract
     */
    const output = await fetch(getUrl("/jobs/unpaid"), {
      headers: {
        profile_id: "1",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.length).toBe(1);
    expect(data[0].paid).toBeFalsy();
  });

  it("it should return all the unpaid jobs that belong to a user that are on active contracts", async () => {
    /**
     * 1 has a terminated contract
     */
    const output = await fetch(getUrl("/jobs/unpaid"), {
      headers: {
        profile_id: "1",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.length).toBe(1);
    expect(data[0].paid).toBeFalsy();
  });

  it("it should not return any unpaid jobs for a terminated contract", async () => {
    /**
     * Contract 1 has been terminated contract, owned by 5, 5 performed 1 job and it's marked unpaid
     */
    const output = await fetch(getUrl("/jobs/unpaid"), {
      headers: {
        profile_id: "5",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.length).toBe(0);
  });

  it("it should not allow a contractor to pay for a job", async () => {
    const output = await fetch(getUrl("/jobs/2/pay"), {
      method: "POST",
      headers: {
        profile_id: "6",
      },
    });

    expect(output.status).toBe(401);
  });

  it("it should not allow a client to pay for a job they do not own", async () => {
    const output = await fetch(getUrl("/jobs/2/pay"), {
      method: "POST",
      headers: {
        profile_id: "2", //owned by 1
      },
    });

    expect(output.status).toBe(404);
  });

  it("it should pay for a job, a client can only pay if his balance >= the amount to pay.", async () => {
    const output = await fetch(getUrl("/jobs/2/pay"), {
      method: "POST",
      headers: {
        profile_id: "1",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.id).toBe(2);
    expect(data.paid).toBe(true);
  });

  it("it should not pay for a job if the client doesn't have enough balance", async () => {
    const output = await fetch(getUrl("/jobs/15/pay"), {
      method: "POST",
      headers: {
        profile_id: "4",
      },
    });

    expect(output.status).toBe(402);
  });

  it("it should move the client's balance to the contractor balance.", async () => {
    const output = await fetch(getUrl("/jobs/2/pay"), {
      method: "POST",
      headers: {
        profile_id: "1",
      },
    });

    expect(output.status).toBe(200);
    const data = await output.json();
    expect(data.length).toBe(0);

    /**
     *     Profile.create({
            id: 6,
            firstName: "Linus",
            lastName: "Torvalds",
            profession: "Programmer",
            balance: 1214,
            type: "contractor",
            }),
     */
  });
});
