// Focused tests for the muscle-group leveling / XP system.
//
// Every test runs inside a ROLLBACK transaction so nothing is persisted to the
// dev database. Data model used mirrors production:
//   log_top_set()            -> real API path (writes workout_sets, fires PR triggers)
//   sets_evaluate_pr()       -> compares against per-exercise best, calls award_exercise_xp
//   award_exercise_xp()      -> single deterministic XP reward per set
//   get_muscle_progression() -> level + progress math (reads level_xp from xp_config)
//
// Run:  node --test tests/progression.test.js   (from backend/)

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DB_URL = process.env.DATABASE_URL;
assert.ok(DB_URL, "DATABASE_URL must be set in backend/.env");

// muscle_groups seed ids
const MG = {
  Chest: 1,
  Back: 2,
  Shoulders: 3,
  Biceps: 4,
  Triceps: 5,
  Forearms: 6,
  Legs: 7,
};

async function withTx(fn) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } finally {
    await client.end();
  }
}

async function createProfile(tx) {
  const id = crypto.randomUUID();
  const { rows } = await tx.query(
    "INSERT INTO profiles (id, email, timezone) VALUES ($1, $2, 'UTC') RETURNING id",
    [id, `xp-test-${id}@example.com`],
  );
  return rows[0].id;
}

async function addPreferences(tx, userId, muscleGroups) {
  for (const [order, mgId] of muscleGroups.entries()) {
    await tx.query(
      "INSERT INTO user_muscle_preferences (user_id, muscle_group_id, selection_order) VALUES ($1, $2, $3)",
      [userId, mgId, order],
    );
  }
}

async function createExercise(tx, userId, name, muscleGroupId) {
  const id = crypto.randomUUID();
  const { rows } = await tx.query(
    `INSERT INTO exercises (id, name, slug, is_compound, equipment, primary_muscle_group_id, owner_id)
     VALUES ($1, $2, $3, false, 'barbell', $4, $5)
     RETURNING id`,
    [id, name, `xp-test-${id.slice(0, 8)}`, muscleGroupId, userId],
  );
  return rows[0].id;
}

async function logSet(tx, userId, exerciseId, weightKg, reps, performedAt) {
  const { rows } = await tx.query(
    `SELECT * FROM log_top_set($1, $2, $3, $4, 'kg'::unit_type, $5::timestamptz)`,
    [userId, exerciseId, weightKg, reps, performedAt],
  );
  return rows[0];
}

async function xpTransactions(tx, userId) {
  const { rows } = await tx.query(
    "SELECT reason, xp_amount, set_id, muscle_group_id FROM xp_transactions WHERE user_id = $1 ORDER BY created_at",
    [userId],
  );
  return rows;
}

async function levelRow(tx, userId, mgId) {
  const { rows } = await tx.query(
    "SELECT * FROM muscle_group_levels WHERE user_id = $1 AND muscle_group_id = $2",
    [userId, mgId],
  );
  return rows[0];
}

async function progression(tx, userId) {
  const { rows } = await tx.query("SELECT * FROM get_muscle_progression($1)", [
    userId,
  ]);
  return rows;
}

const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Starting level / baseline
// ---------------------------------------------------------------------------

test("first record establishes a baseline without earning XP", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench A", MG.Chest);
    const set = await logSet(tx, user, ex, 40, 8, new Date("2026-01-01T10:00:00Z"));

    assert.equal(set.comparison, "first_record");
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 0, "baseline must earn no XP");

    const level = await levelRow(tx, user, MG.Chest);
    assert.equal(level.total_xp, 0);
    assert.equal(level.starting_level, 1); // xp_level_for_weight(40) -> anchor {40 => 1}
    assert.equal(Number(level.starting_weight_kg), 40);
    assert.equal(Number(level.best_weight_kg), 40);
    assert.equal(level.best_reps, 8);
  });
});

