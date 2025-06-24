const { sequelize } = require("../database/config.js");
const { INTEGER, UUID, STRING } = require("sequelize");

const FileStorages = sequelize.define("fileStorages", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false, //TODO - required:true
    unique: true,
  },
  userId: {
    type: UUID,
    require: true,
  },

  fileUrl: {
    type: STRING,
    require: true,
  },
  timeDuration: {
    type: INTEGER,
    require: true,
  },
  durationType: {
    type: STRING,
    require: true,
    defaultValue: "mints", //TODO - the value will be mints or hour
  },
  status: {
    type: STRING,
    defaultValue: "active",
  },
});

module.exports = FileStorages;
