// Run only with mongosh against a confirmed disposable development/staging database.
// Connection strings are supplied to mongosh externally and are never stored here.

if (process.env.EDUGUARD_RESET_CONFIRM !== "DEV-STAGING") {
  throw new Error("Refusing reset: set EDUGUARD_RESET_CONFIRM=DEV-STAGING after backup validation.");
}

const mode = process.env.EDUGUARD_RESET_MODE;
if (mode !== "main" && mode !== "lms") {
  throw new Error("EDUGUARD_RESET_MODE must be main or lms.");
}

const collections = db.getCollectionInfos({ type: "collection" }).map((item) => item.name);

if (mode === "main") {
  const retainEmail = (process.env.EDUGUARD_RETAIN_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!retainEmail) throw new Error("EDUGUARD_RETAIN_ADMIN_EMAIL is required for the main reset.");

  const retained = db.admins.find({ email: retainEmail, role: "admin", isSuperAdmin: true }).toArray();
  if (retained.length !== 1) {
    throw new Error(`Expected exactly one retained active super-admin, found ${retained.length}.`);
  }

  for (const name of collections) {
    if (name === "admins") continue;
    db.getCollection(name).deleteMany({});
  }
  db.admins.deleteMany({ _id: { $ne: retained[0]._id } });

  const remainingAdmins = db.admins.find({}).toArray();
  if (remainingAdmins.length !== 1 || remainingAdmins[0].email !== retainEmail) {
    throw new Error("Post-reset verification failed: retained super-admin invariant was not preserved.");
  }
} else {
  for (const name of collections) db.getCollection(name).deleteMany({});
}

const remaining = Object.fromEntries(
  collections.map((name) => [name, db.getCollection(name).countDocuments({})]),
);
print(EJSON.stringify({ mode, database: db.getName(), remaining }));
