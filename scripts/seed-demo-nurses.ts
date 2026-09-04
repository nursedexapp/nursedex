/**
 * Demo nurse seed script.
 *
 * Creates 15 realistic-looking demo nurse profiles with is_seed=true so
 * the directory doesn't look empty on launch day. Idempotent: re-runs
 * skip emails that already exist.
 *
 * Usage:
 *   1. Pull production env (or your local) into a shell:
 *      export NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
 *      export SUPABASE_SECRET_KEY=eyJ...   (the service role key)
 *   2. Run:
 *      npx tsx scripts/seed-demo-nurses.ts
 *
 * The seed nurses use noreply+seed-N@nursedex.com style emails so they
 * never collide with real signups, and a fixed throwaway password.
 * They go in as verification_status='verified', tier varies, and each
 * gets a DiceBear initials PNG uploaded to the nurse-photos bucket so
 * the directory has visual variety. Credentials, care types, and zip
 * codes span Suffolk, Nassau, and Queens so search results feel
 * populated. Re-runs are idempotent (auth user, profile, and avatar
 * upload all upsert).
 */

import { createClient } from "@supabase/supabase-js";

import { unwrapOrThrow } from "@/lib/db/results";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in env.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_PASSWORD = "DemoSeed!2026"; // throwaway; seed nurses never log in

interface SeedNurse {
  email: string;
  first_name: string;
  last_name: string;
  zip_code: string;
  credential: "hha" | "cna" | "lpn" | "rn" | "np";
  primary_care_type: string;
  care_types: string[];
  skills: string[];
  languages: string[];
  gender: "female" | "male" | "non_binary";
  years_experience: number;
  rate_min: number;
  rate_max: number;
  bio: string;
  tier: "free" | "featured";
  availability_commitment: string[];
  time_slots: string[];
  travel_radius_miles: number;
  has_transportation: boolean;
  covid_vaccinated: boolean;
  is_available: boolean;
}

