const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DRIVER,
    logging: false,
    pool: {
      max: 10, // Adjust this value based on your requirements
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

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
