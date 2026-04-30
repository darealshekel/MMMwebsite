export const DEFAULT_STEVE_SKIN_FACE_URL = "https://nmsr.nickac.dev/face/Steve";
export const DEFAULT_STEVE_FULLBODY_URL = "https://nmsr.nickac.dev/fullbody/Steve";

function cleanAvatarName(value: unknown) {
  return String(value ?? "").trim();
}

export function buildNmsrFaceUrl(username: unknown) {
  const cleanUsername = cleanAvatarName(username);
  return cleanUsername
    ? `https://nmsr.nickac.dev/face/${encodeURIComponent(cleanUsername)}`
    : DEFAULT_STEVE_SKIN_FACE_URL;
}

export function buildNmsrFullBodyUrl(username: unknown) {
  const cleanUsername = cleanAvatarName(username);
  return cleanUsername
    ? `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(cleanUsername)}`
    : DEFAULT_STEVE_FULLBODY_URL;
}
