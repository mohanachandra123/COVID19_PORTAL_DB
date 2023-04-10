const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// GET states API

app.get("/states/", authenticateToken, async (request, response) => {
  const statesQuery = `
    SELECT * FROM state;
    `;
  const statesList = await db.all(statesQuery);
  response.send(
    statesList.map((state) => convertStateDbObjectToResponseObject(state))
  );
});

//Get state API

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getState = `
    SELECT * FROM state
    WHERE state_id = ${stateId};
    `;
  const state = await db.get(getState);
  response.send(convertStateDbObjectToResponseObject(state));
});

//create dist API

app.post("/districts/", authenticateToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const createDistQuery = `
    INSERT INTO 
    district (state_id, district_name, cases, cured, active, deaths)
    VALUES 
        (${stateId},
        '${districtName}',
         ${cases},
         ${cured},
         ${active},
         ${deaths});
    `;
  await db.run(createDistQuery);
  response.send("District Successfully Added");
});

//Get one dist API

app.get(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistQuery = `
    SELECT * FROM district 
    WHERE district_id = ${districtId};
    `;
    const dist = await db.get(getDistQuery);
    response.send(convertDistrictDbObjectToResponseObject(dist));
  }
);
// DELETE dist API

app.delete(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistQuery = `
    DELETE FROM district 
    WHERE district_id = ${districtId};
    `;
    await db.run(deleteDistQuery);
    response.send("District Removed");
  }
);
//UPDATE dist API

app.put(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistQuery = `
     UPDATE district
     SET 
     district_name = '${districtName}',
     state_id = ${stateId},
     cases = ${cases},
     cured = ${cured},
     active = ${active},
     deaths = ${deaths}
     WHERE 
     district_id = ${districtId};
     `;
    await db.run(updateDistQuery);
    response.send("District Details Updated");
  }
);

//Get stats API

app.get(
  "/states/:stateId/stats",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statesStatsQuery = `
    SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM 
    district 
    WHERE 
    state_id = ${stateId};
    `;
    const stats = await db.get(statesStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