const SEED_NURSES: SeedNurse[] = [
  {
    email: "noreply+seed-01@nursedex.com",
    first_name: "Maria",
    last_name: "Hernandez",
    zip_code: "11779",
    credential: "rn",
    primary_care_type: "elderly",
    care_types: ["elderly", "memory_care"],
    skills: ["medication_management", "vital_signs", "mobility_assistance"],
    languages: ["English", "Spanish"],
    gender: "female",
    years_experience: 12,
    rate_min: 45,
    rate_max: 55,
    bio: "Twelve years caring for Long Island families with a focus on elderly and memory care. Bilingual in English and Spanish.",
    tier: "featured",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "evenings"],
    travel_radius_miles: 15,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-02@nursedex.com",
    first_name: "James",
    last_name: "O'Brien",
    zip_code: "11743",
    credential: "lpn",
    primary_care_type: "post_surgical",
    care_types: ["post_surgical", "wound_care"],
    skills: ["medication_management", "vital_signs", "iv_therapy"],
    languages: ["English"],
    gender: "male",
    years_experience: 8,
    rate_min: 40,
    rate_max: 50,
    bio: "LPN specializing in post-surgical recovery and wound care. Calm, methodical, and thorough.",
    tier: "free",
    availability_commitment: ["per_diem"],
    time_slots: ["weekdays", "weekends"],
    travel_radius_miles: 20,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-03@nursedex.com",
    first_name: "Priya",
    last_name: "Patel",
    zip_code: "11020",
    credential: "rn",
    primary_care_type: "pediatric",
    care_types: ["pediatric", "postpartum"],
    skills: ["medication_management", "vital_signs", "companionship"],
    languages: ["English", "Hindi", "Gujarati"],
    gender: "female",
    years_experience: 9,
    rate_min: 50,
    rate_max: 65,
    bio: "Pediatric and postpartum RN. Worked with families across Nassau County for nearly a decade.",
    tier: "featured",
    availability_commitment: ["part_time"],
    time_slots: ["weekdays"],
    travel_radius_miles: 12,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-04@nursedex.com",
    first_name: "Aisha",
    last_name: "Williams",
    zip_code: "11550",
    credential: "cna",
    primary_care_type: "elderly",
    care_types: ["elderly", "disability"],
    skills: ["bathing_hygiene", "mobility_assistance", "meal_preparation"],
    languages: ["English"],
    gender: "female",
    years_experience: 5,
    rate_min: 28,
    rate_max: 35,
    bio: "Hands-on CNA with experience supporting both elderly clients and adults with disabilities. Patient and warm.",
    tier: "free",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "evenings", "overnights"],
    travel_radius_miles: 10,
    has_transportation: false,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-05@nursedex.com",
    first_name: "David",
    last_name: "Chen",
    zip_code: "11375",
    credential: "np",
    primary_care_type: "chronic_illness",
    care_types: ["chronic_illness", "elderly"],
    skills: ["medication_management", "vital_signs", "diabetes_management"],
    languages: ["English", "Mandarin"],
    gender: "male",
    years_experience: 15,
    rate_min: 75,
    rate_max: 95,
    bio: "Nurse Practitioner with fifteen years of chronic illness management. Diabetes, hypertension, complex medication regimens.",
    tier: "featured",
    availability_commitment: ["per_diem"],
    time_slots: ["weekdays"],
    travel_radius_miles: 15,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-06@nursedex.com",
    first_name: "Sarah",
    last_name: "Mitchell",
    zip_code: "11717",
    credential: "rn",
    primary_care_type: "hospice",
    care_types: ["hospice", "memory_care"],
    skills: ["medication_management", "vital_signs", "dementia_care"],
    languages: ["English"],
    gender: "female",
    years_experience: 18,
    rate_min: 50,
    rate_max: 65,
    bio: "Hospice and memory care RN. Eighteen years walking families through end-of-life and dementia care with dignity.",
    tier: "featured",
    availability_commitment: ["part_time"],
    time_slots: ["weekdays", "weekends"],
    travel_radius_miles: 18,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-07@nursedex.com",
    first_name: "Carlos",
    last_name: "Reyes",
    zip_code: "11757",
    credential: "hha",
    primary_care_type: "elderly",
    care_types: ["elderly"],
    skills: ["bathing_hygiene", "meal_preparation", "transportation"],
    languages: ["English", "Spanish"],
    gender: "male",
    years_experience: 6,
    rate_min: 22,
    rate_max: 28,
    bio: "Home Health Aide focused on elderly clients. Strong, kind, and dependable.",
    tier: "free",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "evenings"],
    travel_radius_miles: 8,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-08@nursedex.com",
    first_name: "Rebecca",
    last_name: "Goldberg",
    zip_code: "11030",
    credential: "rn",
    primary_care_type: "postpartum",
    care_types: ["postpartum", "pediatric"],
    skills: ["vital_signs", "companionship", "medication_management"],
    languages: ["English", "Hebrew"],
    gender: "female",
    years_experience: 7,
    rate_min: 55,
    rate_max: 75,
    bio: "Postpartum doula and RN. Specialized lactation support and newborn care. Available days.",
    tier: "featured",
    availability_commitment: ["per_diem"],
    time_slots: ["weekdays"],
    travel_radius_miles: 15,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-09@nursedex.com",
    first_name: "Linda",
    last_name: "Thompson",
    zip_code: "11722",
    credential: "lpn",
    primary_care_type: "rehabilitation",
    care_types: ["rehabilitation", "post_surgical"],
    skills: [
      "mobility_assistance",
      "physical_therapy_support",
      "medication_management",
    ],
    languages: ["English"],
    gender: "female",
    years_experience: 11,
    rate_min: 38,
    rate_max: 48,
    bio: "LPN with a rehab background. Helps clients regain mobility and independence after surgery or injury.",
    tier: "free",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "evenings"],
    travel_radius_miles: 20,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-10@nursedex.com",
    first_name: "Marcus",
    last_name: "Jackson",
    zip_code: "11104",
    credential: "cna",
    primary_care_type: "disability",
    care_types: ["disability", "chronic_illness"],
    skills: ["bathing_hygiene", "mobility_assistance", "vital_signs"],
    languages: ["English"],
    gender: "male",
    years_experience: 4,
    rate_min: 26,
    rate_max: 32,
    bio: "CNA in Queens supporting adults with disabilities and chronic conditions. Open and easy to work with.",
    tier: "free",
    availability_commitment: ["full_time", "per_diem"],
    time_slots: ["weekdays", "weekends"],
    travel_radius_miles: 12,
    has_transportation: false,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-11@nursedex.com",
    first_name: "Olivia",
    last_name: "Nguyen",
    zip_code: "11787",
    credential: "rn",
    primary_care_type: "memory_care",
    care_types: ["memory_care", "elderly"],
    skills: ["medication_management", "dementia_care", "vital_signs"],
    languages: ["English", "Vietnamese"],
    gender: "female",
    years_experience: 10,
    rate_min: 48,
    rate_max: 60,
    bio: "Memory care RN with a decade of experience helping families manage Alzheimer's and dementia at home.",
    tier: "featured",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "overnights"],
    travel_radius_miles: 14,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: false,
  },
  {
    email: "noreply+seed-12@nursedex.com",
    first_name: "Daniel",
    last_name: "Kowalski",
    zip_code: "11791",
    credential: "lpn",
    primary_care_type: "elderly",
    care_types: ["elderly", "post_surgical"],
    skills: ["medication_management", "iv_therapy", "mobility_assistance"],
    languages: ["English", "Polish"],
    gender: "male",
    years_experience: 13,
    rate_min: 42,
    rate_max: 52,
    bio: "Polish-speaking LPN. Steady, patient, and detail-oriented with thirteen years on Long Island.",
    tier: "free",
    availability_commitment: ["part_time"],
    time_slots: ["weekdays"],
    travel_radius_miles: 18,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-13@nursedex.com",
    first_name: "Natalie",
    last_name: "Brennan",
    zip_code: "11731",
    credential: "rn",
    primary_care_type: "pediatric",
    care_types: ["pediatric"],
    skills: ["vital_signs", "medication_management", "cpr_first_aid"],
    languages: ["English"],
    gender: "female",
    years_experience: 6,
    rate_min: 50,
    rate_max: 65,
    bio: "Pediatric RN. Comfortable with medically complex kids and special-needs care plans.",
    tier: "featured",
    availability_commitment: ["per_diem"],
    time_slots: ["weekdays", "evenings"],
    travel_radius_miles: 16,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-14@nursedex.com",
    first_name: "Aaliyah",
    last_name: "Robinson",
    zip_code: "11553",
    credential: "hha",
    primary_care_type: "elderly",
    care_types: ["elderly", "memory_care"],
    skills: ["bathing_hygiene", "meal_preparation", "companionship"],
    languages: ["English"],
    gender: "female",
    years_experience: 3,
    rate_min: 22,
    rate_max: 28,
    bio: "HHA helping families in Nassau County keep loved ones at home. Cheerful and dependable.",
    tier: "free",
    availability_commitment: ["full_time"],
    time_slots: ["weekdays", "weekends"],
    travel_radius_miles: 10,
    has_transportation: false,
    covid_vaccinated: true,
    is_available: true,
  },
  {
    email: "noreply+seed-15@nursedex.com",
    first_name: "Thomas",
    last_name: "Anderson",
    zip_code: "11772",
    credential: "np",
    primary_care_type: "post_surgical",
    care_types: ["post_surgical", "wound_care"],
    skills: [
      "medication_management",
      "vital_signs",
      "iv_therapy",
      "catheter_care",
    ],
    languages: ["English"],
    gender: "male",
    years_experience: 20,
    rate_min: 80,
    rate_max: 100,
    bio: "Twenty-year Nurse Practitioner. Complex post-surgical care and wound management; weekends only.",
    tier: "featured",
    availability_commitment: ["per_diem"],
    time_slots: ["weekends", "weekends"],
    travel_radius_miles: 25,
    has_transportation: true,
    covid_vaccinated: true,
    is_available: true,
  },
];