test("different first weights produce different starting levels, never XP", async () => {
  await withTx(async (tx) => {
    const u12 = await createProfile(tx);
    const e12 = await createExercise(tx, u12, "Incline A", MG.Chest);
    await logSet(tx, u12, e12, 12.5, 8, new Date("2026-01-01T10:00:00Z"));
    const l12 = await levelRow(tx, u12, MG.Chest);

    const u45 = await createProfile(tx);
    const e45 = await createExercise(tx, u45, "Flat A", MG.Chest);
    await logSet(tx, u45, e45, 45, 8, new Date("2026-01-01T10:00:00Z"));
    const l45 = await levelRow(tx, u45, MG.Chest);

    assert.equal(l12.starting_level, 0);
    assert.equal(l45.starting_level, 1);
    assert.notEqual(l12.starting_level, l45.starting_level);
    assert.equal(l12.total_xp, 0);
    assert.equal(l45.total_xp, 0);
  });
});

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

test("weight PR (40x8 -> 50x8) awards the single weight_pr reward of 350 XP", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench B", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 40, 8, t0);
    const set2 = await logSet(tx, user, ex, 50, 8, new Date(t0.getTime() + MINUTE));

    assert.equal(set2.comparison, "new_record");
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "weight_pr");
    assert.equal(rows[0].xp_amount, 350); // curve(10)=300 * diff(40)=1.0 + rel bonus round(10/40*200)=50
    assert.equal(rows[0].set_id, set2.set_id);

    const level = await levelRow(tx, user, MG.Chest);
    assert.equal(level.total_xp, 350);
    assert.equal(Number(level.best_weight_kg), 50);
  });
});

test("same-weight rep progression (100x5 -> 100x8) awards rep_pr ONLY (150 XP)", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench C", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 100, 5, t0);
    await logSet(tx, user, ex, 100, 8, new Date(t0.getTime() + MINUTE));

    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1, "must be exactly one reward (no double-count)");
    assert.equal(rows[0].reason, "rep_pr");
    assert.equal(rows[0].xp_amount, 150); // 3 improved reps x 50
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 150);
  });
});

test("worse performance awards nothing", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench D", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 50, 8, t0);
    const set2 = await logSet(tx, user, ex, 45, 5, new Date(t0.getTime() + MINUTE));

    assert.equal(set2.comparison, "no_record");
    assert.equal((await xpTransactions(tx, user)).length, 0);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 0);
  });
});

test("repeating the same performance awards nothing (duplicate submission)", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench E", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 100, 5, t0);
    await logSet(tx, user, ex, 100, 8, new Date(t0.getTime() + MINUTE));
    const dup = await logSet(tx, user, ex, 100, 8, new Date(t0.getTime() + 2 * MINUTE));

    assert.equal(dup.comparison, "matched_record");
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 150);
  });
});

test("replaying the same set (API retry) cannot double-award XP", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench F", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 40, 8, t0);
    const set2 = await logSet(tx, user, ex, 50, 8, new Date(t0.getTime() + MINUTE));

    // Retry the exact same set row (same set_id + reason) through award_exercise_xp.
    await tx.query(
      `SELECT * FROM award_exercise_xp($1, $2, $3, $4, NULL, 50, 8::smallint, $5, $6, 40, 8::smallint, $7)`,
      [user, ex, MG.Chest, set2.set_id, 63.33, 50.67, new Date(t0.getTime() + MINUTE)],
    );

    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].xp_amount, 350);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 350);
  });
});

test("more weight but weaker e1RM is gated deterministically (no reward)", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench G", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 120, 8, t0); // e1RM 152.00

    // Heavier but weaker (e1RM 150.00 < 152.00): no record, no reward.
    // Note: this still anchors metrics.best_weight_kg to 125 (heaviest logged lift).
    const s2 = await logSet(tx, user, ex, 125, 6, new Date(t0.getTime() + MINUTE));
    assert.equal(s2.comparison, "no_record");
    assert.equal((await xpTransactions(tx, user)).length, 0);

    // Now heavier AND stronger (e1RM 154.17 > 152.00). Because the heaviest
    // logged weight is already 125kg, this is classified as a rep_pr at that
    // weight: 6 -> 7 reps = +50 XP. Single reward, no weight_pr.
    const s3 = await logSet(tx, user, ex, 125, 7, new Date(t0.getTime() + 2 * MINUTE));
    assert.equal(s3.comparison, "new_record");
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "rep_pr");
    assert.equal(rows[0].xp_amount, 50);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 50);
  });
});

