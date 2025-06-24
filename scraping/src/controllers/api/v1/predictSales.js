const regression = require("regression");

module.exports = {
  predictSales(req, res) {
    let dataPoints = req.body.dataPoints;
    let xValue = req.body.xValue;

    const result = regression.linear(dataPoints);
    const gradient = result.equation[0];
    const yIntercept = result.equation[1];

    const predictedValue = gradient * xValue + yIntercept;
    console.log("predictedValue = " + predictedValue);

    try {
      return res.status(200).json({
        predictedValue,
        predictedSales: predictedValue,
      });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};