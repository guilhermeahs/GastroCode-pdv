/* eslint-disable no-console */
console.log("check-electron-backend:start");
console.log("versions", process.versions);

try {
  require("../backend/src/config/db");
  console.log("db:ok");
} catch (error) {
  console.error("db:error", error && error.message ? error.message : error);
}

try {
  require("../server");
  console.log("server:ok");
} catch (error) {
  console.error("server:error", error && error.message ? error.message : error);
}

setTimeout(() => {
  console.log("check-electron-backend:end");
  process.exit(0);
}, 800);
