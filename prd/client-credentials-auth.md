# PRD: Client Credentials Grant Authentication

## Overview

Add support for Shopify's OAuth 2.0 client credentials grant flow as an alternative authentication method. This enables the backup tool to work with apps created in Shopify's new Dev Dashboard, which no longer provides static Admin API access tokens (`shpat_`).

### Current State

| Auth Method | Token Type | Expiration | Status |
|-------------|------------|------------|--------|
| Static Access Token | `shpat_*` | Never | ✅ Supported |
| Client Credentials | Dynamic | 24 hours | ❌ Not supported |

### Problem

As of January 1, 2026, Shopify no longer allows creating new "legacy custom apps" in the store admin. New apps must be created in the Dev Dashboard, which uses OAuth flows instead of static tokens:

- **Legacy apps** (pre-2026): Provide permanent `shpat_*` tokens
- **Dev Dashboard apps** (2026+): Require client credentials grant to obtain short-lived tokens

Users with only Dev Dashboard apps cannot use shopify-backup without this feature.

### Goals

1. Support client credentials grant authentication alongside existing static tokens
2. Automatically refresh tokens before they expire during long-running backups
3. Maintain backward compatibility with existing `SHOPIFY_ACCESS_TOKEN` config
4. Clear error messages when credentials are invalid or misconfigured

### Success Metrics

- Backup completes successfully using client credentials auth
- Token refresh happens automatically without user intervention
- Existing deployments using `SHOPIFY_ACCESS_TOKEN` continue to work unchanged
- All existing tests pass

---

## Technical Approach

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Startup                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ SHOPIFY_ACCESS_TOKEN   │
              │ provided?              │
              └────────────────────────┘
                    │           │
                   Yes          No
                    │           │
                    ▼           ▼
              ┌──────────┐  ┌────────────────────────┐
              │ Use      │  │ SHOPIFY_CLIENT_ID &    │
              │ static   │  │ SHOPIFY_CLIENT_SECRET  │
              │ token    │  │ provided?              │
              └──────────┘  └────────────────────────┘
                                  │           │
                                 Yes          No
                                  │           │
                                  ▼           ▼
                            ┌──────────┐  ┌──────────┐
                            │ Exchange │  │ Error:   │
                            │ for      │  │ Missing  │
                            │ token    │  │ config   │
                            └──────────┘  └──────────┘
                                  │
                                  ▼
                            ┌──────────────────┐
                            │ Store token +    │
                            │ expiry timestamp │
                            └──────────────────┘
```

### Token Refresh Strategy

Client credentials tokens expire after 24 hours. For typical daily backups, a single token fetch at startup is sufficient. However, for safety:

1. Fetch token at startup
2. Store expiry timestamp (`issued_at + expires_in - 5 minutes buffer`)
3. Before each API call, check if token is expired or expiring soon
4. If expired, fetch new token before proceeding

### Shopify Token Endpoint

```
POST https://{store}.myshopify.com/admin/oauth/access_token
Content-Type: application/json

{
  "client_id": "{client_id}",
  "client_secret": "{client_secret}",
  "grant_type": "client_credentials"
}
```

**Response:**
```json
{
  "access_token": "shpca_xxxxx",
  "token_type": "bearer",
  "expires_in": 86400,
  "scope": "read_products read_orders read_customers read_content"
}
```

Note: Client credentials tokens start with `shpca_` (not `shpat_`).

---

## Environment Variables

### New Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOPIFY_CLIENT_ID` | No* | -- | OAuth client ID from Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | No* | -- | OAuth client secret from Dev Dashboard |

*Required if `SHOPIFY_ACCESS_TOKEN` is not provided.

### Updated Precedence

1. If `SHOPIFY_ACCESS_TOKEN` is set → use static token (existing behavior)
2. Else if `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` are set → use client credentials
3. Else → error with helpful message

### Example Configurations

**Static token (legacy apps):**
```env
SHOPIFY_STORE=my-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
```

**Client credentials (Dev Dashboard apps):**
```env
SHOPIFY_STORE=my-store.myshopify.com
SHOPIFY_CLIENT_ID=xxxxx
SHOPIFY_CLIENT_SECRET=xxxxx
```