test("weight drop with a genuine e1RM gain awards a single performance reward", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench H", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 100, 5, t0); // e1RM 116.67
    const s2 = await logSet(tx, user, ex, 95, 8, new Date(t0.getTime() + MINUTE)); // e1RM 120.33

    assert.equal(s2.comparison, "new_record");
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "performance");
    assert.ok(rows[0].xp_amount > 0 && rows[0].xp_amount <= 60);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, rows[0].xp_amount);
  });
});

test("beginner and advanced improvements are both rewarded meaningfully", async () => {
  await withTx(async (tx) => {
    const uB = await createProfile(tx);
    const eB = await createExercise(tx, uB, "Beginner Lift", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, uB, eB, 40, 8, t0);
    await logSet(tx, uB, eB, 50, 8, new Date(t0.getTime() + MINUTE));
    const beginnerXp = (await xpTransactions(tx, uB))[0].xp_amount;

    const uA = await createProfile(tx);
    const eA = await createExercise(tx, uA, "Advanced Lift", MG.Chest);
    await logSet(tx, uA, eA, 120, 8, t0);
    await logSet(tx, uA, eA, 125, 8, new Date(t0.getTime() + MINUTE));
    const advancedXp = (await xpTransactions(tx, uA))[0].xp_amount;

    assert.equal(beginnerXp, 350);
    assert.equal(advancedXp, 233); // curve(5)=150 * 1.5 + rel bonus round(5/120*200)=8
    assert.ok(advancedXp > 0, "advanced improvements must still feel meaningful");
  });
});

test("multiple new-record sets in one workout each get their own reward", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex = await createExercise(tx, user, "Bench I", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 40, 8, t0);
    await logSet(tx, user, ex, 50, 8, new Date(t0.getTime() + MINUTE)); // +350
    await logSet(tx, user, ex, 52.5, 8, new Date(t0.getTime() + 2 * MINUTE));

    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.xp_amount), [350, 85]); // curve(2.5)=75 + rel bonus round(2.5/50*200)=10
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 435);
  });
});

// ---------------------------------------------------------------------------
// Level math / level-up
// ---------------------------------------------------------------------------

test("level-up crossing 500 preserves XP and starting level", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    await addPreferences(tx, user, [MG.Chest]);
    const ex = await createExercise(tx, user, "Bench J", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 40, 8, t0); // starting level 1, total 0
    await logSet(tx, user, ex, 50, 8, new Date(t0.getTime() + MINUTE)); // +350

    let chest = (await progression(tx, user)).find((p) => p.muscle_group_id === MG.Chest);
    assert.equal(chest.display_level, 1);
    assert.equal(chest.current_xp, 350);
    assert.equal(chest.next_level_xp, 500);
    assert.equal(Number(chest.progress_pct), 70.0);

    await logSet(tx, user, ex, 55, 8, new Date(t0.getTime() + 2 * MINUTE)); // +170 -> 520

    chest = (await progression(tx, user)).find((p) => p.muscle_group_id === MG.Chest);
    assert.equal(chest.total_xp, 520); // XP preserved across level-up
    assert.equal(chest.display_level, 2); // 1 + floor(520/500)
    assert.equal(chest.current_xp, 20); // 520 % 500
    assert.equal(Number(chest.progress_pct), 4.0);
    assert.equal(chest.starting_level, 1); // baseline untouched
  });
});

test("current level = startingLevel + floor(totalXp/500); progress uses totalXp % 500", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    await addPreferences(tx, user, [MG.Chest, MG.Triceps]);
    await tx.query(
      `INSERT INTO muscle_group_levels (user_id, muscle_group_id, total_xp, starting_level)
       VALUES ($1, 1, 0, 2), ($1, 5, 499, 2)`,
      [user],
    );

    let p = await progression(tx, user);
    assert.equal(p[0].display_level, 2); // 2 + 0/500
    assert.equal(p[0].current_xp, 0);
    assert.equal(Number(p[0].progress_pct), 0);
    assert.equal(p[1].display_level, 2); // 2 + 499/500
    assert.equal(p[1].current_xp, 499);
    assert.equal(Number(p[1].progress_pct), 99.8);

    await tx.query(
      "UPDATE muscle_group_levels SET total_xp = 500 WHERE user_id = $1 AND muscle_group_id = 1",
      [user],
    );
    await tx.query(
      "UPDATE muscle_group_levels SET total_xp = 1000 WHERE user_id = $1 AND muscle_group_id = 5",
      [user],
    );
    p = await progression(tx, user);
    assert.equal(p[0].display_level, 3); // 2 + 500/500
    assert.equal(p[0].current_xp, 0);
    assert.equal(p[1].display_level, 4); // 2 + 1000/500
    assert.equal(p[1].current_xp, 0);
  });
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

