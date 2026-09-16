require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const { createClerkClient, verifyToken } = require("@clerk/backend");

const PORT = Number(process.env.PORT || 3000);
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

const app = express();
app.use(express.json());

// Request logger so we can see what the phone actually sends.
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    database: Boolean(process.env.DATABASE_URL),
    clerk: Boolean(CLERK_SECRET_KEY),
  });
});

// Authenticated with a Clerk session token (sent as `Authorization: Bearer ...`).
// Verifies the JWT, then upserts the Clerk user into the Neon `profiles` table.
app.post("/api/sync-user", async (req, res) => {
  if (!CLERK_SECRET_KEY) {
    return res
      .status(503)
      .json({ error: "CLERK_SECRET_KEY is not configured on the server" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const clerkId = claims.sub;

    const user = await clerk.users.getUser(clerkId);
    const email = user.primaryEmailAddress?.emailAddress ?? null;
    const displayName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : (user.firstName ?? user.username ?? null);
    const avatarUrl = user.imageUrl ?? null;

    const { rows } = await pool.query(
      `INSERT INTO profiles (clerk_id, email, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
         updated_at = now()
       RETURNING id, clerk_id, email, display_name, avatar_url, created_at, updated_at`,
      [clerkId, email, displayName, avatarUrl],
    );

    res.json({ profile: rows[0] });
  } catch (err) {
    console.error("sync-user error:", err);
    if (err.message && /invalid|unexpected token|jwt/i.test(err.message)) {
      return res.status(401).json({ error: "Invalid session token" });
    }
    res.status(500).json({ error: "Failed to sync user" });
  }
});

app.listen(PORT, () => {
  console.log(`BeastPR API listening on :${PORT}`);
});

// Authenticated endpoint that collects the pre-login onboarding answers
// (primary goal + weekly routine + starting bodyweight + reminder cadence)
// and persists them to the profile the moment the user signs up.
app.post("/api/onboarding-complete", async (req, res) => {
  if (!CLERK_SECRET_KEY) {
    return res
      .status(503)
      .json({ error: "CLERK_SECRET_KEY is not configured on the server" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const clerkId = claims.sub;

    const { goal, days, schedule, bodyweightKg, bodyweightUnit, reminderDays, timezone } =
      req.body || {};

    if (!goal || !["Strength", "Aesthetic", "Endurance"].includes(goal)) {
      return res
        .status(400)
        .json({ error: "goal must be one of Strength, Aesthetic, Endurance" });
    }

    const goalPayload = JSON.stringify({
      days: Array.isArray(days) ? days : [],
      schedule: schedule && typeof schedule === "object" ? schedule : {},
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Ensure a profile row exists under this Clerk user.
      const user = await clerk.users.getUser(clerkId);
      const email = user.primaryEmailAddress?.emailAddress ?? null;
      const displayName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : (user.firstName ?? user.username ?? null);
      const avatarUrl = user.imageUrl ?? null;

      const { rows: profileRows } = await client.query(
        `INSERT INTO profiles (clerk_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (clerk_id) DO UPDATE SET
           email = EXCLUDED.email,
           display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
           avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
           updated_at = now()
         RETURNING id`,
        [clerkId, email, displayName, avatarUrl],
      );
      const profileId = profileRows[0].id;

      // Resolve the chosen muscle names to ids, in first-appearance order.
      const { rows: muscleRows } = await client.query(
        "SELECT id, name FROM muscle_groups",
      );
      const idByName = new Map(muscleRows.map((m) => [m.name, m.id]));
      const uniqueIds = [];
      const seen = new Set();
      for (const day of Array.isArray(days) ? days : []) {
        for (const muscle of schedule?.[day] ?? []) {
          const id = idByName.get(muscle);
          if (id && !seen.has(id)) {
            seen.add(id);
            uniqueIds.push(id);
          }
        }
      }

      const unit = bodyweightUnit === "lb" ? "lb" : "kg";
      const bw = Number(bodyweightKg);
      const bodyweight =
        bodyweightKg != null && Number.isFinite(bw) ? bw : null;
      const tz =
        timezone && typeof timezone === "string" && timezone.length <= 64
          ? timezone
          : "UTC";

      await client.query(
        `SELECT * FROM complete_onboarding($1, $2::smallint[], $3, $4, $5)`,
        [profileId, uniqueIds.length ? uniqueIds : null, unit, bodyweight, tz],
      );

      await client.query(
        `UPDATE profiles
         SET primary_goal = $2,
             workout_routine = $3::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [profileId, goal, goalPayload],
      );

      const reminder = Number(reminderDays);
      if (Number.isInteger(reminder) && reminder > 0) {
        await client.query(
          `UPDATE user_settings
           SET bodyweight_reminder_enabled = true,
               reminder_interval_days = $2,
               updated_at = now()
           WHERE user_id = $1`,
          [profileId, reminder],
        );
      }

      await client.query("COMMIT");
      res.json({ profile: { id: profileId } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("onboarding-complete error:", err);
    if (err.message && /invalid|unexpected token|jwt/i.test(err.message)) {
      return res.status(401).json({ error: "Invalid session token" });
    }
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

// Returns the authenticated user's profile row, including the workout plan
// (primary_goal + workout_routine) that the dashboard renders.
app.get("/api/profile", async (req, res) => {
  if (!CLERK_SECRET_KEY) {
    return res
      .status(503)
      .json({ error: "CLERK_SECRET_KEY is not configured on the server" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const { rows } = await pool.query(
      `SELECT id, clerk_id, email, display_name, avatar_url,
              preferred_unit, timezone, primary_goal, workout_routine,
              onboarding_completed_at, created_at, updated_at
       FROM profiles
       WHERE clerk_id = $1`,
      [claims.sub],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({ profile: rows[0] });
  } catch (err) {
    console.error("profile error:", err);
    if (err.message && /invalid|unexpected token|jwt/i.test(err.message)) {
      return res.status(401).json({ error: "Invalid session token" });
    }
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// Verifies the Bearer token and returns the Neon profile id for the signed-in
// user, or null (after writing an error response) when authentication fails.
async function requireProfileId(req, res) {
  if (!CLERK_SECRET_KEY) {
    res
      .status(503)
      .json({ error: "CLERK_SECRET_KEY is not configured on the server" });
    return null;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return null;
  }

  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const { rows } = await pool.query(
      "SELECT id FROM profiles WHERE clerk_id = $1",
      [claims.sub],
    );
    if (!rows.length) {
      res.status(404).json({ error: "Profile not found" });
      return null;
    }
    return rows[0].id;
  } catch (err) {
    console.error("auth error:", err);
    if (err.message && /invalid|unexpected token|jwt/i.test(err.message)) {
      res.status(401).json({ error: "Invalid session token" });
    } else {
      res.status(500).json({ error: "Failed to authenticate" });
    }
    return null;
  }
}

// Returns all muscle groups (used by the settings routine editor).
app.get("/api/muscle-groups", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, display_order, is_primary_goal
       FROM muscle_groups
       ORDER BY display_order`,
    );
    res.json({ muscleGroups: rows });
  } catch (err) {
    console.error("muscle-groups error:", err);
    res.status(500).json({ error: "Failed to load muscle groups" });
  }
});

// Saves the user's weekly workout routine schedule to the profile.
// Body: { schedule: { "Monday": ["Chest", "Back"], ... } }
app.put("/api/profile/routine", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  const { schedule } = req.body || {};
  if (!schedule || typeof schedule !== "object") {
    return res.status(400).json({ error: "schedule object is required" });
  }

  const days = Object.keys(schedule);
  const payload = JSON.stringify({ days, schedule });

  try {
    const { rows } = await pool.query(
      `UPDATE profiles
       SET workout_routine = $2::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING workout_routine`,
      [profileId, payload],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({ workout_routine: rows[0].workout_routine });
  } catch (err) {
    console.error("routine error:", err);
    res.status(500).json({ error: "Failed to save routine" });
  }
});

// Returns the exercise library (built-ins, filtered to the requested muscle
// groups by name/slug) annotated with the signed-in user's PR metrics.
// `?muscles=Chest,Triceps` filters by muscle group name or slug;
// `?ids=<uuid>,<uuid>` returns specific exercises regardless of muscle group.
app.get("/api/exercises", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  const requested = String(req.query.muscles ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const requestedIds = String(req.query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.name, e.slug, e.is_compound, e.equipment,
              e.primary_muscle_group_id, mg.name AS muscle_name,
              m.best_1rm, m.pr_count, m.last_performed_at, m.relative_strength,
              pl.weight AS pr_weight, pl.unit AS pr_unit, pl.reps AS pr_reps,
              pl.achieved_at AS pr_achieved_at
       FROM exercises e
       JOIN muscle_groups mg ON mg.id = e.primary_muscle_group_id
       LEFT JOIN user_exercise_metrics m
         ON m.exercise_id = e.id AND m.user_id = $1
       LEFT JOIN LATERAL (
         SELECT pl2.weight, pl2.unit, pl2.reps, pl2.achieved_at
         FROM pr_logs pl2
         WHERE pl2.user_id = $1 AND pl2.exercise_id = e.id AND pl2.is_new_best = true
         ORDER BY pl2.achieved_at DESC
         LIMIT 1
       ) pl ON true
       WHERE e.is_active = true
         AND (e.owner_id IS NULL OR e.owner_id = $1)
         AND ($2::text[] IS NULL OR mg.name = ANY($2::text[]) OR mg.slug = ANY($2::text[]))
         AND ($3::text[] IS NULL OR e.id::text = ANY($3::text[]))
       ORDER BY mg.display_order, e.name`,
      [
        profileId,
        requested.length ? requested : null,
        requestedIds.length ? requestedIds : null,
      ],
    );
    res.json({ exercises: rows });
  } catch (err) {
    console.error("exercises error:", err);
    res.status(500).json({ error: "Failed to load exercises" });
  }
});

// Returns the logged top sets / PR history for a single exercise.
app.get("/api/exercises/:id/history", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM get_exercise_history($1, $2)",
      [profileId, req.params.id],
    );
    res.json({ history: rows });
  } catch (err) {
    console.error("exercise-history error:", err);
    res.status(500).json({ error: "Failed to load exercise history" });
  }
});

// Logs a top set for an exercise. `log_top_set` writes the workout set and the
// before-insert triggers evaluate whether it's a new best (pr_logs) and update
// the user's aggregate metrics (user_exercise_metrics).
app.post("/api/pr", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  const { exerciseId, weight, reps, unit } = req.body || {};

  const parsedWeight = Number(weight);
  const parsedReps = Number(reps);
  const parsedUnit = unit === "lb" ? "lb" : "kg";

  if (!exerciseId || typeof exerciseId !== "string") {
    return res.status(400).json({ error: "exerciseId is required" });
  }
  if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
    return res.status(400).json({ error: "weight must be a positive number" });
  }
  if (!Number.isInteger(parsedReps) || parsedReps <= 0 || parsedReps > 1000) {
    return res.status(400).json({ error: "reps must be a positive integer" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM log_top_set($1, $2, $3, $4, $5::unit_type)`,
      [profileId, exerciseId, parsedWeight, parsedReps, parsedUnit],
    );

    const { rows: metricRows } = await pool.query(
      `SELECT best_1rm, pr_count, last_performed_at, relative_strength
       FROM user_exercise_metrics
       WHERE user_id = $1 AND exercise_id = $2`,
      [profileId, exerciseId],
    );

    res.json({
      set: rows[0],
      metric: metricRows[0] ?? null,
    });
  } catch (err) {
    console.error("log-pr error:", err);
    if (err.message && /foreign key/i.test(err.message)) {
      return res.status(400).json({ error: "Unknown exerciseId" });
    }
    res.status(500).json({ error: "Failed to log set" });
  }
});

// Feed behind the dashboard's "Latest Personal Records" section.
app.get("/api/prs/latest", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  try {
    const { rows } = await pool.query("SELECT * FROM get_dashboard_feed($1)", [
      profileId,
    ]);
    res.json({ records: rows });
  } catch (err) {
    console.error("prs-latest error:", err);
    res.status(500).json({ error: "Failed to load latest PRs" });
  }
});

// Muscle-group progression levels + XP progress for the "Let's Hit" card.
app.get("/api/progression", async (req, res) => {
  const profileId = await requireProfileId(req, res);
  if (!profileId) return;

  try {
    const { rows } = await pool.query("SELECT * FROM get_muscle_progression($1)", [
      profileId,
    ]);
    res.json({ progression: rows });
  } catch (err) {
    console.error("progression error:", err);
    res.status(500).json({ error: "Failed to load progression" });
  }
});

