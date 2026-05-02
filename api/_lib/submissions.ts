import { sanitizeEditableText } from "../../shared/admin-management.js";
import { isServerSourceType, normalizeSourceTypeOrNull } from "../../shared/source-types.js";
import type { AuthContext } from "./session.js";
import { supabaseAdmin } from "./server.js";
import { getStaticSubmitSourcesForUsername } from "./static-mmm-leaderboard.js";
import { applyStaticManualOverridesToSubmitSources } from "./static-mmm-overrides.js";

type SubmissionType = "edit-existing-source" | "add-new-source";
type SubmissionStatus = "pending" | "approved" | "rejected";

type SubmitSourceRow = {
  sourceId: string;
  sourceSlug: string;
  sourceName: string;
  sourceType: string;
  sourceScope: string;
  logoUrl: string | null;
  currentBlocks: number;
  rank: number;
  lastUpdated: string;
};

type SubmissionRow = {
  id: string;
  user_id: string;
  minecraft_uuid_hash: string;
  minecraft_username: string;
  submission_type: SubmissionType;
  target_source_id: string | null;
  target_source_slug: string | null;
  source_name: string;
  source_type: string;
  old_blocks_mined: number | null;
  submitted_blocks_mined: number;
  proof_file_name: string;
  proof_mime_type: string;
  proof_size: number;
  proof_image_ref: string;
  logo_url: string | null;
  payload?: Record<string, unknown> | null;
  status: SubmissionStatus;
  created_at: string;
};

type SubmittedPlayerRow = {
  username: string;
  blocksMined: number;
};

export class SubmissionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SubmissionError";
    this.status = status;
  }
}

function mapSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    minecraftUuidHash: row.minecraft_uuid_hash,
    minecraftUsername: row.minecraft_username,
    type: row.submission_type,
    targetSourceId: row.target_source_id,
    targetSourceSlug: row.target_source_slug,
    sourceName: row.source_name,
    sourceType: row.source_type,
    oldBlocksMined: row.old_blocks_mined,
    submittedBlocksMined: row.submitted_blocks_mined,
    proofFileName: row.proof_file_name,
    proofMimeType: row.proof_mime_type,
    proofSize: row.proof_size,
    proofImageRef: row.proof_image_ref,
    logoUrl: row.logo_url,
    playerRows: readSubmittedPlayerRows(row),
    status: row.status,
    createdAt: row.created_at,
  };
}

function safeNumber(input: FormDataEntryValue | null, label: string) {
  const value = typeof input === "string" ? Number(input.trim()) : Number.NaN;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new SubmissionError(`${label} must be a valid non-negative whole number.`, 400);
  }
  return value;
}

function positiveNumber(input: unknown, label: string) {
  const value = typeof input === "string" || typeof input === "number" ? Number(String(input).trim()) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new SubmissionError(`${label} must be a valid positive whole number.`, 400);
  }
  return value;
}

function parseSubmittedPlayerRows(input: FormDataEntryValue | null) {
  if (typeof input !== "string" || !input.trim()) {
    return [];
  }

  let rawRows: unknown;
  try {
    rawRows = JSON.parse(input);
  } catch {
    throw new SubmissionError("Player rows are invalid.", 400);
  }

  if (!Array.isArray(rawRows)) {
    throw new SubmissionError("Player rows are invalid.", 400);
  }

  if (rawRows.length > 50) {
    throw new SubmissionError("A source submission can include at most 50 players.", 400);
  }

  const rows = rawRows.map((row, index) => {
    const record = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    if (!username) {
      throw new SubmissionError(`Player ${index + 1} name is required.`, 400);
    }
    return {
      username,
      blocksMined: positiveNumber(record.blocksMined, `Player ${index + 1} blocks mined`),
    };
  });

  const seen = new Set<string>();
  return rows.map((row) => {
    const key = row.username.toLowerCase();
    if (seen.has(key)) {
      throw new SubmissionError(`Duplicate player "${row.username}" in submission.`, 400);
    }
    seen.add(key);
    return row;
  });
}

function readSubmittedPlayerRows(row: Pick<SubmissionRow, "payload" | "minecraft_username" | "submitted_blocks_mined">): SubmittedPlayerRow[] {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const playerRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  const rows = playerRows.flatMap((entry): SubmittedPlayerRow[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const username = sanitizeEditableText(String(record.username ?? ""), 32);
    const blocksMined = Number(record.blocksMined ?? 0);
    return username && Number.isFinite(blocksMined) && blocksMined > 0
      ? [{ username, blocksMined: Math.floor(blocksMined) }]
      : [];
  });

  if (rows.length > 0) {
    return rows;
  }

  return [{
    username: row.minecraft_username,
    blocksMined: Number(row.submitted_blocks_mined ?? 0),
  }];
}

function isServerSubmission(type: string) {
  return isServerSourceType(type);
}

function sourceType(input: FormDataEntryValue | null) {
  const value = normalizeSourceTypeOrNull(sanitizeEditableText(typeof input === "string" ? input : "", 40));
  if (!value) {
    throw new SubmissionError("Choose a valid source type.", 400);
  }
  return value;
}

function requireLinkedMinecraft(auth: AuthContext) {
  const username = sanitizeEditableText(auth.viewer.minecraftUsername, 32);
  if (!auth.viewer.minecraftUuidHash || !username) {
    throw new SubmissionError("Link an approved Minecraft profile before submitting updates.", 403);
  }
  return {
    minecraftUuidHash: auth.viewer.minecraftUuidHash,
    minecraftUsername: username,
  };
}

