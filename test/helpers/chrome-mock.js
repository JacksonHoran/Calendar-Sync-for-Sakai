// Minimal in-memory stand-in for the chrome.* APIs the extension's modules use, so sync.js,
// sakai.js, and gcal.js can run under node:test. Install a fresh one per test.

function createStorageArea() {
  let data = {};
  return {
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(items) {
      data = { ...data, ...structuredClone(items) };
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
    dump: () => structuredClone(data),
  };
}

export function installChromeMock({ token = "token-1", grantToken = true } = {}) {
  const state = {
    token,
    grantToken,
    removedTokens: [],
    cachedToken: null, // like Chrome, getAuthToken keeps returning this until it's removed
    tokenRequests: [],
    badge: { text: "", title: "", color: null },
  };

  globalThis.chrome = {
    storage: { local: createStorageArea(), session: createStorageArea() },
    identity: {
      async getAuthToken({ interactive }) {
        state.tokenRequests.push({ interactive });
        if (!state.grantToken) throw new Error("The user is not signed in.");
        state.cachedToken ??= state.token;
        return { token: state.cachedToken };
      },
      async removeCachedAuthToken({ token: removed }) {
        state.removedTokens.push(removed);
        if (state.cachedToken === removed) state.cachedToken = null;
      },
    },
    action: {
      async setBadgeText({ text }) { state.badge.text = text; },
      async setTitle({ title }) { state.badge.title = title; },
      async setBadgeBackgroundColor({ color }) { state.badge.color = color; },
    },
  };
  return state;
}
