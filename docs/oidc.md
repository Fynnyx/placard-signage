# Login with OIDC

Any OpenID Connect provider works. Local accounts keep working unless you set `LOCAL_LOGIN=false`.

1. Create a confidential client (authorization code flow) in your provider.
2. Set the redirect URI to `https://signage.example.org/api/auth/oidc/callback`.
3. Configure the server:

```yaml
OIDC_ISSUER: https://auth.example.org/realms/main
OIDC_CLIENT_ID: placard
OIDC_CLIENT_SECRET: …
OIDC_NAME: Company login          # button label
```

The login page then shows a button for it. The flow uses PKCE, `state` and `nonce`.

## Users and roles

On the first OIDC login, the server looks up the user by OIDC subject, then by e-mail. An invited user with the same e-mail is linked, so you can invite people first and let them log in with OIDC.

Roles come from a claim when you configure one:

```yaml
OIDC_ROLE_CLAIM: roles                                    # claim name, or a dotted path
OIDC_ROLE_MAP: signage-admin=admin,signage-editor=editor  # provider role = app role
```

The claim is looked up in the ID token, then in userinfo, then in the access token. When several provider roles map, the highest app role wins, and the role is updated on every login. Users without a mapped role keep the role an admin set in the dashboard; new ones get `OIDC_DEFAULT_ROLE` (`viewer`, or `none` to refuse them).

With `LOCAL_LOGIN=false` there is no setup wizard. Set `ADMIN_EMAIL` to make that OIDC user the first admin, or map an admin role.

## Provider notes

**Keycloak:** issuer `https://keycloak.example.org/realms/<realm>`. Create realm roles `signage-admin` and `signage-editor`. Realm roles are in the access token by default: `OIDC_ROLE_CLAIM=realm_access.roles`. For client roles use `resource_access.<client-id>.roles`.

**Authentik:** create an OAuth2/OpenID provider and application; issuer `https://authentik.example.org/application/o/<slug>/`. Groups are sent in the `groups` claim: `OIDC_ROLE_CLAIM=groups`, `OIDC_ROLE_MAP=Signage Admins=admin,Signage Editors=editor`.

**Microsoft Entra ID:** issuer `https://login.microsoftonline.com/<tenant-id>/v2.0`. Define app roles (e.g. `Signage.Admin`) in the app registration and assign them: `OIDC_ROLE_CLAIM=roles`, `OIDC_ROLE_MAP=Signage.Admin=admin,Signage.Editor=editor`.

**Google:** issuer `https://accounts.google.com`. Google sends no roles; invite users in the dashboard with the right role before they log in, and set `OIDC_DEFAULT_ROLE=none` so other Google accounts cannot get in.