async function proofFromForm(formData: FormData) {
  const proof = formData.get("proof");
  if (!(proof instanceof File)) {
    throw new SubmissionError("Image proof is required.", 400);
  }

  const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowedMimeTypes.has(proof.type)) {
    throw new SubmissionError("Proof must be a PNG, JPG, JPEG, or WEBP image.", 400);
  }

  const maxBytes = 2_500_000;
  if (proof.size <= 0) {
    throw new SubmissionError("Proof image is empty.", 400);
  }
  if (proof.size > maxBytes) {
    throw new SubmissionError("Proof image must be 2.5 MB or smaller.", 400);
  }

  const bytes = new Uint8Array(await proof.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return {
    fileName: sanitizeEditableText(proof.name || "proof-image", 120),
    mimeType: proof.type,
    size: proof.size,
    dataUrl: `data:${proof.type};base64,${btoa(binary)}`,
  };
}

export async function listSubmissionPageData(auth: AuthContext) {
  const linked = requireLinkedMinecraft(auth);
  const existingSources = await applyStaticManualOverridesToSubmitSources(
    getStaticSubmitSourcesForUsername(linked.minecraftUsername),
    linked.minecraftUsername,
  );

  const { data, error } = await supabaseAdmin
    .from("mmm_submissions")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    throw error;
  }

  return {
    ok: true as const,
    player: linked,
    existingSources,
    submissions: ((data ?? []) as SubmissionRow[]).map(mapSubmission),
  };
}

function findEditableSource(sourceId: string, sources: SubmitSourceRow[]) {
  const source = sources.find((candidate) => candidate.sourceId === sourceId);
  if (!source) {
    throw new SubmissionError("You can only submit edits for sources where your linked player already exists.", 403);
  }
  return source;
}

export async function submitUpdate(auth: AuthContext, formData: FormData) {
  const linked = requireLinkedMinecraft(auth);
  const proof = await proofFromForm(formData);
  const action = sanitizeEditableText(String(formData.get("type") ?? ""), 40) as SubmissionType;
  const blocksMined = safeNumber(formData.get("blocksMined"), "Blocks mined");
  const now = new Date().toISOString();

  if (action === "edit-existing-source") {
    const sourceId = sanitizeEditableText(String(formData.get("sourceId") ?? ""), 160);
    if (!sourceId) {
      throw new SubmissionError("Choose an existing source.", 400);
    }
    const source = findEditableSource(
      sourceId,
      await applyStaticManualOverridesToSubmitSources(getStaticSubmitSourcesForUsername(linked.minecraftUsername), linked.minecraftUsername),
    );

    const inserted = await supabaseAdmin
      .from("mmm_submissions")
      .insert({
        user_id: auth.userId,
        minecraft_uuid_hash: linked.minecraftUuidHash,
        minecraft_username: linked.minecraftUsername,
        submission_type: action,
        target_source_id: source.sourceId,
        target_source_slug: source.sourceSlug,
        source_name: source.sourceName,
        source_type: source.sourceType || "server",
        old_blocks_mined: source.currentBlocks,
        submitted_blocks_mined: blocksMined,
        proof_file_name: proof.fileName,
        proof_mime_type: proof.mimeType,
        proof_size: proof.size,
        proof_image_ref: proof.dataUrl,
        logo_url: null,
        status: "pending",
        payload: {
          rank: source.rank,
          lastUpdated: source.lastUpdated,
          createdAt: now,
        },
      })
      .select("*")
      .single();
    if (inserted.error) throw inserted.error;

    return {
      ok: true as const,
      submission: mapSubmission(inserted.data as SubmissionRow),
    };
  }

  if (action === "add-new-source") {
    const name = sanitizeEditableText(String(formData.get("sourceName") ?? ""), 80);
    if (!name) {
      throw new SubmissionError("Source name is required.", 400);
    }
    const type = sourceType(formData.get("sourceType"));
    const logoUrl = sanitizeEditableText(String(formData.get("logoUrl") ?? ""), 240) || null;
    const playerRows = isServerSubmission(type)
      ? parseSubmittedPlayerRows(formData.get("playerRows"))
      : [{
          username: linked.minecraftUsername,
          blocksMined: positiveNumber(blocksMined, "Blocks mined"),
        }];
    if (isServerSubmission(type) && playerRows.length === 0) {
      throw new SubmissionError("Add at least one player row for server submissions.", 400);
    }
    const submittedBlocksMined = playerRows.reduce((sum, row) => sum + row.blocksMined, 0);

    const inserted = await supabaseAdmin
      .from("mmm_submissions")
      .insert({
        user_id: auth.userId,
        minecraft_uuid_hash: linked.minecraftUuidHash,
        minecraft_username: linked.minecraftUsername,
        submission_type: action,
        target_source_id: null,
        target_source_slug: null,
        source_name: name,
        source_type: type,
        old_blocks_mined: null,
        submitted_blocks_mined: submittedBlocksMined,
        proof_file_name: proof.fileName,
        proof_mime_type: proof.mimeType,
        proof_size: proof.size,
        proof_image_ref: proof.dataUrl,
        logo_url: logoUrl,
        status: "pending",
        payload: {
          createdAt: now,
          playerRows,
        },
      })
      .select("*")
      .single();
    if (inserted.error) throw inserted.error;

    return {
      ok: true as const,
      submission: mapSubmission(inserted.data as SubmissionRow),
    };
  }

  throw new SubmissionError("Unsupported submission type.", 400);
}
