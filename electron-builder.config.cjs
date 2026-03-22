const pkg = require("./package.json");

const baseBuild = pkg.build || {};
const ghOwner = String(process.env.GH_OWNER || process.env.APPGESTAO_GH_OWNER || "").trim();
const ghRepo = String(process.env.GH_REPO || process.env.APPGESTAO_GH_REPO || "").trim();
const ghReleaseType = String(process.env.GH_RELEASE_TYPE || "release").trim().toLowerCase();
const releaseType =
  ghReleaseType === "draft" || ghReleaseType === "prerelease" ? ghReleaseType : "release";

const publishGithub =
  ghOwner && ghRepo
    ? [
        {
          provider: "github",
          owner: ghOwner,
          repo: ghRepo,
          releaseType
        }
      ]
    : baseBuild.publish || [];

module.exports = {
  ...baseBuild,
  publish: publishGithub
};

