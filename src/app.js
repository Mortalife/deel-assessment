const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const { Op } = require("sequelize");
const { isClient } = require("./middleware/isClient");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

/**
 * @returns contract by id
 */
app.get("/contracts/:id", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const { id } = req.params;
  const contract = await Contract.findOne({
    where: {
      id,
      [Op.or]: [{ ClientId: req.profile.id }, { ContractorId: req.profile.id }],
    },
  });
  if (!contract) return res.status(404).end();
  res.json(contract);
});
/**
 * @returns Returns a list of contracts belonging to a user (client or contractor),
 * the list should only contain non terminated contracts.
 */
app.get("/contracts", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const contract = await Contract.findAll({
    where: {
      [Op.or]: [{ ClientId: req.profile.id }, { ContractorId: req.profile.id }],
      status: {
        [Op.not]: "terminated",
      },
    },
  });
  if (!contract) return res.status(404).end();
  res.json(contract);
});
/**
 * @returns Get all unpaid jobs for a user (either a client or contractor), for active contracts only
 * [REMARKS]: "for a user" rather than "belongs to a user" suggests that in the context, suggests somebody other than client or contractor
 * ie: a global admin of some sort, therefore getProfile would not be a suitable authentication. I'm going to presume you meant belonging to the user.
 */
app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const { Job, Contract } = req.app.get("models");

  //join on contracts on contractId and ensure the contract is active
  const jobs = await Job.findAll({
    include: {
      model: Contract,
      as: "Contract",
      required: true,
      where: {
        status: "in_progress",
        [Op.or]: [
          { ClientId: req.profile.id },
          { ContractorId: req.profile.id },
        ],
      },
    },
    where: {
      paid: {
        [Op.not]: true,
      },
    },
  });
  if (!jobs) return res.status(404).end();
  res.json(jobs);
});
/**
 * @returns Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
 */
app.post("/jobs/:job_id/pay", getProfile, isClient, async (req, res) => {
  const { Job, Contract, Profile } = req.app.get("models");
  const { job_id } = req.params;

  const job = await Job.findOne({
    include: {
      model: Contract,
      as: "Contract",
      required: true,
      where: {
        status: "in_progress",
        ClientId: req.profile.id,
      },
    },
    where: {
      id: job_id,
      paid: {
        [Op.not]: true,
      },
    },
  });

  if (!job) return res.status(404).end();

  // Refresh the balance of the client
  const client = await Profile.findOne({
    where: { id: req.profile.id },
  });
  // Refresh the balance of the client
  const contractor = await Profile.findOne({
    where: { id: job.Contract.ContractorId },
  });

  if (job.price > client.balance) {
    return res.status(402).end();
  }

  const t = await sequelize.transaction();

  try {
    await Promise.all([
      //Remove balance
      Profile.update(
        {
          balance: client.balance - job.price,
        },
        {
          where: { id: client.id },
          transaction: t,
        }
      ),
      //Add balance
      Profile.update(
        {
          balance: contractor.balance + job.price,
        },
        {
          where: { id: contractor.id },
          transaction: t,
        }
      ),
      //Mark Paid
      Job.update(
        {
          paid: true,
          paymentDate: new Date(),
        },
        {
          where: { id: job_id },
          transaction: t,
        }
      ),
    ]);

    await t.commit();
  } catch (error) {
    console.log(error);
    await t.rollback();
    return res.status(400).end();
  }

  const newJob = await Job.findOne({
    include: {
      model: Contract,
      as: "Contract",
      required: true,
      where: {
        status: "in_progress",
        ClientId: req.profile.id,
      },
    },
    where: {
      id: job_id,
    },
  });

  res.json(newJob);
});

/**
 * @returns Deposits money into the the the balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 */
app.post("/balances/deposit/:userId", async (req, res) => {
  const { Job, Contract, Profile } = req.app.get("models");
  const { userId } = req.params;
  const { amount } = req.body;

  if (typeof amount === "undefined" || typeof amount !== "number")
    return res.status(400).end();
  if (amount === 0) return res.status(204).end(); //no content

  // Refresh the balance of the client
  const client = await Profile.findOne({
    where: { id: userId, type: "client" },
  });

  if (!client) return res.status(404).end();

  const jobs = await Job.findAll({
    include: {
      model: Contract,
      as: "Contract",
      required: true,
      where: {
        status: "in_progress",
        ClientId: client.id,
      },
    },
    where: {
      paid: {
        [Op.not]: true,
      },
    },
  });

  if (!jobs) return res.status(404).end();

  const outstandingTotal = jobs.reduce((total, job) => total + job.price, 0);

  if (outstandingTotal === 0) {
    return res.status(403).end();
  }

  const twentyFivePercentAllowance = outstandingTotal * 0.25;

  if (amount > twentyFivePercentAllowance) {
    return res.status(403).end();
  }

  const t = await sequelize.transaction();

  try {
    await Profile.update(
      {
        balance: client.balance + amount,
      },
      {
        where: { id: client.id },
        transaction: t,
      }
    ),
      await t.commit();
  } catch (error) {
    console.log(error);
    await t.rollback();
    return res.status(400).end();
  }
  // Refresh the balance of the client
  const newClient = await Profile.findOne({
    where: { id: userId, type: "client" },
  });

  res.json(newClient);
});

/**
 * @returns   Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
 */
app.get("/admin/best-profession", async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) return res.status(400).end();

  const [results] = await sequelize.query(
    `SELECT SUM(price) as total, profiles.profession as profession 
        FROM jobs 
        LEFT JOIN contracts ON jobs.ContractId = contracts.id 
        LEFT JOIN profiles ON contracts.ContractorId = profiles.id 
        WHERE paid = true AND jobs.paymentDate BETWEEN :start AND :end 
        GROUP BY profiles.profession 
        ORDER BY total DESC LIMIT 1`,
    {
      replacements: {
        start: new Date(start),
        end: new Date(end),
      },
    }
  );

  if (!results.length)
    return res.json({
      profession: null,
    });

  res.json(results[0]);
});

module.exports = app;
