function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function startMicrosoftSignIn(returnTo = "/dashboard") {
  const redirectTo = `/api/auth/microsoft/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
  console.info("[auth] starting Microsoft sign-in", { returnTo: safeReturnTo(returnTo) });
  window.location.assign(redirectTo);
}

export function clearPendingLoginState() {
}

export async function signOutEverywhere() {
  window.location.assign("/api/auth/logout");
}