---

## Implementation

### New Files

```
src/
├── auth/
│   ├── index.ts              # Auth module exports
│   ├── types.ts              # Auth-related types
│   ├── token-manager.ts      # Token storage, refresh logic
│   └── client-credentials.ts # OAuth token exchange
```

### Type Definitions

```typescript
// src/auth/types.ts

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ManagedToken {
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface AuthConfig {
  store: string;
  // Static token auth
  accessToken?: string;
  // Client credentials auth
  clientId?: string;
  clientSecret?: string;
}

export type AuthMethod = 'static' | 'client_credentials';
```

### Token Manager

```typescript
// src/auth/token-manager.ts

export class TokenManager {
  private token: ManagedToken | null = null;
  private authMethod: AuthMethod;

  constructor(private config: AuthConfig) {
    this.authMethod = this.determineAuthMethod();
  }

  private determineAuthMethod(): AuthMethod {
    if (this.config.accessToken) {
      return 'static';
    }
    if (this.config.clientId && this.config.clientSecret) {
      return 'client_credentials';
    }
    throw new AuthConfigError(
      'Missing authentication credentials. Provide either:\n' +
      '  - SHOPIFY_ACCESS_TOKEN (for legacy custom apps)\n' +
      '  - SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (for Dev Dashboard apps)'
    );
  }

  async getAccessToken(): Promise<string> {
    if (this.authMethod === 'static') {
      return this.config.accessToken!;
    }

    if (this.isTokenValid()) {
      return this.token!.accessToken;
    }

    await this.refreshToken();
    return this.token!.accessToken;
  }

  private isTokenValid(): boolean {
    if (!this.token) return false;
    // Consider token invalid 5 minutes before actual expiry
    const bufferMs = 5 * 60 * 1000;
    return this.token.expiresAt.getTime() - bufferMs > Date.now();
  }

  private async refreshToken(): Promise<void> {
    const response = await exchangeClientCredentials({
      store: this.config.store,
      clientId: this.config.clientId!,
      clientSecret: this.config.clientSecret!,
    });

    this.token = {
      accessToken: response.access_token,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
      scopes: response.scope.split(' '),
    };

    logger.info(`Token refreshed, expires at ${this.token.expiresAt.toISOString()}`);
  }

  getAuthMethod(): AuthMethod {
    return this.authMethod;
  }
}
```

### Client Credentials Exchange

```typescript
// src/auth/client-credentials.ts

interface ExchangeParams {
  store: string;
  clientId: string;
  clientSecret: string;
}

export async function exchangeClientCredentials(
  params: ExchangeParams
): Promise<TokenResponse> {
  const url = `https://${params.store}/admin/oauth/access_token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new AuthError(
      `Failed to exchange client credentials: ${response.status} ${error}`
    );
  }

  return response.json();
}
```

### Integration with Existing Code

Update `src/shopify/client.ts` to use TokenManager:

```typescript
// Before
export function createShopifyClient(store: string, accessToken: string) {
  return new ShopifyClient(store, accessToken);
}

// After
export async function createShopifyClient(config: AuthConfig) {
  const tokenManager = new TokenManager(config);
  const accessToken = await tokenManager.getAccessToken();
  return new ShopifyClient(config.store, accessToken, tokenManager);
}
```

Update `src/index.ts` entry point:

```typescript
// Before
const client = createShopifyClient(
  process.env.SHOPIFY_STORE!,
  process.env.SHOPIFY_ACCESS_TOKEN!
);

