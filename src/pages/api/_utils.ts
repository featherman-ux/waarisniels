// Shared JSON + CORS helper
export function jsonResponse(
  body: unknown,
  status = 200,
  allowOrigin = '*'
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

/**
 * Tweede slot op /api/admin, náást Cloudflare Access.
 *
 * Access is gekoppeld aan de hostnaam waarisniels.nl en geldt dus NIET voor de
 * *.waarisniels.pages.dev-URL's van preview-deployments — en die binden aan
 * dezelfde productie-D1 (zie docs/cloudflare-setup.md §4). Zonder deze check is
 * elk admin-endpoint op zo'n preview-URL onbeschermd, inclusief het versturen
 * van een mail naar de hele lijst.
 *
 * Access zet bij elk doorgelaten verzoek een Cf-Access-Jwt-Assertion-header. Die
 * header ontbreekt op pages.dev, dus de aanwezigheid ervan sluit het gat al. Dit
 * is bewust géén volledige JWT-validatie: Access blijft de echte
 * authenticatie, dit voorkomt alleen dat je er via een andere hostnaam omheen loopt.
 * Wil je het strenger, dan is de volgende stap de handtekening verifiëren tegen
 * https://<team>.cloudflareaccess.com/cdn-cgi/access/certs.
 *
 * Retourneert een Response als het verzoek geweigerd moet worden, anders null.
 */
export function requireAccess(context: {
  request: Request;
  url: URL;
}): Response | null {
  if (context.request.headers.get('Cf-Access-Jwt-Assertion')) return null;

  // Lokale ontwikkeling heeft geen Access ervoor staan. Deze hostnamen zijn via
  // het Cloudflare-netwerk niet te bereiken, dus dit opent niets in productie.
  const host = context.url.hostname;
  const isLocal =
    import.meta.env.DEV ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost');
  if (isLocal) return null;

  return jsonResponse(
    {
      error:
        'Niet toegestaan. Dit endpoint is alleen bereikbaar via waarisniels.nl, achter Cloudflare Access.',
    },
    403
  );
}
