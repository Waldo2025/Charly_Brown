const test = require("node:test");
const assert = require("node:assert/strict");

const { hasAdminRoleWithProfile, isAdminRole } = require("../src/common.js");
const { sessionAccess } = require("../src/podcaster-data.js");

function fakeDb(profile) {
  return {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return {
                exists: Boolean(profile),
                data: () => profile || {}
              };
            }
          };
        }
      };
    }
  };
}

test("administrative access requires users/{uid}.role to be admin", async () => {
  const tokenAdmin = { uid: "user-1", role: "admin", token: { role: "admin" } };

  assert.equal(await hasAdminRoleWithProfile(tokenAdmin, fakeDb({ role: "member" })), false);
  assert.equal(await hasAdminRoleWithProfile(tokenAdmin, fakeDb({ requestedRole: "admin" })), false);
  assert.equal(await hasAdminRoleWithProfile(tokenAdmin, fakeDb({ role: "administrator" })), false);
  assert.equal(await hasAdminRoleWithProfile(tokenAdmin, fakeDb({ role: "Admin" })), false);
  assert.equal(await hasAdminRoleWithProfile({ uid: "user-1" }, fakeDb({ role: "admin" })), true);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("owner"), false);
});

test("a token admin claim alone cannot read another user's session", () => {
  assert.equal(sessionAccess({ ownerId: "user-2" }, { uid: "user-1", role: "admin" }), false);
});
