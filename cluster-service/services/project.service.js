const { sequelize } = require("../database/config");

const ProjectService = {
  async updateProject(projectId, data) {
    const fields = Object.keys(data);
    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    const setClause = fields.map((field) => `"${field}" = ?`).join(", ");
    const values = fields.map((field) => {
      const value = data[field];

      if (Array.isArray(value)) {
        return `{${value.map((item) => `"${item}"`).join(",")}}`;
      }

      return value;
    });

    values.push(projectId);

    const query = `UPDATE projects SET ${setClause} WHERE id = ? RETURNING *;`;

    const [result] = await sequelize.query(query, {
      replacements: values,
      type: sequelize.QueryTypes.UPDATE,
    });

    return result[0];
  },
};

module.exports = ProjectService;