// After
const client = await createShopifyClient({
  store: process.env.SHOPIFY_STORE!,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
});
```

---

## Acceptance Criteria

### Configuration
- [ ] Accepts `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` env vars
- [ ] Falls back to `SHOPIFY_ACCESS_TOKEN` if present (backward compatible)
- [ ] Clear error message if no valid auth config provided
- [ ] Validates required scopes on token exchange

### Token Management
- [ ] Exchanges credentials for access token at startup
- [ ] Stores token with expiry timestamp
- [ ] Refreshes token automatically if expired (handles long backups)
- [ ] 5-minute buffer before actual expiry for refresh

### Error Handling
- [ ] Helpful error for invalid credentials (401)
- [ ] Helpful error for insufficient scopes (403)
- [ ] Retry logic for transient network errors
- [ ] Graceful handling of token endpoint unavailability

### Documentation
- [ ] README updated with new env vars
- [ ] Example `.env` shows both auth methods
- [ ] PRD.md updated with new config options

---

## Work Items

### Phase 1: Core Auth Module

#### WI-040: Create auth types and interfaces
- Create `src/auth/types.ts` with `TokenResponse`, `ManagedToken`, `AuthConfig`
- Create `AuthError` and `AuthConfigError` custom errors
- Export from `src/auth/index.ts`

#### WI-041: Implement client credentials exchange
- Create `src/auth/client-credentials.ts`
- Implement `exchangeClientCredentials()` function
- Handle error responses with clear messages
- Add retry logic for network errors

#### WI-042: Implement TokenManager class
- Create `src/auth/token-manager.ts`
- Implement auth method detection logic
- Implement token caching and refresh
- Add logging for token lifecycle events

### Phase 2: Integration

#### WI-043: Update ShopifyClient to use TokenManager
- Modify `src/shopify/client.ts` constructor
- Pass TokenManager for dynamic token access
- Update method signatures as needed

#### WI-044: Update entry point and config loading
- Modify `src/index.ts` to use new auth config
- Load new env vars (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`)
- Validate config at startup

#### WI-045: Update GraphQL client for token refresh
- Ensure GraphQL client can get fresh token before requests
- Handle 401 responses by refreshing token and retrying

### Phase 3: Testing

#### WI-046: Unit tests for auth module
- Test `TokenManager` auth method detection
- Test token refresh logic
- Test error handling for invalid credentials
- Mock token exchange endpoint

#### WI-047: Integration tests
- Test full backup flow with mocked OAuth
- Test backward compatibility with static token
- Test token refresh during long-running backup

### Phase 4: Documentation

#### WI-048: Update documentation
- Update README.md with new env vars
- Update `.env.example` with both auth methods
- Update PRD.md environment variables section
- Add troubleshooting section for auth errors

---

## Dependencies

```
WI-040 (types)
   │
   ├── WI-041 (exchange) ──┐
   │                       │
   └── WI-042 (manager) ───┴── WI-043 (client) ── WI-044 (entry) ── WI-045 (graphql)
                                                                          │
                                                        ┌─────────────────┴─────────────────┐
                                                        │                                   │
                                                   WI-046 (unit tests)              WI-047 (integration)
                                                        │                                   │
                                                        └─────────────────┬─────────────────┘
                                                                          │
                                                                   WI-048 (docs)
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token expires mid-backup | High | Implement proactive refresh with 5-min buffer |
| OAuth endpoint rate limits | Medium | Add exponential backoff on 429 responses |
| Scope mismatch | Medium | Validate scopes on token fetch, warn if missing |
| Breaking change for existing users | High | Maintain full backward compatibility with `SHOPIFY_ACCESS_TOKEN` |
| Client secret exposure in logs | High | Never log credentials, only log token metadata |

---

## Testing Strategy

1. **Unit tests**: Mock OAuth endpoint, test all TokenManager branches
2. **Integration tests**: Full backup with mock OAuth server
3. **Manual test**: Test against real Shopify Dev Dashboard app
4. **Backward compatibility test**: Verify existing `SHOPIFY_ACCESS_TOKEN` still works

---

## Rollout Plan

1. Implement auth module with feature flag (default: enabled)
2. Test with Dev Dashboard app in development
3. Update documentation
4. Release as minor version (backward compatible)
5. Monitor for auth-related errors in production
6. Update existing deployment docs to recommend client credentials for new setups

---

## Future Considerations

- **Token persistence**: For serverless deployments, consider storing token in external cache (Redis) to avoid re-auth on each invocation
- **Scope validation**: Warn users if token scopes don't include required permissions
- **Multiple stores**: If supporting multiple stores, each would need separate TokenManager instances