test("progression is isolated per muscle group", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    await addPreferences(tx, user, [MG.Chest, MG.Triceps]);
    const chestEx = await createExercise(tx, user, "Bench K", MG.Chest);
    const triEx = await createExercise(tx, user, "Pushdown", MG.Triceps);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, chestEx, 40, 8, t0);
    await logSet(tx, user, chestEx, 50, 8, new Date(t0.getTime() + MINUTE));
    await logSet(tx, user, triEx, 20, 8, new Date(t0.getTime() + 2 * MINUTE));
    await logSet(tx, user, triEx, 25, 8, new Date(t0.getTime() + 3 * MINUTE));

    const chest = await levelRow(tx, user, MG.Chest);
    const tri = await levelRow(tx, user, MG.Triceps);
    assert.equal(chest.total_xp, 350);
    assert.equal(chest.starting_level, 1);
    assert.equal(tri.total_xp, 200);
    assert.equal(tri.starting_level, 0);

    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].muscle_group_id, MG.Chest);
    assert.equal(rows[1].muscle_group_id, MG.Triceps);
  });
});

test("PR tracking is per-exercise while XP aggregates to the muscle group", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    const ex1 = await createExercise(tx, user, "Bench L", MG.Chest);
    const ex2 = await createExercise(tx, user, "Bench M", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex1, 40, 8, t0);
    await logSet(tx, user, ex1, 50, 8, new Date(t0.getTime() + MINUTE)); // +350 chest

    await logSet(tx, user, ex2, 60, 5, new Date(t0.getTime() + 2 * MINUTE)); // ex2 baseline, 0 XP
    assert.equal((await xpTransactions(tx, user)).length, 1);

    await logSet(tx, user, ex2, 60, 6, new Date(t0.getTime() + 3 * MINUTE)); // ex2 rep_pr +50
    const rows = await xpTransactions(tx, user);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].reason, "weight_pr");
    assert.equal(rows[0].xp_amount, 350);
    assert.equal(rows[1].reason, "rep_pr");
    assert.equal(rows[1].xp_amount, 50);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 400);
  });
});

// ---------------------------------------------------------------------------
// Existing-user migration
// ---------------------------------------------------------------------------

test("existing-user initialization preserves earned XP and is idempotent", async () => {
  await withTx(async (tx) => {
    const user = await createProfile(tx);
    await addPreferences(tx, user, [MG.Chest, MG.Back]);
    const ex = await createExercise(tx, user, "Bench N", MG.Chest);
    const t0 = new Date("2026-01-01T10:00:00Z");
    await logSet(tx, user, ex, 40, 8, t0); // baseline (creates chest level row via trigger)
    await logSet(tx, user, ex, 50, 8, new Date(t0.getTime() + MINUTE)); // +350

    await tx.query("SELECT initialize_muscle_group_levels($1)", [user]);

    const chest = await levelRow(tx, user, MG.Chest);
    assert.equal(chest.total_xp, 350, "earned XP must be preserved");
    assert.equal(chest.starting_level, 1);
    assert.equal(Number(chest.starting_weight_kg), 40);

    const back = await levelRow(tx, user, MG.Back);
    assert.equal(back.total_xp, 0, "no historical data -> no inflated XP");
    assert.equal(back.starting_level, 0);

    const init = (await xpTransactions(tx, user)).filter(
      (r) => r.reason === "initialization",
    );
    assert.equal(init.length, 1); // only the muscle with no trigger-created row
    assert.equal(init[0].xp_amount, 0, "baseline initialization adds no XP");
    assert.equal(init[0].muscle_group_id, MG.Back);

    // Re-running migration must be a no-op.
    await tx.query("SELECT initialize_muscle_group_levels($1)", [user]);
    assert.equal((await levelRow(tx, user, MG.Chest)).total_xp, 350);
    assert.equal(
      (await xpTransactions(tx, user)).filter((r) => r.reason === "initialization")
        .length,
      1,
    );
  });
});