const User = require("../models/user");
// const jwt = require("jsonwebtoken");
const { jwtDecode } = require("jwt-decode");

const getUser = (request) => {
  return new Promise(async function (resolve, reject) {
    if (
      request.headers.authorization &&
      request.headers.authorization.split(" ")[0] === "Bearer"
    ) {
      let token = request.headers["authorization"].split(" ")[1];

      const decoded = jwtDecode(token);

      const user = await User.findOne({
        attributes: ["id", "email"],
        where: { id: decoded.id },
      });

      return resolve(user);
    }

    /* jwt.verify(token, process.env.JWT_SECRET, async function(err, decoded) {
            if(decoded) {

                const user = await User.findOne({ where: { jwt_token: token } });

                return resolve(user)
            }
            if(err) {
                console.log('*****decodedToken err*****')
                console.log(err)

                return resolve(false)
            }
        }); */
  });
};

module.exports = { getUser };
