export const SSP_SOURCE_LOGO_HASH = "53af69d6f765a123be8e19bb6486fca6";
export const HSP_SOURCE_LOGO_HASH = "3f71b13fd1b931f6387851f2bf31db02";

export const SSP_SOURCE_LOGO_URL = `/generated/mmm-source-logos/${SSP_SOURCE_LOGO_HASH}.png`;
export const HSP_SOURCE_LOGO_URL = `/generated/mmm-source-logos/${HSP_SOURCE_LOGO_HASH}.png`;

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSourceLabel(value) {
  return stringValue(value).replace(/\s+/g, " ").toLowerCase();
}

function sourceName(source) {
  return normalizeSourceLabel(
    source?.displayName
      ?? source?.sourceName
      ?? source?.server
      ?? source?.name
      ?? "",
  );
}

function compactSourceName(source) {
  return sourceName(source).replace(/[^a-z0-9]/g, "");
}

function sourceType(source) {
  return normalizeSourceLabel(source?.sourceType ?? source?.type ?? "");
}

function sourceScope(source) {
  return normalizeSourceLabel(source?.sourceScope ?? source?.scope ?? "");
}

function sourceCategory(source) {
  return normalizeSourceLabel(source?.sourceCategory ?? source?.category ?? "");
}

function logoValue(source) {
  return stringValue(source?.logoUrl ?? source?.iconUrl ?? source?.sourceLogoUrl ?? "");
}

function sourceSymbolHash(source) {
  return normalizeSourceLabel(source?.sourceSymbolHash ?? source?.symbolHash ?? "");
}

export function isExplicitServerSource(source) {
  const type = sourceType(source);
  const category = sourceCategory(source);
  const scope = sourceScope(source);
  return type === "server"
    || type === "private-server"
    || type === "private_server"
    || type === "private server"
    || type === "multiplayer"
    || category === "server"
    || category === "private-server"
    || category === "private_server"
    || category === "private server"
    || scope === "public_server"
    || scope === "private_server_digs"
    || compactSourceName(source) === "narutakusmp";
}

export function isIndividualWorldDigsSource(source) {
  return /^individual world digs(?:\s*(?:\(\d+\)|\d+))?$/.test(sourceName(source));
}

function isNamedSspWorldSource(source) {
  return /^ssp world(?:\s*(?:\(\d+\)|\d+))?$/.test(sourceName(source));
}

function isNamedHspWorldSource(source) {
  return /^hsp world(?:\s*(?:\(\d+\)|\d+))?$/.test(sourceName(source));
}

function isNamedUnlabeledSingleplayerWorldSource(source) {
  return /^unlabeled world(?:\s*(?:\(\d+\)|\d+))?$/.test(sourceName(source));
}

export function isHspSource(source) {
  if (isExplicitServerSource(source)) return false;
  const type = sourceType(source);
  const category = sourceCategory(source);
  const logo = logoValue(source);
  const symbolHash = sourceSymbolHash(source);
  return type === "hsp"
    || type === "hardcore"
    || category === "hsp"
    || category === "hardcore"
    || isNamedHspWorldSource(source)
    || symbolHash === HSP_SOURCE_LOGO_HASH
    || logo.includes(`${HSP_SOURCE_LOGO_HASH}.png`);
}

export function isSspSource(source) {
  if (isExplicitServerSource(source)) return false;
  const type = sourceType(source);
  const scope = sourceScope(source);
  const category = sourceCategory(source);
  const logo = logoValue(source);
  const symbolHash = sourceSymbolHash(source);
  if (isHspSource(source)) return false;
  return type === "ssp"
    || type === "singleplayer"
    || category === "ssp"
    || category === "singleplayer"
    || category === "ssp-hsp"
    || scope === "ssp_hsp"
    || scope === "private_singleplayer"
    || isNamedSspWorldSource(source)
    || isNamedUnlabeledSingleplayerWorldSource(source)
    || symbolHash === SSP_SOURCE_LOGO_HASH
    || logo.includes(`${SSP_SOURCE_LOGO_HASH}.png`);
}

export function isSspHspSource(source) {
  return isSspSource(source) || isHspSource(source);
}

export function shouldShowInPrivateServerDigs(source) {
  return !isIndividualWorldDigsSource(source) && !isSspHspSource(source);
}

export function specialLeaderboardLabel(kind) {
  const normalized = normalizeSourceLabel(kind);
  if (normalized === "hsp") return "HSP";
  if (normalized === "ssp") return "SSP";
  return "SSP/HSP";
}

export function specialLeaderboardIconKey(kind) {
  return normalizeSourceLabel(kind) === "hsp" ? "hsp" : "ssp";
}
