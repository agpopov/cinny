# nginx configuration

## Insert wasm type into nginx mime.types file so they load correctly.

`/etc/nginx/mime.types`:

```
types {
..
    application/wasm                      wasm;
..
}
```

## Production security headers

The production build generates `dist/security-headers.conf` from
`security/csp.mjs`. After deploying that build, include the generated file inside
the HTTPS `server` block (or the application `location` if it defines its own
`add_header` directives):

```nginx
include /opt/cinny/dist/security-headers.conf;
```

For the Docker image the path is
`/usr/share/nginx/html/security-headers.conf`. Validate nginx configuration before
reloading it. Netlify can use the generated `dist/_headers` directly.

The main HTML and embedded Element Call also carry a CSP meta tag. The HTTP
header additionally enforces `frame-ancestors`. Development HMR is not subject
to this production policy. Keep reCAPTCHA paths, WASM, blob workers and the
bootstrap hashes when adapting the policy. Synchronize the native Tauri CSP
when changing the application's or embedded Call's bootstrap scripts.