function slugify(first: string, last: string, credential: string): string {
  return `${first}-${last}-${credential}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

const PHOTO_BUCKET = "nurse-photos";

// Brand teals for DiceBear background. The seed string deterministically
// picks one of these per nurse so the directory has visual variety
// without anyone looking obviously off brand.
const AVATAR_BG_PALETTE = "2a7b6f,1f5c53,3a9b8d,8baf9d";

async function fetchAvatarPng(first: string, last: string): Promise<Buffer> {
  const seed = `${first} ${last}`;
  const url =
    `https://api.dicebear.com/9.x/initials/png` +
    `?seed=${encodeURIComponent(seed)}` +
    `&backgroundColor=${AVATAR_BG_PALETTE}` +
    `&textColor=ffffff` +
    `&size=400` +
    `&fontWeight=600`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DiceBear fetch failed (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadSeedAvatar(userId: string, png: Buffer): Promise<string> {
  const path = `${userId}/seed-avatar.png`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) {
    throw new Error(`storage upload failed: ${error.message}`);
  }
  return path;
}

async function seedOne(nurse: SeedNurse, index: number): Promise<void> {
  const tag = `[seed ${String(index + 1).padStart(2, "0")}]`;

  // Check if user with this email already exists.
  // A failed read is NOT "this seed nurse does not exist yet" (#847). It would
  // create a second account for the same address on every run.
  const existing = await unwrapOrThrow(
    supabase
      .from("users")
      .select("id, role")
      .eq("email", nurse.email)
      .maybeSingle(),
    "an existing account for this seed nurse",
  );

  let userId = existing?.id as string | undefined;

  if (!userId) {
    const { data: created, error: authError } =
      await supabase.auth.admin.createUser({
        email: nurse.email,
        password: SEED_PASSWORD,
        email_confirm: true,
      });
    if (authError || !created.user) {
      console.error(tag, "auth.createUser failed:", authError?.message);
      return;
    }
    userId = created.user.id;
    console.log(tag, "created auth user", nurse.email);
  } else {
    console.log(tag, "user already exists, will update profile");
  }

  // Upsert public.users (the trigger may have inserted a stub already).
  const { error: userErr } = await supabase
    .from("users")
    .update({
      first_name: nurse.first_name,
      last_name: nurse.last_name,
      role: "nurse",
      zip_code: nurse.zip_code,
    })
    .eq("id", userId);
  if (userErr) {
    console.error(tag, "users update failed:", userErr.message);
    return;
  }

  const slug = slugify(nurse.first_name, nurse.last_name, nurse.credential);

  let avatarPath: string | null = null;
  try {
    const png = await fetchAvatarPng(nurse.first_name, nurse.last_name);
    avatarPath = await uploadSeedAvatar(userId, png);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(tag, "avatar generation skipped:", msg);
  }

  // Upsert nurse_profiles.
  const { error: profileErr } = await supabase.from("nurse_profiles").upsert(
    {
      user_id: userId,
      slug,
      credential: nurse.credential,
      primary_care_type: nurse.primary_care_type,
      care_types: nurse.care_types,
      skills: nurse.skills,
      languages: nurse.languages,
      gender: nurse.gender,
      years_experience: nurse.years_experience,
      rate_min: nurse.rate_min,
      rate_max: nurse.rate_max,
      bio: nurse.bio,
      tier: nurse.tier,
      availability_commitment: nurse.availability_commitment,
      time_slots: nurse.time_slots,
      travel_radius_miles: nurse.travel_radius_miles,
      has_transportation: nurse.has_transportation,
      covid_vaccinated: nurse.covid_vaccinated,
      is_available: nurse.is_available,
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      is_seed: true,
      photos: avatarPath ? [avatarPath] : [],
      has_photo: avatarPath !== null,
    },
    { onConflict: "user_id" },
  );
  if (profileErr) {
    console.error(tag, "nurse_profiles upsert failed:", profileErr.message);
    return;
  }

  console.log(
    tag,
    "ok",
    `${nurse.first_name} ${nurse.last_name}, ${nurse.credential.toUpperCase()}`,
  );
}

async function main(): Promise<void> {
  console.log(`Seeding ${SEED_NURSES.length} demo nurses...`);
  for (let i = 0; i < SEED_NURSES.length; i++) {
    await seedOne(SEED_NURSES[i], i);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
