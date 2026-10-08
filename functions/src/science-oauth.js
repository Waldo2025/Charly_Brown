const { randomBytes, createHash } = require('node:crypto');
const { authorizationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/authorize.js');
const { tokenHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/token.js');
const { clientRegistrationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/register.js');
const { revocationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/revoke.js');
const { InvalidGrantError, InvalidTokenError, InvalidScopeError, InvalidClientMetadataError, InvalidRequestError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');
const common = require('./common.js');
const SCOPES = ['science:read', 'science:plan', 'science:execute'];
const PREFIX = '/api/science-activities/oauth';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const clean = value => JSON.parse(JSON.stringify(value));
const bad = () => new InvalidGrantError('La autorización expiró, fue revocada o ya se utilizó.');
function validRedirect(value) {
  try { const u = new URL(value); return !u.hash && !u.username && !u.password && (u.protocol === 'https:' || u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)); } catch { return false; }
}
function createScienceOAuthProvider({ db, origin = process.env.SCIENCE_PUBLIC_ORIGIN || 'https://charly-brown.web.app', clock = Date.now }) {
  const root = new URL(origin).origin;
  if (!validRedirect(root)) throw Error('science_oauth_origin_invalid');
  const resource = `${root}/api/science-activities/mcp`;
  const ref = (kind, token) => db.collection('ScienceOAuth').doc(`${kind}-${hash(token)}`);
  const read = async (kind, token) => { const snap = await ref(kind, token).get(); return snap.exists ? snap.data() : null; };
  const live = row => row && !row.revoked && row.expiresAt > clock();
  const audience = value => { if (value && String(value) !== resource) throw new InvalidRequestError('Recurso MCP incorrecto.'); };
  const scopes = values => { const result = values?.length ? [...new Set(values)] : [...SCOPES]; if (result.some(s => !SCOPES.includes(s))) throw new InvalidScopeError('Permiso desconocido.'); return result; };
  async function issue(kind, token, client, redirectUri, requestedResource, requestedScopes) {
    audience(requestedResource);
    const access = `science_${secret()}`, refresh = `science_refresh_${secret()}`;
    return db.runTransaction(async tx => {
      const source = (await tx.get(ref(kind, token))).data();
      if (!live(source) || source.clientId !== client.client_id || (kind === 'code' && source.redirectUri !== redirectUri)) throw bad();
      const familyId = source.familyId || secret();
      const familyRef = ref('family', familyId);
      const family = (await tx.get(familyRef)).data();
      if (family?.revoked || family && family.expiresAt <= clock()) throw bad();
      const selected = requestedScopes || source.scopes;
      if (selected.some(s => !source.scopes.includes(s))) throw new InvalidScopeError('No se pueden ampliar permisos al renovar.');
      const base = { uid: source.uid, clientId: client.client_id, scopes: selected, resource, familyId, revoked: false };
      const familyExpiry = family?.expiresAt || clock() + 30 * 86400000;
      tx.delete(ref(kind, token));
      tx.set(familyRef, { uid: source.uid, clientId: client.client_id, revoked: false, expiresAt: familyExpiry, expiry: new Date(familyExpiry) });
      tx.create(ref('access', access), { ...base, expiresAt: clock() + 3600000, expiry: new Date(clock() + 3600000) });
      tx.create(ref('refresh', refresh), { ...base, expiresAt: familyExpiry, expiry: new Date(familyExpiry) });
      return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: selected.join(' ') };
    });
  }
  return {
    root, resource,
    clientsStore: {
      async getClient(id) { return await read('client', id) || undefined; },
      async registerClient(client) {
        if (client.token_endpoint_auth_method !== 'none') throw new InvalidClientMetadataError('Utiliza un cliente público con PKCE (token_endpoint_auth_method=none).');
        if (!client.redirect_uris?.length || client.redirect_uris.length > 10 || !client.redirect_uris.every(validRedirect)) throw new InvalidClientMetadataError('Las redirecciones deben ser HTTPS o loopback local, sin fragmentos.');
        const result = clean({ ...client, client_name: String(client.client_name || 'Cliente MCP').slice(0, 120), client_id: secret(), client_id_issued_at: Math.floor(clock() / 1000), token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
        delete result.client_secret; delete result.client_secret_expires_at;
        await ref('client', result.client_id).create(result); return result;
      }
    },
    async authorize(client, params, res) {
      audience(params.resource);
      if (!client.redirect_uris.includes(params.redirectUri) || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge || '')) throw new InvalidRequestError('Redirección o PKCE inválido.');
      const id = secret();
      await ref('request', id).create({ clientId: client.client_id, clientName: client.client_name, redirectUri: params.redirectUri, state: params.state || '', codeChallenge: params.codeChallenge, scopes: scopes(params.scopes), expiresAt: clock() + 600000, expiry: new Date(clock() + 600000) });
      res.redirect(`${root}/science-mcp-consent.html?request=${encodeURIComponent(id)}`);
    },
    async describeRequest(id) {
      const row = await read('request', id); if (!live(row)) throw bad();
      return { clientName: row.clientName, redirectUri: row.redirectUri, scopes: row.scopes };
    },
    async consent(id, uid, allow) {
      const code = secret();
      return db.runTransaction(async tx => {
        const requestRef = ref('request', id), row = (await tx.get(requestRef)).data();
        if (!live(row)) throw bad();
        const redirect = new URL(row.redirectUri);
        if (row.state) redirect.searchParams.set('state', row.state);
        tx.delete(requestRef);
        if (allow) { tx.create(ref('code', code), { ...row, uid, expiresAt: clock() + 120000, expiry: new Date(clock() + 120000) }); redirect.searchParams.set('code', code); }
        else redirect.searchParams.set('error', 'access_denied');
        return redirect.href;
      });
    },
    async challengeForAuthorizationCode(client, code) { const row = await read('code', code); if (!live(row) || row.clientId !== client.client_id) throw bad(); return row.codeChallenge; },
    async exchangeAuthorizationCode(client, code, _verifier, redirectUri, target) { return issue('code', code, client, redirectUri, target); },
    async exchangeRefreshToken(client, token, selected, target) { return issue('refresh', token, client, null, target, selected); },
    async verifyAccessToken(token) {
      const row = await read('access', token);
      if (!live(row) || row.resource !== resource || !live(await read('family', row.familyId))) throw new InvalidTokenError('Token expirado o revocado.');
      return { token, clientId: row.clientId, scopes: row.scopes, expiresAt: Math.floor(row.expiresAt / 1000), resource: new URL(resource), extra: { uid: row.uid } };
    },
    async revokeToken(client, request) {
      const kind = String(request.token).startsWith('science_refresh_') ? 'refresh' : 'access';
      const row = await read(kind, request.token);
      if (row?.clientId === client.client_id) await ref('family', row.familyId).set({ revoked: true }, { merge: true });
    },
    async revokeGrant(uid, familyId) {
      await db.runTransaction(async tx => { const r = ref('family', familyId), row = (await tx.get(r)).data(); if (!row || row.uid !== uid) throw bad(); tx.update(r, { revoked: true }); });
    }
  };
}
function registerScienceOAuthRoutes(app, dependencies = {}) {
  let provider;
  const getProvider = () => provider ||= createScienceOAuthProvider({ ... (dependencies.getAdminServices || common.getAdminServices)(), origin: dependencies.origin });
  // Construct SDK rate limiters once while deferring credentials until an actual operation.
  const lazyProvider = Object.fromEntries(['authorize', 'challengeForAuthorizationCode', 'exchangeAuthorizationCode', 'exchangeRefreshToken', 'verifyAccessToken', 'revokeToken'].map(name => [name, (...args) => getProvider()[name](...args)]));
  lazyProvider.clientsStore = Object.fromEntries(['getClient', 'registerClient'].map(name => [name, (...args) => getProvider().clientsStore[name](...args)]));
  for (const [path, factory, key] of [['authorize', authorizationHandler, 'provider'], ['token', tokenHandler, 'provider'], ['register', clientRegistrationHandler, 'clientsStore'], ['revoke', revocationHandler, 'provider']]) {
    app.use(`${PREFIX}/${path}`, factory({ [key]: key === 'clientsStore' ? lazyProvider.clientsStore : lazyProvider }));
  }
  const wrap = dependencies.asyncRoute || common.asyncRoute;
  const firebaseAuth = dependencies.resolveAuthContext || common.resolveAuthContext;
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    const p = getProvider(); res.json({ issuer: p.root, authorization_endpoint: `${p.root}${PREFIX}/authorize`, token_endpoint: `${p.root}${PREFIX}/token`, registration_endpoint: `${p.root}${PREFIX}/register`, revocation_endpoint: `${p.root}${PREFIX}/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: SCOPES });
  });
  const resourceMetadataPath = '/.well-known/oauth-protected-resource/api/science-activities/mcp';
  app.get(resourceMetadataPath, (_req, res) => { const p = getProvider(); res.json({ resource: p.resource, authorization_servers: [p.root], scopes_supported: SCOPES, resource_name: 'Actividades científicas' }); });
  app.get(`${PREFIX}/request/:id`, wrap(async (req, res) => { await firebaseAuth(req); res.json(await getProvider().describeRequest(req.params.id)); }));
  app.post(`${PREFIX}/consent`, wrap(async (req, res) => { const actor = await firebaseAuth(req); if (typeof req.body?.allow !== 'boolean') throw new InvalidRequestError('Decisión requerida.'); res.json({ redirect: await getProvider().consent(String(req.body.request || ''), actor.uid, req.body.allow) }); }));
  app.post(`${PREFIX}/disconnect`, wrap(async (req, res) => { const actor = await firebaseAuth(req); await getProvider().revokeGrant(actor.uid, String(req.body?.grantId || '')); res.json({ ok: true }); }));
  return {
    async resolveMcpAuth(req) {
      const token = common.getBearerToken(req);
      if (!token.startsWith('science_')) return firebaseAuth(req);
      try { const auth = await getProvider().verifyAccessToken(token); return { uid: auth.extra.uid, role: '', token: {}, external: true, scopes: auth.scopes }; }
      catch { throw Object.assign(new Error('invalid_mcp_token'), { status: 401 }); }
    },
    resourceMetadataUrl: `${new URL(dependencies.origin || process.env.SCIENCE_PUBLIC_ORIGIN || 'https://charly-brown.web.app').origin}${resourceMetadataPath}`
  };
}
module.exports = { createScienceOAuthProvider, registerScienceOAuthRoutes, validRedirect, SCOPES };
