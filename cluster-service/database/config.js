const { Sequelize } = require("sequelize");
require("dotenv").config();
console.log("Host:", process.env.DB_HOST);
const sequelize = new Sequelize("sellerpundit-live", "postgres", "seller@123", {
  host: "103.30.72.29",
  dialect: "postgres",
  logging: false,
});

sequelize
  .sync()
  .then(() => {
    console.log(`**********Postgres Connected successfully!**********`);
  })
  .catch((e) => {
    console.log(`**********Postgres Connection failed :(**********`);
    console.log(e);
  });

module.exports = { sequelize };
